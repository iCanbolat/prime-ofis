import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, eq, inArray, type SQL } from "drizzle-orm"
import type { FastifyRequest } from "fastify"

import {
  GECERLILIK_GEREKEN,
  KATEGORI_SIRASI,
  agacOlustur,
  donemAlanlariHatasi,
  eksikZorunlu,
  gecerlilikDurumu,
  kalanGun,
} from "@prime/shared/arsiv/kurallar"
import { DONEMLI_KATEGORILER } from "@prime/shared/bordro/kurallar"
import { BORDRO_BELGE_ETIKET } from "@prime/shared/bordro/sabitler"
import { formatDonem } from "@prime/shared/lib/format"
import { toYmd } from "@prime/shared/lib/tarih"
import type {
  ArsivAgacResponse,
  ArsivDosyaView,
  ArsivGecerlilikKaydi,
  ArsivIcerikResponse,
  ArsivListResponse,
  ArsivOzetResponse,
  ArsivSiralama,
} from "@prime/shared/types/api"
import {
  ARSIV_KATEGORI_ETIKET,
  type ArsivDosya,
  type ArsivKategori,
  type BordroBelgeTur,
  type Personel,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { aktorOzeti } from "../bildirim/bildirim.service.js"
import { Saat } from "../core/saat.js"
import { istegeBagliSayfala } from "../core/sayfala.js"
import type { DrizzleTx } from "../db/db.module.js"
import { arsivDosya, mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { DosyaErisimKaydi } from "../dosya/dosya-erisim-kaydi.js"
import { arsivAnahtari, DosyaService } from "../dosya/dosya.service.js"
import { arsivSatirindan, ArsivYazici } from "./arsiv-yazici.js"

export interface ArsivListeSorgusu {
  mukellefId?: string
  kategori?: string
  q?: string
  cop?: string
  sorumlu?: string
  gecerlilik?: string
  donem?: string
  sirala?: string
  yon?: string
  sayfa?: string
  sayfaBoyutu?: string
}

type Govde = Record<string, unknown>

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const SIRALAMALAR: ArsivSiralama[] = ["ad", "yuklemeTarihi", "boyut", "gecerlilikTarihi"]

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })
const bulunamadi = () => new NotFoundException({ message: "Dosya bulunamadı" })
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const icerir = (metin: string, q: string) => kucuk(metin).includes(kucuk(q))
const gecerliKategori = (v: unknown): v is ArsivKategori =>
  KATEGORI_SIRASI.includes(v as ArsivKategori)

function siralaFn(sirala: ArsivSiralama, yon: "asc" | "desc") {
  const carpan = yon === "desc" ? -1 : 1
  return (a: ArsivDosya, b: ArsivDosya) => {
    let fark: number
    switch (sirala) {
      case "boyut":
        fark = a.boyut - b.boyut
        break
      case "yuklemeTarihi":
        fark = a.yuklemeTarihi.localeCompare(b.yuklemeTarihi)
        break
      case "gecerlilikTarihi":
        // Tarihsizler her zaman sona
        if (!a.gecerlilikTarihi || !b.gecerlilikTarihi)
          return a.gecerlilikTarihi ? -1 : b.gecerlilikTarihi ? 1 : 0
        fark = a.gecerlilikTarihi.localeCompare(b.gecerlilikTarihi)
        break
      default:
        fark = a.ad.localeCompare(b.ad, "tr-TR")
    }
    return fark * carpan || a.id.localeCompare(b.id)
  }
}

@Injectable()
export class ArsivService implements OnModuleInit {
  private readonly logger = new Logger(ArsivService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly dosyalar: DosyaService,
    private readonly erisimKaydi: DosyaErisimKaydi,
    private readonly yazici: ArsivYazici,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      if (state.arsiv.length) await db.insert(arsivDosya).values(state.arsiv)
    })
  }

  private bugun() {
    return toYmd(this.saat.simdi())
  }

  // --- Okuma ---------------------------------------------------------------

  /** Sorumlu filtresine uyan aktif mükellefler */
  private async mukellefler(sorumlu?: string) {
    const kosullar: SQL[] = [eq(mukellef.aktif, true)]
    if (sorumlu) kosullar.push(eq(mukellef.sorumluPersonelId, sorumlu))
    return this.txHost.tx
      .select({ id: mukellef.id, tur: mukellef.tur, unvan: mukellef.unvan })
      .from(mukellef)
      .where(and(...kosullar))
  }

  /** Mükellef unvanı ve yükleyen özetiyle dosyalar */
  private async gorunumler(...kosullar: (SQL | undefined)[]): Promise<ArsivDosyaView[]> {
    const satirlar = await this.txHost.tx
      .select({ d: arsivDosya, unvan: mukellef.unvan, yukleyen: aktorOzeti })
      .from(arsivDosya)
      .innerJoin(mukellef, eq(mukellef.id, arsivDosya.mukellefId))
      .leftJoin(personel, eq(personel.id, arsivDosya.yukleyenId))
      .where(and(...kosullar))
    return satirlar.map((s) => ({
      ...arsivSatirindan(s.d),
      mukellefUnvan: s.unvan,
      yukleyen: s.yukleyen,
    }))
  }

  private async gorunum(id: string) {
    const [v] = await this.gorunumler(eq(arsivDosya.id, id))
    if (!v) throw bulunamadi()
    return v
  }

  async agac(sorumlu?: string): Promise<ArsivAgacResponse> {
    const liste = await this.mukellefler(sorumlu)
    const dosyalar = liste.length
      ? await this.txHost.tx
          .select({
            mukellefId: arsivDosya.mukellefId,
            kategori: arsivDosya.kategori,
            silindi: arsivDosya.silindi,
          })
          .from(arsivDosya)
          .where(inArray(arsivDosya.mukellefId, liste.map((m) => m.id)))
      : []
    return {
      mukellefler: agacOlustur(liste, dosyalar),
      copSayisi: dosyalar.filter((d) => d.silindi).length,
    }
  }

  async ozet(sorumlu?: string): Promise<ArsivOzetResponse> {
    const bugunYmd = this.bugun()
    const liste = await this.mukellefler(sorumlu)
    const dosyalar = liste.length
      ? await this.gorunumler(inArray(arsivDosya.mukellefId, liste.map((m) => m.id)))
      : []

    const gecerlilik: ArsivGecerlilikKaydi[] = []
    for (const d of dosyalar) {
      if (d.silindi || !d.gecerlilikTarihi) continue
      const durum = gecerlilikDurumu(d.gecerlilikTarihi, bugunYmd)
      if (durum === "GECERLI") continue
      gecerlilik.push({ ...d, gecerlilik: durum, kalanGun: kalanGun(d.gecerlilikTarihi, bugunYmd) })
    }
    gecerlilik.sort((a, b) => a.kalanGun - b.kalanGun)

    const eksik = liste
      .map((m) => ({ mukellefId: m.id, unvan: m.unvan, eksik: eksikZorunlu(m, dosyalar) }))
      .filter((x) => x.eksik.length > 0)
      .sort(
        (a, b) => b.eksik.length - a.eksik.length || a.unvan.localeCompare(b.unvan, "tr-TR")
      )
    return { gecerlilik, eksikZorunlu: eksik }
  }

  async liste(s: ArsivListeSorgusu): Promise<ArsivListResponse> {
    const bugunYmd = this.bugun()
    const q = s.q?.trim()
    const sirala = SIRALAMALAR.includes(s.sirala as ArsivSiralama)
      ? (s.sirala as ArsivSiralama)
      : "ad"
    const yon = s.yon === "desc" ? "desc" : "asc"

    // Tek mükellef istenirse (mükellef kartı) pasif mükellefin arşivi de görünür
    const ids = s.mukellefId
      ? [s.mukellefId]
      : (await this.mukellefler(s.sorumlu)).map((m) => m.id)
    const items = ids.length
      ? (
          await this.gorunumler(
            eq(arsivDosya.silindi, s.cop === "true"),
            inArray(arsivDosya.mukellefId, ids),
            s.kategori ? eq(arsivDosya.kategori, s.kategori as ArsivKategori) : undefined,
            s.donem ? eq(arsivDosya.donem, s.donem) : undefined
          )
        )
          .filter(
            (d) =>
              (!s.gecerlilik ||
                (d.gecerlilikTarihi !== undefined &&
                  gecerlilikDurumu(d.gecerlilikTarihi, bugunYmd) === s.gecerlilik)) &&
              (!q ||
                icerir(d.ad, q) ||
                icerir(d.mukellefUnvan, q) ||
                icerir(ARSIV_KATEGORI_ETIKET[d.kategori], q))
          )
          .sort(siralaFn(sirala, yon))
      : []
    return istegeBagliSayfala(items, s, { varsayilan: 24 })
  }

  async icerik(req: FastifyRequest, aktor: Personel, id: string): Promise<ArsivIcerikResponse> {
    const [d] = await this.txHost.tx.select().from(arsivDosya).where(eq(arsivDosya.id, id))
    if (!d) throw bulunamadi()
    await this.erisimKaydi.kaydet(req, aktor, {
      hedefTip: "ARSIV",
      hedefId: d.id,
      mukellefId: d.mukellefId,
      ad: d.ad,
    })
    const icerik = await this.dosyalar.getir(arsivAnahtari(d.mukellefId, d.id))
    const dataUrl = icerik
      ? this.dosyalar.dataUrlYap(icerik, d.mimeType)
      : this.dosyalar.yedekDataUrl(d)
    if (!dataUrl) throw new NotFoundException({ message: "Dosya içeriği bulunamadı" })
    return { dataUrl }
  }

  // --- Yazma ---------------------------------------------------------------

  async yukle(aktor: Personel, body: unknown): Promise<ArsivDosyaView> {
    const b = govde(body)
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id })
      .from(mukellef)
      .where(eq(mukellef.id, typeof b.mukellefId === "string" ? b.mukellefId : ""))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    if (!gecerliKategori(b.kategori)) throw hata("Geçersiz kategori")
    const ad = typeof b.ad === "string" ? b.ad.trim() : ""
    if (!ad) throw hata("Dosya adı zorunludur")
    const dosya = await this.dosyalar.dataUrlCoz(b.dataUrl)
    const gecerlilikTarihi = b.gecerlilikTarihi || undefined
    if (gecerlilikTarihi !== undefined && !this.ymdMi(gecerlilikTarihi))
      throw hata("Geçersiz geçerlilik tarihi")
    const donemHata = donemAlanlariHatasi(b.donem, b.bordroBelge)
    if (donemHata) throw hata(donemHata)

    const { dosya: kayit } = await this.yazici.yaz(
      {
        mukellefId: m.id,
        kategori: b.kategori,
        ad,
        mimeType: dosya.mimeType,
        boyut: dosya.boyut,
        yukleyenId: aktor.id,
        gecerlilikTarihi,
        donem: b.donem as string | undefined,
        bordroBelge: b.bordroBelge as BordroBelgeTur | undefined,
      },
      { icerik: dosya.icerik }
    )
    return this.gorunum(kayit.id)
  }

  private ymdMi(v: unknown): v is string {
    return typeof v === "string" && YMD_RE.test(v)
  }

  private async kilitle(id: string) {
    const [d] = await this.txHost.tx
      .select()
      .from(arsivDosya)
      .where(eq(arsivDosya.id, id))
      .for("update")
    if (!d) throw bulunamadi()
    return arsivSatirindan(d)
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, body: unknown): Promise<ArsivDosyaView> {
    const dosya = await this.kilitle(id)
    const b = govde(body)
    const patch: Partial<Record<keyof ArsivDosya, unknown>> = {}
    const degisiklikler: string[] = []

    if (b.ad !== undefined) {
      const ad = typeof b.ad === "string" ? b.ad.trim() : ""
      if (!ad) throw hata("Dosya adı zorunludur")
      if (ad !== dosya.ad) {
        patch.ad = ad
        degisiklikler.push(`adı "${ad}" olarak değiştirildi`)
      }
    }
    if (b.kategori !== undefined) {
      if (!gecerliKategori(b.kategori)) throw hata("Geçersiz kategori")
      if (b.kategori !== dosya.kategori) {
        patch.kategori = b.kategori
        degisiklikler.push(`${ARSIV_KATEGORI_ETIKET[b.kategori]} kategorisine taşındı`)
      }
    }
    const kategori = (patch.kategori as ArsivKategori | undefined) ?? dosya.kategori
    if (b.gecerlilikTarihi !== undefined) {
      if (b.gecerlilikTarihi !== null && !this.ymdMi(b.gecerlilikTarihi))
        throw hata("Geçersiz geçerlilik tarihi")
      patch.gecerlilikTarihi = b.gecerlilikTarihi
      degisiklikler.push("geçerlilik tarihi güncellendi")
    }
    if (!GECERLILIK_GEREKEN.includes(kategori)) patch.gecerlilikTarihi = null

    if (b.donem !== undefined || b.bordroBelge !== undefined) {
      const donemHata = donemAlanlariHatasi(b.donem ?? undefined, b.bordroBelge ?? undefined)
      if (donemHata) throw hata(donemHata)
      const donem = (b.donem ?? undefined) as string | undefined
      if (b.donem !== undefined && donem !== dosya.donem) {
        patch.donem = donem ?? null
        degisiklikler.push(donem ? `dönemi ${formatDonem(donem)}` : "dönemi kaldırıldı")
      }
      const tur = (b.bordroBelge ?? undefined) as BordroBelgeTur | undefined
      if (b.bordroBelge !== undefined && tur !== dosya.bordroBelge) {
        patch.bordroBelge = tur ?? null
        degisiklikler.push(tur ? `belge türü ${BORDRO_BELGE_ETIKET[tur]}` : "belge türü kaldırıldı")
      }
    }
    // Dönem yalnızca bordro / SGK belgelerinde anlamlı; başka kategoriye taşınınca silinir
    if (!DONEMLI_KATEGORILER.includes(kategori)) {
      patch.donem = null
      patch.bordroBelge = null
    }
    // Türsüz dönem olabilir (SGK belgesi), dönemsiz tür olamaz
    if (!("donem" in patch ? patch.donem : dosya.donem)) patch.bordroBelge = null

    await this.txHost.tx
      .update(arsivDosya)
      .set(patch as Partial<typeof arsivDosya.$inferInsert>)
      .where(eq(arsivDosya.id, id))
    if (degisiklikler.length) {
      await this.aktiviteler.log({
        aktorId: aktor.id,
        eylem: "ARSIV_GUNCELLENDI",
        hedefTip: "ARSIV",
        hedefId: dosya.id,
        mukellefId: dosya.mukellefId,
        aciklama: `${dosya.ad}: ${degisiklikler.join(", ")}`,
      })
    }
    return this.gorunum(id)
  }

  @Transactional()
  async geriAl(aktor: Personel, id: string): Promise<ArsivDosyaView> {
    const dosya = await this.kilitle(id)
    if (!dosya.silindi) throw hata("Dosya çöp kutusunda değil")
    await this.txHost.tx
      .update(arsivDosya)
      .set({ silindi: false, silinmeTarihi: null })
      .where(eq(arsivDosya.id, id))
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "ARSIV_GERI_ALINDI",
      hedefTip: "ARSIV",
      hedefId: dosya.id,
      mukellefId: dosya.mukellefId,
      aciklama: dosya.ad,
    })
    return this.gorunum(id)
  }

  async sil(aktor: Personel, id: string, kalici: boolean): Promise<{ id: string }> {
    const dosya = await this.silKaydi(aktor, id, kalici)
    if (kalici) {
      // Satır silindikten (commit) sonra; nesne silinemezse yalnızca öksüz nesne kalır
      const anahtar = arsivAnahtari(dosya.mukellefId, dosya.id)
      await this.dosyalar.sil(anahtar).catch((e: unknown) => {
        this.logger.warn({ err: e, anahtar }, "Arşiv nesnesi silinemedi")
      })
    }
    return { id: dosya.id }
  }

  @Transactional()
  private async silKaydi(aktor: Personel, id: string, kalici: boolean) {
    const dosya = await this.kilitle(id)
    if (kalici) {
      if (!dosya.silindi)
        throw hata("Kalıcı silme yalnızca çöp kutusundaki dosyalar için yapılabilir")
      await this.txHost.tx.delete(arsivDosya).where(eq(arsivDosya.id, id))
    } else {
      if (dosya.silindi) throw hata("Dosya zaten çöp kutusunda")
      await this.txHost.tx
        .update(arsivDosya)
        .set({ silindi: true, silinmeTarihi: this.saat.simdiIso() })
        .where(eq(arsivDosya.id, id))
    }
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: kalici ? "ARSIV_KALICI_SILINDI" : "ARSIV_SILINDI",
      hedefTip: "ARSIV",
      hedefId: dosya.id,
      mukellefId: dosya.mukellefId,
      aciklama: dosya.ad,
    })
    return dosya
  }
}

