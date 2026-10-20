import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleInit,
} from "@nestjs/common"
import { addDays } from "date-fns"
import { and, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm"

import type { KamuOturum } from "@prime/shared/borc/kamu-adapter"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import {
  erisimHatasi as erisimGirdiHatasi,
  TEBLIGAT_BELGE_TURLERI,
  TEBLIGAT_TURLERI,
  tebligatEkleHatasi,
  tebligatGuncelleHatasi,
} from "@prime/shared/tebligat/girdi"
import {
  ACIK_DURUMLAR,
  sureDurumu,
  SURE_KURALLARI,
  tebligatTuru,
} from "@prime/shared/tebligat/kurallar"
import {
  SAYFA_BOYUTU,
  TEBLIGAT_KASA_SISTEMI,
  TEBLIGAT_TUR_ETIKET,
} from "@prime/shared/tebligat/sabitler"
import type {
  GorevView,
  TebligatEkleRequest,
  TebligatErisimSatiri,
  TebligatErisimSatirDurumu,
  TebligatErisimSayilari,
  TebligatGuncelleRequest,
  TebligatKapsam,
  TebligatListResponse,
  TebligatMukellefTaraResponse,
  TebligatOzetResponse,
  TebligatView,
} from "@prime/shared/types/api"
import type {
  KamuDogrulama,
  Personel,
  Tebligat,
  TebligatErisim,
  TebligatTarama,
  TebligatTur,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { ArsivYazici } from "../arsiv/arsiv-yazici.js"
import { BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { SecretBox, sonDort } from "../core/secret-box.js"
import { sayfala } from "../core/sayfala.js"
import type { DrizzleTx } from "../db/db.module.js"
import {
  credential,
  gorev,
  kamuDogrulama,
  mukellef,
  personel,
  tebligat,
  tebligatErisim,
  tebligatTarama,
} from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { DosyaService } from "../dosya/dosya.service.js"
import { GorevService } from "../gorev/gorev.service.js"
import { HatirlatmaService, type Hatirlatma } from "../hatirlatma/hatirlatma.service.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"
import { SISTEM_AKTOR } from "../tahsilat/ucret-borclari.js"
import { GibTebligat } from "./gib-adapter.js"
import { GibOturumService } from "./gib-oturum.service.js"

/** Büro geneli gece taraması: mükellef işlerini dağıtır (Faz 11'de levha ve borç adımları eklenir) */
export const GECE_GIB_ISI = "gece-gib"
/** Tek mükellefin gece adımları; aynı anda bir tane çalışır, istekler gece boyunca yayılır */
export const GIB_MUKELLEF_ISI = "gib-mukellef"
const SAKLANAN_TARAMA = 30
/** Mükellef işleri arasındaki ortalama aralık (sn) ve yayılımın üst sınırı */
const YAYILIM_ARALIK_SN = 20
const YAYILIM_EN_FAZLA_SN = 3 * 60 * 60
const KAPSAMLAR: TebligatKapsam[] = ["acik", "acil", "kapali"]
const ERISIM_DURUMLARI: TebligatErisimSatirDurumu[] = ["AKTIF", "HATA", "TANIMSIZ"]
/** Mock ile aynı: elle girilen tebligatın ulaşma saati */
const ELLE_ULASMA_SAATI = 9

type MukellefSatiri = typeof mukellef.$inferSelect
type TebligatSatiri = typeof tebligat.$inferSelect
type ErisimSatiri = typeof tebligatErisim.$inferSelect

const tebligatSatirindan = (t: TebligatSatiri): Tebligat => nullsuz(t) as Tebligat
const erisimSatirindan = ({ sifreEnc: _gizli, ...e }: ErisimSatiri): TebligatErisim =>
  nullsuz(e) as TebligatErisim
const taramaSatirindan = (t: typeof tebligatTarama.$inferSelect): TebligatTarama => t
const vknOf = (m: MukellefSatiri) => (m.vkn ?? m.tckn)!
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const trIcerir = (metin: string | undefined, aranan: string) =>
  Boolean(metin && kucuk(metin).includes(kucuk(aranan)))

/** Açıklar önce, son işlem gününe göre; kapalılar ulaşma tarihine göre yeniden eskiye */
function sirala(a: TebligatView, b: TebligatView) {
  if (a.acik !== b.acik) return a.acik ? -1 : 1
  if (a.acik) {
    const x = a.sonIslemTarihi ?? "9999"
    const y = b.sonIslemTarihi ?? "9999"
    if (x !== y) return x.localeCompare(y)
  }
  return b.ulasmaTarihi.localeCompare(a.ulasmaTarihi)
}

const aciklama = (t: Pick<Tebligat, "tur" | "vkn">, unvan?: string) =>
  `${TEBLIGAT_TUR_ETIKET[t.tur]} · ${unvan ?? `VKN ${t.vkn}`}`

export interface TebligatSorgusu {
  q?: string
  kapsam?: string
  tur?: string
  mukellefId?: string
  sayfa?: string
  sayfaBoyutu?: string
}

type TaramaSonucu = { yeni: number } | { dogrulama: KamuDogrulama } | { hata: string }

/**
 * e-Tebligat (mock `handlers/tebligat.ts`): GİB erişimleri, tek mükellef taraması, gece taraması,
 * liste / özet / detay, elle kayıt, güncelleme, görev ve belge. GİB girişi `GibOturumService`
 * üzerinden (doğrulama ekranı personele kalır); kutu `GibTebligat` ile okunur.
 */
@Injectable()
export class TebligatService implements OnModuleInit {
  private readonly logger = new Logger(TebligatService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly gib: GibTebligat,
    private readonly oturum: GibOturumService,
    private readonly kutu: SecretBox,
    private readonly aktiviteler: AktiviteService,
    private readonly bildirimler: BildirimService,
    private readonly yazici: ArsivYazici,
    private readonly dosyalar: DosyaService,
    private readonly gorevler: GorevService,
    private readonly hatirlatma: HatirlatmaService,
    private readonly isler: IsKuyrugu,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      // Mock şifre SecretBox ile şifrelenir (anahtar yoksa erişimler atlanır)
      if (state.tebligatErisim.length && this.kutu.hazir) {
        await db
          .insert(tebligatErisim)
          .values(
            state.tebligatErisim.map((e) => ({ ...e, sifreEnc: this.kutu.sifrele("mock-sifre") }))
          )
      }
      if (state.tebligat.length) await db.insert(tebligat).values(state.tebligat)
      if (state.tebligatTarama.length) await db.insert(tebligatTarama).values(state.tebligatTarama)
      const gibDogrulama = state.kamuDogrulama.filter((d) => d.kurum === "GIB")
      if (gibDogrulama.length) await db.insert(kamuDogrulama).values(gibDogrulama)
    })

    this.oturum.adimKaydet("TEBLIGAT", async (o, m, aktorId) => {
      const yeni = await this.tebligatlariOku(o, m, aktorId)
      if (yeni === null) return "e-Tebligat kutusu okunamadı"
      return yeni ? `${yeni} yeni e-Tebligat` : "Yeni e-Tebligat yok"
    })

    // TEBLIGAT bildirimleri atanana, yoksa mükellef sorumlusuna
    this.bildirimler.cozucuEkle({
      oncelik: 40,
      cozumle: async (log) => {
        if (log.hedefTip !== "TEBLIGAT" || !log.hedefId) return undefined
        const [s] = await this.txHost.tx
          .select({ atanan: tebligat.atananId, sorumlu: mukellef.sorumluPersonelId })
          .from(tebligat)
          .innerJoin(mukellef, eq(mukellef.id, tebligat.mukellefId))
          .where(eq(tebligat.id, log.hedefId))
        return s ? { alici: s.atanan ?? s.sorumlu } : undefined
      },
    })

    this.hatirlatma.ureticiEkle("tebligat-sure", () => this.sureHatirlatmalari())

    this.isler.tanimla(
      GECE_GIB_ISI,
      async () => {
        const { taramaId, mukellefler } = await this.geceTaramasiBaslat()
        const yayilim = Math.min(mukellefler.length * YAYILIM_ARALIK_SN, YAYILIM_EN_FAZLA_SN)
        for (const mukellefId of mukellefler) {
          await this.isler.gonder(
            GIB_MUKELLEF_ISI,
            { taramaId, mukellefId },
            { startAfter: Math.floor(Math.random() * yayilim) }
          )
        }
        this.logger.log(`Gece GİB taraması: ${mukellefler.length} mükellef kuyrukta`)
      },
      { cron: "0 3 * * *" }
    )
    this.isler.tanimla<{ taramaId: string; mukellefId: string }>(
      GIB_MUKELLEF_ISI,
      async ([is]) => {
        if (is) await this.geceMukellefTara(is.data.taramaId, is.data.mukellefId)
      },
      { localConcurrency: 1, batchSize: 1 }
    )
  }

  private bugun() {
    return toYmd(this.saat.simdi())
  }

  // --- Görünümler ------------------------------------------------------------------

  private view(
    t: Tebligat,
    m: Pick<MukellefSatiri, "unvan" | "sorumluPersonelId"> | null,
    atananAd: string | undefined,
    bugunYmd = this.bugun()
  ): TebligatView {
    return {
      ...t,
      ...sureDurumu(t, bugunYmd),
      mukellefUnvan: m?.unvan,
      sorumluPersonelId: m?.sorumluPersonelId,
      atananAd,
    }
  }

  private async viewler(kosul?: SQL): Promise<TebligatView[]> {
    const bugunYmd = this.bugun()
    const satirlar = await this.txHost.tx
      .select({
        t: tebligat,
        unvan: mukellef.unvan,
        sorumlu: mukellef.sorumluPersonelId,
        ad: personel.ad,
        soyad: personel.soyad,
      })
      .from(tebligat)
      .innerJoin(mukellef, eq(mukellef.id, tebligat.mukellefId))
      .leftJoin(personel, eq(personel.id, tebligat.atananId))
      .where(kosul)
    return satirlar.map((s) =>
      this.view(
        tebligatSatirindan(s.t),
        { unvan: s.unvan, sorumluPersonelId: s.sorumlu },
        s.ad ? `${s.ad} ${s.soyad}` : undefined,
        bugunYmd
      )
    )
  }

  private async viewGetir(id: string): Promise<TebligatView> {
    const [v] = await this.viewler(eq(tebligat.id, id))
    if (!v) throw new NotFoundException({ message: "Tebligat bulunamadı" })
    return v
  }

  private async erisimSatiri(m: MukellefSatiri, e: ErisimSatiri | undefined) {
    const [kasa] = await this.txHost.tx
      .select({ id: credential.id, sonGuncelleme: credential.sonGuncelleme })
      .from(credential)
      .where(
        and(eq(credential.mukellefId, m.id), eq(credential.sistem, TEBLIGAT_KASA_SISTEMI))
      )
    const d = e ? await this.oturum.bekleyen(m.id, "GIB") : null
    return erisimSatiriYap(m, e, kasa, d ? this.oturum.dogrulamaView(d, m.unvan) : null)
  }

  // --- Erişim ----------------------------------------------------------------------

  async erisimler(durumParam?: string): Promise<TebligatErisimSatiri[]> {
    const durum = ERISIM_DURUMLARI.includes(durumParam as TebligatErisimSatirDurumu)
      ? (durumParam as TebligatErisimSatirDurumu)
      : null
    const [satirlar, kasalar, dogrulamalar] = await Promise.all([
      this.txHost.tx
        .select({ m: mukellef, e: tebligatErisim })
        .from(mukellef)
        .leftJoin(tebligatErisim, eq(tebligatErisim.mukellefId, mukellef.id))
        .where(eq(mukellef.aktif, true)),
      this.txHost.tx
        .select({
          id: credential.id,
          mukellefId: credential.mukellefId,
          sonGuncelleme: credential.sonGuncelleme,
        })
        .from(credential)
        .where(eq(credential.sistem, TEBLIGAT_KASA_SISTEMI)),
      this.txHost.tx.select().from(kamuDogrulama).where(eq(kamuDogrulama.kurum, "GIB")),
    ])
    const kasaMap = new Map(kasalar.map((k) => [k.mukellefId, k]))
    const dMap = new Map(dogrulamalar.map((d) => [d.mukellefId, d]))
    return satirlar
      .map(({ m, e }) => {
        const d = e ? dMap.get(m.id) : undefined
        return erisimSatiriYap(
          m,
          e ?? undefined,
          kasaMap.get(m.id),
          d ? this.oturum.dogrulamaView(d, m.unvan) : null
        )
      })
      .filter((s) => !durum || s.durum === durum)
      .sort(
        (a, b) =>
          ERISIM_DURUMLARI.indexOf(b.durum) - ERISIM_DURUMLARI.indexOf(a.durum) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR")
      )
  }

  async erisim(mukellefId: string): Promise<TebligatErisimSatiri> {
    const { m, e } = await this.mukellefVeErisim(mukellefId)
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    return this.erisimSatiri(m, e)
  }

  /**
   * Kimlik GİB'de denenir (transaction dışında): başarısızsa 422. Doğrulama ekranı çıkarsa erişim
   * yine kaydedilir ve `TEBLIGAT` adımlı doğrulama açılır; kod girilince kutu taranır.
   */
  async erisimKaydet(
    aktor: Personel,
    mukellefId: string,
    body: unknown
  ): Promise<TebligatErisimSatiri> {
    const { m } = await this.mukellefVeErisim(mukellefId)
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    const hata = erisimGirdiHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const b = body as { kullaniciKodu: string; sifre: string; kasaCredentialId?: string }
    const kullaniciKodu = b.kullaniciKodu.trim()
    let kasa: { id: string; sonGuncelleme: string } | undefined
    if (b.kasaCredentialId) {
      const [k] = await this.txHost.tx
        .select()
        .from(credential)
        .where(eq(credential.id, b.kasaCredentialId))
      if (k?.mukellefId !== m.id || k.sistem !== TEBLIGAT_KASA_SISTEMI)
        throw new BadRequestException({
          message: "Kasa kaydı bu mükellefin İnteraktif VD kaydı değil",
        })
      kasa = k
    }

    const sonuc = await this.oturum.girisDene({ kurum: "GIB", kullaniciKodu, sifre: b.sifre })
    if (sonuc.durum === "HATA") throw new UnprocessableEntityException({ message: sonuc.hataMesaji })

    await this.erisimYaz(aktor, m, kullaniciKodu, b.sifre, kasa)
    if (sonuc.durum === "DOGRULAMA")
      await this.oturum.dogrulamaAc(
        m,
        "GIB",
        sonuc.oturumId,
        sonuc.gorselDataUrl,
        ["TEBLIGAT"],
        aktor.id
      )
    return this.erisim(m.id)
  }

  @Transactional()
  private async erisimYaz(
    aktor: Personel,
    m: MukellefSatiri,
    kullaniciKodu: string,
    sifre: string,
    kasa: { id: string; sonGuncelleme: string } | undefined
  ) {
    // Yeni kimlikle önceki doğrulama oturumu geçersizdir
    await this.oturum.dogrulamaKaldir(m.id, "GIB")
    const kayit = {
      kullaniciKodu,
      sifreEnc: this.kutu.sifrele(sifre),
      sifreIpucu: sonDort(sifre),
      durum: "AKTIF" as const,
      hataMesaji: null,
      // Elle girilen şifre kasa bağını koparır
      kasaKaynagi: kasa ? { credentialId: kasa.id, credentialGuncelleme: kasa.sonGuncelleme } : null,
      tanimlayanId: aktor.id,
      tanimlamaTarihi: this.saat.simdiIso(),
    }
    // Son başarılı tarama korunur
    await this.txHost.tx
      .insert(tebligatErisim)
      .values({ id: newId("te"), mukellefId: m.id, ...kayit })
      .onConflictDoUpdate({ target: tebligatErisim.mukellefId, set: kayit })
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "TEBLIGAT_ERISIMI_TANIMLANDI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: kasa ? `${m.unvan} · kasadaki İnteraktif VD kaydından` : m.unvan,
      },
      false
    )
    // Kasadaki şifrenin sunucuya aktarılması kaydın erişim geçmişine yazılır
    if (kasa)
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: "SIFRE_TEBLIGATA_AKTARILDI",
          hedefTip: "CREDENTIAL",
          hedefId: kasa.id,
          mukellefId: m.id,
          aciklama: TEBLIGAT_KASA_SISTEMI,
        },
        false
      )
  }

  @Transactional()
  async erisimKaldir(aktor: Personel, mukellefId: string) {
    const [silinen] = await this.txHost.tx
      .delete(tebligatErisim)
      .where(eq(tebligatErisim.mukellefId, mukellefId))
      .returning({ id: tebligatErisim.id })
    if (!silinen) throw new NotFoundException({ message: "GİB erişimi tanımlı değil" })
    await this.oturum.dogrulamaKaldir(mukellefId, "GIB")
    const [m] = await this.txHost.tx
      .select({ unvan: mukellef.unvan })
      .from(mukellef)
      .where(eq(mukellef.id, mukellefId))
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "TEBLIGAT_ERISIMI_KALDIRILDI",
        hedefTip: "MUKELLEF",
        hedefId: mukellefId,
        mukellefId,
        aciklama: m?.unvan ?? mukellefId,
      },
      false
    )
  }

  /** Gece beklemeden tek mükellefi tarar (erişim yeni tanımlandığında / hata düzeldiğinde) */
  async tara(aktor: Personel, mukellefId: string): Promise<TebligatMukellefTaraResponse> {
    const { m, e } = await this.mukellefVeErisim(mukellefId)
    if (!m || !e) throw new NotFoundException({ message: "GİB erişimi tanımlı değil" })
    const r = await this.mukellefTara(m, aktor.id)
    if ("hata" in r) throw new ConflictException({ message: r.hata })
    const { e: guncel } = await this.mukellefVeErisim(mukellefId)
    return {
      yeni: "yeni" in r ? r.yeni : 0,
      erisim: erisimSatirindan(guncel!),
      dogrulama: "dogrulama" in r ? this.oturum.dogrulamaView(r.dogrulama, m.unvan) : null,
    }
  }

  private async mukellefVeErisim(mukellefId: string) {
    const [s] = await this.txHost.tx
      .select({ m: mukellef, e: tebligatErisim })
      .from(mukellef)
      .leftJoin(tebligatErisim, eq(tebligatErisim.mukellefId, mukellef.id))
      .where(eq(mukellef.id, mukellefId))
    return { m: s?.m, e: s?.e ?? undefined }
  }

  // --- Tarama ----------------------------------------------------------------------

  /** Oturum açar (bekleyen doğrulama ya da hatalı erişimde denemez) ve kutuyu okur */
  private async mukellefTara(m: MukellefSatiri, aktorId: string): Promise<TaramaSonucu> {
    const r = await this.oturum.oturumAc(m, "GIB", ["TEBLIGAT"], aktorId)
    if (!("oturum" in r)) return r
    const yeni = await this.tebligatlariOku(r.oturum, m, aktorId)
    if (yeni !== null) return { yeni }
    const { e } = await this.mukellefVeErisim(m.id)
    return { hata: e?.hataMesaji ?? "GİB e-Tebligat kutusuna girilemedi" }
  }

  /**
   * Açık oturumla kutuyu okur (transaction dışında), yeni belgeleri tek transaction'da kaydeder.
   * Aynı belge `(mukellef_id, gib_belge_id)` ile ikinci kez yazılmaz. Okunamazsa erişim HATA'ya
   * düşer ve `null` döner.
   */
  async tebligatlariOku(
    oturum: KamuOturum,
    m: MukellefSatiri,
    aktorId: string
  ): Promise<number | null> {
    const { e } = await this.mukellefVeErisim(m.id)
    if (!e) return null
    const sonuc = await this.gib.yeniBelgeler(oturum, e.sonTarama ?? undefined)
    if (!sonuc.gecerli) {
      await this.oturum.erisimHatasi(m, "GIB", sonuc.hataMesaji, aktorId)
      return null
    }
    return this.belgeleriYaz(m, sonuc.belgeler, aktorId)
  }

  @Transactional()
  private async belgeleriYaz(
    m: MukellefSatiri,
    belgeler: { belgeId: string; kurum: Tebligat["kurum"]; belgeTuru: string; konu: string; belgeNo?: string; ulasmaTarihi: string }[],
    aktorId: string
  ) {
    const an = this.saat.simdiIso()
    const eklenenler = belgeler.length
      ? await this.txHost.tx
          .insert(tebligat)
          .values(
            belgeler.map((b) => ({
              id: newId("tb"),
              mukellefId: m.id,
              vkn: vknOf(m),
              kurum: b.kurum,
              tur: tebligatTuru(`${b.belgeTuru} ${b.konu}`),
              konu: b.konu,
              belgeNo: b.belgeNo ?? null,
              ulasmaTarihi: b.ulasmaTarihi,
              durum: "YENI" as const,
              kaynak: "GIB" as const,
              gibBelgeId: b.belgeId,
              olusturmaTarihi: an,
            }))
          )
          .onConflictDoNothing()
          .returning()
      : []
    const alicilar = eklenenler.length ? await this.yeniTebligatAlicilari(m) : []
    for (const t of eklenenler) {
      await this.aktiviteler.log(
        {
          aktorId,
          eylem: "TEBLIGAT_ALINDI",
          hedefTip: "TEBLIGAT",
          hedefId: t.id,
          mukellefId: m.id,
          aciklama: aciklama(t, m.unvan),
        },
        { alicilar, baslik: "Yeni e-Tebligat" }
      )
    }
    await this.txHost.tx
      .update(tebligatErisim)
      .set({ durum: "AKTIF", hataMesaji: null, sonTarama: an })
      .where(eq(tebligatErisim.mukellefId, m.id))
    return eklenenler.length
  }

  /** Yeni tebligat bildirimi: mükellef sorumlusu ve yöneticiler */
  private async yeniTebligatAlicilari(m: MukellefSatiri) {
    const yoneticiler = await this.txHost.tx
      .select({ id: personel.id })
      .from(personel)
      .where(and(eq(personel.aktif, true), eq(personel.rol, "YONETICI")))
    return [...new Set([m.sorumluPersonelId, ...yoneticiler.map((p) => p.id)])]
  }

  /**
   * Gece taramasını açar: erişimi tanımlı her aktif mükellef sayılır; girişi başarısız olanlar
   * (hesap kilitlenmesin diye) ve doğrulama bekleyenler denenmeden sayaca yazılır, kalanlar için
   * mükellef işi döner. Son 30 tarama tutulur.
   */
  @Transactional()
  async geceTaramasiBaslat(): Promise<{ taramaId: string; mukellefler: string[] }> {
    const an = this.saat.simdiIso()
    const satirlar = await this.txHost.tx
      .select({ mukellefId: tebligatErisim.mukellefId, durum: tebligatErisim.durum, d: kamuDogrulama.id })
      .from(tebligatErisim)
      .innerJoin(mukellef, eq(mukellef.id, tebligatErisim.mukellefId))
      .leftJoin(
        kamuDogrulama,
        and(eq(kamuDogrulama.mukellefId, tebligatErisim.mukellefId), eq(kamuDogrulama.kurum, "GIB"))
      )
      .where(eq(mukellef.aktif, true))
    const hatali = satirlar.filter((s) => s.durum === "HATA").length
    const dogrulama = satirlar.filter((s) => s.durum !== "HATA" && s.d).length
    const mukellefler = satirlar.filter((s) => s.durum !== "HATA" && !s.d).map((s) => s.mukellefId)
    const taramaId = newId("tt")
    await this.txHost.tx.insert(tebligatTarama).values({
      id: taramaId,
      baslangic: an,
      bitis: an,
      taranan: satirlar.length,
      hatali,
      yeni: 0,
      dogrulama,
    })
    const saklanan = this.txHost.tx
      .select({ id: tebligatTarama.id })
      .from(tebligatTarama)
      .orderBy(desc(tebligatTarama.baslangic))
      .limit(SAKLANAN_TARAMA)
    await this.txHost.tx.delete(tebligatTarama).where(notInArray(tebligatTarama.id, saklanan))
    return { taramaId, mukellefler }
  }

  /** Gece mükellef işi (aktör `sistem`); sonuç taramanın sayaçlarına eklenir */
  async geceMukellefTara(taramaId: string, mukellefId: string) {
    const [m] = await this.txHost.tx.select().from(mukellef).where(eq(mukellef.id, mukellefId))
    const r: TaramaSonucu = m
      ? await this.mukellefTara(m, SISTEM_AKTOR)
      : { hata: "Mükellef bulunamadı" }
    const t = tebligatTarama
    await this.txHost.tx
      .update(t)
      .set({
        bitis: this.saat.simdiIso(),
        ...("yeni" in r
          ? { yeni: sql`${t.yeni} + ${r.yeni}` }
          : "dogrulama" in r
            ? { dogrulama: sql`${t.dogrulama} + 1` }
            : { hatali: sql`${t.hatali} + 1` }),
      })
      .where(eq(t.id, taramaId))
  }

  /** Testte / geliştirmede: taramayı açıp mükellefleri sırayla işler */
  async geceTaramasiCalistir(): Promise<TebligatTarama> {
    const { taramaId, mukellefler } = await this.geceTaramasiBaslat()
    for (const id of mukellefler) await this.geceMukellefTara(taramaId, id)
    const [t] = await this.txHost.tx.select().from(tebligatTarama).where(eq(tebligatTarama.id, taramaId))
    return taramaSatirindan(t!)
  }

  // --- Liste, özet, detay ------------------------------------------------------------

  async ozet(sorumlu?: string): Promise<TebligatOzetResponse> {
    const bugunYmd = this.bugun()
    const views = (await this.viewler()).filter(
      (t) =>
        !sorumlu ||
        t.atananId === sorumlu ||
        (!t.atananId && t.sorumluPersonelId === sorumlu)
    )
    const acik = views.filter((t) => t.acik)
    const hafta = toYmd(addDays(fromYmd(bugunYmd), -7))
    const [son] = await this.txHost.tx
      .select()
      .from(tebligatTarama)
      .orderBy(desc(tebligatTarama.baslangic))
      .limit(1)
    return {
      acik: acik.length,
      acil: acik.filter((t) => t.acil).length,
      geciken: acik.filter((t) => t.gecikti).length,
      yeni: views.filter((t) => t.ulasmaTarihi.slice(0, 10) >= hafta).length,
      yaklasan: acik
        .filter((t) => t.sonIslemTarihi)
        .sort(sirala)
        .slice(0, 5),
      sonTarama: son ? taramaSatirindan(son) : null,
      erisim: await this.erisimSayilari(),
    }
  }

  private async erisimSayilari(): Promise<TebligatErisimSayilari> {
    const satirlar = await this.txHost.tx
      .select({ durum: tebligatErisim.durum })
      .from(mukellef)
      .leftJoin(tebligatErisim, eq(tebligatErisim.mukellefId, mukellef.id))
      .where(eq(mukellef.aktif, true))
    const sayilar = { aktif: 0, hatali: 0, tanimsiz: 0 }
    for (const s of satirlar) {
      if (!s.durum) sayilar.tanimsiz++
      else if (s.durum === "HATA") sayilar.hatali++
      else sayilar.aktif++
    }
    return sayilar
  }

  async liste(s: TebligatSorgusu): Promise<TebligatListResponse> {
    const q = s.q?.trim() ?? ""
    const kapsam = KAPSAMLAR.includes(s.kapsam as TebligatKapsam)
      ? (s.kapsam as TebligatKapsam)
      : null
    const kosullar: SQL[] = []
    if (s.mukellefId) kosullar.push(eq(tebligat.mukellefId, s.mukellefId))
    if (TEBLIGAT_TURLERI.includes(s.tur as TebligatTur))
      kosullar.push(eq(tebligat.tur, s.tur as TebligatTur))
    if (kapsam === "acik" || kapsam === "acil")
      kosullar.push(inArray(tebligat.durum, [...ACIK_DURUMLAR]))
    if (kapsam === "kapali") kosullar.push(notInArray(tebligat.durum, [...ACIK_DURUMLAR]))
    const filtrelenen = (await this.viewler(kosullar.length ? and(...kosullar) : undefined))
      .filter(
        (t) =>
          (kapsam !== "acil" || t.acil || t.gecikti) &&
          (!q ||
            trIcerir(t.mukellefUnvan, q) ||
            trIcerir(t.konu, q) ||
            t.vkn.includes(q) ||
            Boolean(t.belgeNo?.includes(q)))
      )
      .sort(sirala)
    return sayfala(filtrelenen, s, { varsayilan: SAYFA_BOYUTU })
  }

  detay(id: string): Promise<TebligatView> {
    return this.viewGetir(id)
  }

  // --- Yazma -----------------------------------------------------------------------

  @Transactional()
  async ekle(aktor: Personel, body: unknown): Promise<TebligatView> {
    const b = (body ?? {}) as TebligatEkleRequest
    const [m] = await this.txHost.tx
      .select()
      .from(mukellef)
      .where(eq(mukellef.id, typeof b.mukellefId === "string" ? b.mukellefId : ""))
    if (!m) throw new BadRequestException({ message: "Mükellef seçin" })
    const hata = tebligatEkleHatasi(body, this.bugun())
    if (hata) throw new BadRequestException({ message: hata })
    const ulasma = fromYmd(b.ulasmaGunu)
    ulasma.setHours(ELLE_ULASMA_SAATI)
    const [t] = await this.txHost.tx
      .insert(tebligat)
      .values({
        id: newId("tb"),
        mukellefId: m.id,
        vkn: vknOf(m),
        kurum: b.kurum === "SGK" ? "SGK" : "GIB",
        tur: b.tur,
        konu: b.konu.trim(),
        belgeNo: b.belgeNo?.trim() || null,
        ulasmaTarihi: ulasma.toISOString(),
        sureGun: b.sureGun ?? null,
        durum: "YENI",
        atananId: aktor.id,
        kaynak: "ELLE",
        olusturmaTarihi: this.saat.simdiIso(),
      })
      .returning()
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "TEBLIGAT_ALINDI",
        hedefTip: "TEBLIGAT",
        hedefId: t!.id,
        mukellefId: m.id,
        aciklama: aciklama(t!, m.unvan),
      },
      false
    )
    return this.viewGetir(t!.id)
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, body: unknown): Promise<TebligatView> {
    const t = await this.kilitle(id)
    const hata = tebligatGuncelleHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const b = (body ?? {}) as TebligatGuncelleRequest
    const patch: Partial<TebligatSatiri> = {}
    const degisiklik: string[] = []
    if (b.durum !== undefined) {
      if (b.durum !== t.durum) degisiklik.push("durum")
      patch.durum = b.durum
    }
    if (b.atananId !== undefined) {
      if (b.atananId !== null) {
        const [p] = await this.txHost.tx
          .select({ id: personel.id })
          .from(personel)
          .where(eq(personel.id, b.atananId))
        if (!p) throw new BadRequestException({ message: "Personel bulunamadı" })
      }
      patch.atananId = b.atananId
      if (b.atananId !== (t.atananId ?? null)) degisiklik.push("atanan")
    }
    if (b.not !== undefined) patch.not = b.not.trim() || null
    if (b.sureGun !== undefined) patch.sureGun = b.sureGun

    if (Object.keys(patch).length)
      await this.txHost.tx.update(tebligat).set(patch).where(eq(tebligat.id, id))
    if (degisiklik.length) {
      const [m] = await this.txHost.tx
        .select({ unvan: mukellef.unvan })
        .from(mukellef)
        .where(eq(mukellef.id, t.mukellefId))
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: "TEBLIGAT_GUNCELLENDI",
          hedefTip: "TEBLIGAT",
          hedefId: id,
          mukellefId: t.mukellefId,
          aciklama: aciklama(t, m?.unvan),
        },
        b.atananId && b.atananId !== t.atananId
          ? { alicilar: [b.atananId], baslik: "Bir e-Tebligat size atandı" }
          : false
      )
    }
    return this.viewGetir(id)
  }

  /** Tebligattan görev: son işlem gününe, atanana (yoksa sorumluya); görev varken 409 */
  @Transactional()
  async gorevOlustur(aktor: Personel, id: string): Promise<GorevView> {
    const t = await this.kilitle(id)
    if (t.gorevId) {
      const [g] = await this.txHost.tx
        .select({ id: gorev.id })
        .from(gorev)
        .where(eq(gorev.id, t.gorevId))
      if (g) throw new ConflictException({ message: "Bu tebligat için görev zaten var" })
    }
    const v = await this.viewGetir(id)
    const kural = SURE_KURALLARI[t.tur]
    const g = await this.gorevler.olustur(aktor, {
      baslik: `${TEBLIGAT_TUR_ETIKET[t.tur]}: ${t.konu}`,
      aciklama: [
        `e-Tebligat ${t.belgeNo ? `(${t.belgeNo}) ` : ""}tebliğ tarihi ${v.tebligTarihi}.`,
        kural.gun !== null ? `Süre içinde yapılacak: ${kural.islem}.` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      mukellefId: t.mukellefId,
      tip: "DIGER",
      atananId: t.atananId ?? v.sorumluPersonelId,
      oncelik: "YUKSEK",
      sonTarih: v.sonIslemTarihi ?? toYmd(addDays(fromYmd(this.bugun()), 7)),
    })
    await this.txHost.tx
      .update(tebligat)
      .set({ gorevId: g.id, durum: t.durum === "YENI" ? "INCELENDI" : t.durum })
      .where(eq(tebligat.id, id))
    return g
  }

  /** Tebligat belgesini arşive (TEBLIGAT kategorisi) yükler; önceki dosya arşivde kalır */
  async belgeYukle(aktor: Personel, id: string, body: unknown): Promise<TebligatView> {
    const t = await this.viewGetir(id)
    const d = (body as { dosya?: { ad?: unknown; dataUrl?: unknown } } | null)?.dosya
    const ad = typeof d?.ad === "string" ? d.ad.trim() : ""
    if (!ad) throw new BadRequestException({ message: "Dosya adı zorunludur" })
    const dosya = await this.dosyalar.dataUrlCoz(d?.dataUrl)
    if (!TEBLIGAT_BELGE_TURLERI.includes(dosya.mimeType))
      throw new BadRequestException({ message: "PDF, PNG veya JPG yükleyin" })
    await this.yazici.yaz(
      {
        mukellefId: t.mukellefId,
        kategori: "TEBLIGAT",
        ad,
        mimeType: dosya.mimeType,
        boyut: dosya.boyut,
        yukleyenId: aktor.id,
      },
      { icerik: dosya.icerik },
      {
        aktivite: false,
        sonra: async (arsiv) => {
          const [g] = await this.txHost.tx
            .update(tebligat)
            .set({ arsivDosyaId: arsiv.id })
            .where(eq(tebligat.id, id))
            .returning({ id: tebligat.id })
          if (!g) throw new NotFoundException({ message: "Tebligat bulunamadı" })
          await this.aktiviteler.log(
            {
              aktorId: aktor.id,
              eylem: "ARSIV_YUKLENDI",
              hedefTip: "ARSIV",
              hedefId: arsiv.id,
              mukellefId: t.mukellefId,
              aciklama: ad,
            },
            false
          )
        },
      }
    )
    return this.viewGetir(id)
  }

  private async kilitle(id: string): Promise<Tebligat> {
    const [t] = await this.txHost.tx.select().from(tebligat).where(eq(tebligat.id, id)).for("update")
    if (!t) throw new NotFoundException({ message: "Tebligat bulunamadı" })
    return tebligatSatirindan(t)
  }

  // --- Hatırlatma --------------------------------------------------------------------

  /** Son işlem günü yaklaşan açık tebligatlar (≤ 3 gün): atanana, yoksa sorumluya */
  private async sureHatirlatmalari(): Promise<Hatirlatma[]> {
    const views = await this.viewler(inArray(tebligat.durum, [...ACIK_DURUMLAR]))
    return views
      .filter((t) => t.acil)
      .map((t) => ({
        tur: "TEBLIGAT_SURE_YAKLASIYOR" as const,
        anahtar: `TEBLIGAT_SURE:${t.id}:${t.sonIslemTarihi}`,
        aliciId: t.atananId ?? t.sorumluPersonelId ?? null,
        baslik:
          t.kalanGun === 0
            ? "e-Tebligat süresi bugün doluyor"
            : `e-Tebligat süresinin dolmasına ${t.kalanGun} gün kaldı`,
        aciklama: aciklama(t, t.mukellefUnvan),
        link: `/tebligat?tebligat=${t.id}`,
        mukellefId: t.mukellefId,
        hedefTip: "TEBLIGAT" as const,
        hedefId: t.id,
      }))
  }
}

function erisimSatiriYap(
  m: MukellefSatiri,
  e: ErisimSatiri | undefined,
  kasa: { id: string; sonGuncelleme: string } | undefined,
  dogrulama: TebligatErisimSatiri["dogrulama"]
): TebligatErisimSatiri {
  const erisim = e ? erisimSatirindan(e) : null
  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    vkn: vknOf(m),
    sorumluPersonelId: m.sorumluPersonelId,
    durum: erisim?.durum ?? "TANIMSIZ",
    erisim,
    kasaKaydiId: kasa?.id,
    kasaDahaYeni: Boolean(
      kasa &&
        erisim?.kasaKaynagi?.credentialId === kasa.id &&
        kasa.sonGuncelleme > erisim.kasaKaynagi.credentialGuncelleme
    ),
    dogrulama,
  }
}
