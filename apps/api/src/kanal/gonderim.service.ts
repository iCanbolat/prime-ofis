import { TransactionHost } from "@nestjs-cls/transactional"
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, count, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm"

import { kanalHazir, adresMaskele } from "@prime/shared/kanal/kurallar"
import type { GonderimListResponse } from "@prime/shared/types/api"
import type {
  Gonderim,
  GonderimDurumu,
  GonderimKaynak,
  KanalTip,
} from "@prime/shared/types/domain"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { sayfaParametreleri } from "../core/sayfala.js"
import { DB, type DrizzleTx, type Veritabani } from "../db/db.module.js"
import { arsivDosya, gonderim, mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"
import { arsivAnahtari } from "../dosya/dosya.service.js"
import { DosyaDeposu } from "../storage/dosya-deposu.js"
import { KanalService, type HazirKanal } from "./kanal.service.js"
import { KanalSaglayici, type SunucuMesaji } from "./saglayici.js"

export const GONDERIM_ISI = "gonderim"
/** İlk gönderim dahil en çok deneme; geçici hatalarda üstel bekleme (1, 2, 4, 8 dk) */
export const EN_FAZLA_DENEME = 5
/** Gönderim sürerken satır kiralanır; süreç çökerse bu süre sonunda yeniden denenir */
const KIRA_DK = 10
const PARTI = 20

export interface YeniGonderim {
  kanal: KanalTip
  aliciTip: Gonderim["aliciTip"]
  aliciId: string
  aliciAd: string
  /** Gerçek adres (yanıtlara girmez; `adres` maskeli tutulur) */
  hedefAdres: string
  konu: string
  metin: string
  sablon?: Gonderim["sablon"]
  parametreler?: string[]
  ekArsivDosyaId?: string
  kaynak: GonderimKaynak
  kaynakId?: string
  gonderenId?: string
  /** Tekilleştirme (aynı bildirim → aynı kişi → aynı kanal bir kez) */
  anahtar?: string
}

type GonderimSatiri = typeof gonderim.$inferSelect

export function gonderimSatirindan(s: GonderimSatiri): Gonderim {
  const {
    hedefAdres: _a,
    metin: _m,
    parametreler: _p,
    ekArsivDosyaId: _e,
    sonrakiDeneme: _s,
    saglayiciId: _sg,
    anahtar: _an,
    ...rest
  } = s
  return nullsuz(rest) as Gonderim
}

export interface GonderimListeSorgusu {
  kanal?: string
  durum?: string
  aliciTip?: string
  kaynak?: string
  sayfa?: string
  sayfaBoyutu?: string
}

/**
 * Dış kanal outbox'ı. Satırlar `KUYRUKTA` yazılır; `gonderim` işi (her dakika + yazmadan sonra
 * tetiklenir) sırası gelenleri kiralayıp sağlayıcıya verir. Geçici hata → üstel bekleme ile
 * yeniden; kalıcı hata ya da son deneme → `HATA`. Test mesajı ve elle yeniden deneme senkrondur.
 */
@Injectable()
export class GonderimService implements OnModuleInit {
  private readonly logger = new Logger(GonderimService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    @Inject(DB) private readonly db: Veritabani,
    @Inject(ENV) private readonly env: Env,
    private readonly kanallar: KanalService,
    private readonly saglayici: KanalSaglayici,
    private readonly depo: DosyaDeposu,
    private readonly isler: IsKuyrugu,
    private readonly saat: Saat,
    private readonly seed: SeedYukleyici
  ) {}

  onModuleInit() {
    this.isler.tanimla(
      GONDERIM_ISI,
      async () => {
        const n = await this.bekleyenleriIsle()
        if (n) this.logger.log(`${n} gönderim işlendi`)
      },
      { cron: "* * * * *" }
    )
    this.seed.adimEkle(async (state, db) => {
      if (!state.gonderim.length) return
      await db.insert(gonderim).values(
        state.gonderim.map((g) => ({ ...g, metin: g.ozet, hedefAdres: null }))
      )
    })
  }

  /** Satırları `KUYRUKTA` ekler (çağıranın transaction'ında); aynı `anahtar` atlanır */
  async kuyrugaAl(yeniler: YeniGonderim[]): Promise<Gonderim[]> {
    if (!yeniler.length) return []
    const simdi = this.saat.simdiIso()
    const satirlar = await this.txHost.tx
      .insert(gonderim)
      .values(yeniler.map((y) => this.satir(y, "KUYRUKTA", simdi)))
      .onConflictDoNothing()
      .returning()
    this.tetikle()
    return satirlar.map(gonderimSatirindan)
  }

  /** Kanal yapılandırılmadığı için kullanıcının wa.me / mailto ile gönderdiği kayıt */
  async elleYaz(yeni: YeniGonderim): Promise<Gonderim> {
    const [s] = await this.txHost.tx
      .insert(gonderim)
      .values(this.satir(yeni, "ELLE", this.saat.simdiIso()))
      .returning()
    return gonderimSatirindan(s!)
  }

  /** Kanal testi: kayıt yazılır ve hemen gönderilir */
  async hemenGonder(yeni: YeniGonderim, kanal: HazirKanal): Promise<Gonderim> {
    const [s] = await this.txHost.tx
      .insert(gonderim)
      .values({ ...this.satir(yeni, "KUYRUKTA", this.saat.simdiIso()), denemeSayisi: 1 })
      .returning()
    return this.gonder(s!, kanal)
  }

  /** İşin gövdesi; işlenen satır sayısı. Testler de doğrudan çağırır. */
  async bekleyenleriIsle(): Promise<number> {
    let toplam = 0
    let kanallar: Map<KanalTip, HazirKanal> | null = null
    for (;;) {
      const parti = await this.kirala()
      if (!parti.length) return toplam
      kanallar ??= await this.kanallar.hazirKanallar()
      for (const s of parti) {
        const kanal = kanallar.get(s.kanal)
        if (kanal) await this.gonder(s, kanal)
        else await this.sonuclandir(s, { basarili: false, hataMesaji: "Kanal kullanılamıyor" })
      }
      toplam += parti.length
    }
  }

  /** Yazmadan sonra işi hemen çalıştırır (satırlar commit edilmemişse bir sonraki dakikada) */
  tetikle() {
    if (!this.env.JOB_WORKERS) return
    void this.isler
      .gonder(GONDERIM_ISI, {}, { singletonKey: "tetik", startAfter: 2 })
      .catch((e: unknown) => this.logger.warn(`Gönderim işi tetiklenemedi: ${String(e)}`))
  }

  async liste(sorgu: GonderimListeSorgusu): Promise<GonderimListResponse> {
    const kosullar: SQL[] = []
    if (sorgu.kanal) kosullar.push(eq(gonderim.kanal, sorgu.kanal as KanalTip))
    if (sorgu.durum) kosullar.push(eq(gonderim.durum, sorgu.durum as GonderimDurumu))
    if (sorgu.aliciTip)
      kosullar.push(eq(gonderim.aliciTip, sorgu.aliciTip as Gonderim["aliciTip"]))
    if (sorgu.kaynak) kosullar.push(eq(gonderim.kaynak, sorgu.kaynak as GonderimKaynak))
    const tx = this.txHost.tx
    const yediGun = new Date(this.saat.simdi().getTime() - 7 * 864e5).toISOString()
    const [[toplam], [hatali]] = await Promise.all([
      tx.select({ n: count() }).from(gonderim).where(and(...kosullar)),
      tx
        .select({ n: count() })
        .from(gonderim)
        .where(and(eq(gonderim.durum, "HATA"), gte(gonderim.zaman, yediGun))),
    ])
    const total = toplam?.n ?? 0
    const { sayfa, sayfaBoyutu, offset } = sayfaParametreleri(sorgu, total)
    const satirlar = await tx
      .select()
      .from(gonderim)
      .where(and(...kosullar))
      .orderBy(desc(gonderim.zaman), desc(gonderim.id))
      .limit(sayfaBoyutu)
      .offset(offset)
    return {
      items: satirlar.map(gonderimSatirindan),
      total,
      sayfa,
      sayfaBoyutu,
      hataliSon7Gun: hatali?.n ?? 0,
    }
  }

  /** Hatalı gönderimi alıcının güncel adresiyle hemen yeniden dener */
  async tekrar(id: string): Promise<Gonderim> {
    const [g] = await this.txHost.tx.select().from(gonderim).where(eq(gonderim.id, id))
    if (!g) throw new NotFoundException({ message: "Gönderim bulunamadı" })
    if (g.durum !== "HATA")
      throw new ConflictException({ message: "Yalnızca hatalı gönderim yeniden denenir" })
    const kanal = (await this.kanallar.hazirKanallar()).get(g.kanal)
    if (!kanal || !kanalHazir(kanal.ayar))
      throw new ConflictException({ message: "Kanal kullanılamıyor" })
    const hedefAdres = await this.aliciAdresi(g)
    const [kiralanan] = await this.txHost.tx
      .update(gonderim)
      .set({
        durum: "KUYRUKTA",
        hedefAdres: hedefAdres ?? "",
        denemeSayisi: sql`${gonderim.denemeSayisi} + 1`,
        sonrakiDeneme: null,
      })
      .where(and(eq(gonderim.id, id), eq(gonderim.durum, "HATA")))
      .returning()
    if (!kiralanan)
      throw new ConflictException({ message: "Yalnızca hatalı gönderim yeniden denenir" })
    return this.gonder(kiralanan, kanal, { sonDeneme: true })
  }

  /** Sağlayıcı webhook'u (teslim / hata) */
  async saglayiciDurumu(saglayiciId: string, durum: "GONDERILDI" | "HATA", hataMesaji?: string) {
    await this.db
      .update(gonderim)
      .set({ durum, hataMesaji: hataMesaji ?? null })
      .where(eq(gonderim.saglayiciId, saglayiciId))
  }

  // --- İç işler ----------------------------------------------------------------------

  private satir(y: YeniGonderim, durum: GonderimDurumu, zaman: string) {
    return {
      id: newId("gn"),
      kanal: y.kanal,
      aliciTip: y.aliciTip,
      aliciId: y.aliciId,
      aliciAd: y.aliciAd,
      adres: adresMaskele(y.kanal, y.hedefAdres),
      hedefAdres: y.hedefAdres,
      konu: y.konu,
      ozet: y.metin.slice(0, 280),
      metin: y.metin,
      sablon: y.sablon ?? null,
      parametreler: y.parametreler ?? null,
      ekArsivDosyaId: y.ekArsivDosyaId ?? null,
      durum,
      kaynak: y.kaynak,
      kaynakId: y.kaynakId ?? null,
      gonderenId: y.gonderenId ?? null,
      denemeSayisi: 0,
      anahtar: y.anahtar ?? null,
      zaman,
    }
  }

  /** Sırası gelen satırları kiralar (eşzamanlı işçiler aynı satırı almaz) */
  private async kirala(): Promise<GonderimSatiri[]> {
    const simdi = this.saat.simdi()
    const kira = new Date(simdi.getTime() + KIRA_DK * 60_000).toISOString()
    const sonuc = await this.db.execute<{ id: string }>(sql`
      update ${gonderim}
      set sonraki_deneme = ${kira}, deneme_sayisi = deneme_sayisi + 1
      where id in (
        select id from ${gonderim}
        where durum = 'KUYRUKTA'
          and (sonraki_deneme is null or sonraki_deneme <= ${simdi.toISOString()})
        order by zaman
        limit ${PARTI}
        for update skip locked
      )
      returning id`)
    const idler = sonuc.rows.map((r) => r.id)
    if (!idler.length) return []
    return this.db
      .select()
      .from(gonderim)
      .where(inArray(gonderim.id, idler))
      .orderBy(gonderim.zaman)
  }

  private async gonder(
    s: GonderimSatiri,
    { ayar, gizli }: HazirKanal,
    { sonDeneme = false } = {}
  ): Promise<Gonderim> {
    const adres = s.hedefAdres ?? (await this.aliciAdresi(s)) ?? ""
    const mesaj: SunucuMesaji = {
      adres,
      konu: s.konu,
      metin: s.metin ?? s.ozet,
      whatsappSablon: s.sablon ?? undefined,
      parametreler: s.parametreler ?? undefined,
      ekArsivDosyaId: s.ekArsivDosyaId ?? undefined,
      ekler: await this.ekler(s.ekArsivDosyaId),
    }
    let sonuc
    try {
      sonuc = await this.saglayici.gonder(ayar, mesaj, gizli)
    } catch (e) {
      this.logger.error(e)
      sonuc = { basarili: false, hataMesaji: "Gönderim sırasında beklenmeyen hata", gecici: true }
    }
    return this.sonuclandir(s, sonuc, sonDeneme)
  }

  private async sonuclandir(
    s: GonderimSatiri,
    sonuc: { basarili: boolean; hataMesaji?: string; saglayiciId?: string; gecici?: boolean },
    sonDeneme = false
  ): Promise<Gonderim> {
    const tekrar =
      !sonuc.basarili && sonuc.gecici && !sonDeneme && s.denemeSayisi < EN_FAZLA_DENEME
    const bekleme = 2 ** Math.max(s.denemeSayisi - 1, 0) * 60_000
    const [g] = await this.db
      .update(gonderim)
      .set({
        durum: sonuc.basarili ? "GONDERILDI" : tekrar ? "KUYRUKTA" : "HATA",
        hataMesaji: sonuc.basarili ? null : (sonuc.hataMesaji ?? "Gönderilemedi"),
        saglayiciId: sonuc.saglayiciId ?? null,
        sonrakiDeneme: tekrar
          ? new Date(this.saat.simdi().getTime() + bekleme).toISOString()
          : null,
        zaman: this.saat.simdiIso(),
      })
      .where(eq(gonderim.id, s.id))
      .returning()
    return gonderimSatirindan(g!)
  }

  /** Maskeli adres saklandığı kayıtlar (seed) ve yeniden denemede alıcının güncel adresi */
  private async aliciAdresi(g: GonderimSatiri): Promise<string | undefined> {
    if (g.aliciTip === "PERSONEL") {
      const [p] = await this.db.select().from(personel).where(eq(personel.id, g.aliciId))
      return g.kanal === "EPOSTA" ? p?.eposta : g.kanal === "WHATSAPP" ? p?.telefon : undefined
    }
    const [m] = await this.db.select().from(mukellef).where(eq(mukellef.id, g.aliciId))
    return g.kanal === "EPOSTA" ? m?.eposta : m?.telefon
  }

  private async ekler(dosyaId: string | null) {
    if (!dosyaId) return undefined
    const [d] = await this.db.select().from(arsivDosya).where(eq(arsivDosya.id, dosyaId))
    if (!d || d.silindi) return undefined
    const icerik = await this.depo.getir(arsivAnahtari(d.mukellefId, d.id))
    return icerik ? [{ ad: d.ad, mimeType: d.mimeType, icerik }] : undefined
  }
}
