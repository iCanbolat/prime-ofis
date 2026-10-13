import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { and, count, desc, eq, ne, type SQL } from "drizzle-orm"
import type { FastifyRequest } from "fastify"

import { KATEGORI_SIRASI } from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_DONEM_RE,
  DONEMLI_KATEGORILER,
  ISTENEN_BORDRO_BELGE,
} from "@prime/shared/bordro/kurallar"
import type {
  GelenEvrakView,
  GelenSayacResponse,
} from "@prime/shared/types/api"
import type { ArsivKategori, GelenEvrakDurum, Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { ArsivYazici } from "../arsiv/arsiv-yazici.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { evrakTalebi, gelenEvrak, mukellef } from "../db/schema/index.js"
import { DosyaErisimKaydi } from "../dosya/dosya-erisim-kaydi.js"
import { DosyaService, gelenAnahtari } from "../dosya/dosya.service.js"
import { EvrakTalebiService, gelenSatirindan } from "./evrak-talebi.service.js"

export interface GelenListeSorgusu {
  durum?: string
  mukellefId?: string
  talepId?: string
}

type Govde = Record<string, unknown>

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })
const bulunamadi = () => new NotFoundException({ message: "Dosya bulunamadı" })
const incelenmis = () => new ConflictException({ message: "Bu dosya zaten incelenmiş" })

/** İptal edilmiş talebin dosyaları büroda listelenmez / sayılmaz */
const talepIptalDegil = ne(evrakTalebi.durum, "IPTAL")

@Injectable()
export class GelenEvrakService {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly talepler: EvrakTalebiService,
    private readonly yazici: ArsivYazici,
    private readonly dosyalar: DosyaService,
    private readonly erisimKaydi: DosyaErisimKaydi,
    private readonly saat: Saat
  ) {}

  // --- Okuma ---------------------------------------------------------------

  async sayac(): Promise<GelenSayacResponse> {
    const [s] = await this.txHost.tx
      .select({ n: count() })
      .from(gelenEvrak)
      .innerJoin(evrakTalebi, eq(evrakTalebi.id, gelenEvrak.talepId))
      .where(and(eq(gelenEvrak.durum, "BEKLIYOR"), talepIptalDegil))
    return { bekleyen: s?.n ?? 0 }
  }

  private async gorunumler(...kosullar: (SQL | undefined)[]): Promise<GelenEvrakView[]> {
    const satirlar = await this.txHost.tx
      .select({
        g: gelenEvrak,
        unvan: mukellef.unvan,
        talepDonem: evrakTalebi.donem,
        talepKanal: evrakTalebi.kanal,
      })
      .from(gelenEvrak)
      .innerJoin(evrakTalebi, eq(evrakTalebi.id, gelenEvrak.talepId))
      .leftJoin(mukellef, eq(mukellef.id, gelenEvrak.mukellefId))
      .where(and(...kosullar))
      .orderBy(desc(gelenEvrak.yuklemeTarihi), desc(gelenEvrak.id))
    return satirlar.map((s) => {
      const g = gelenSatirindan(s.g)
      return {
        ...g,
        mukellefUnvan: s.unvan ?? "",
        talep: {
          id: g.talepId,
          ...(s.talepDonem ? { donem: s.talepDonem } : {}),
          kanal: s.talepKanal,
        },
      }
    })
  }

  liste(s: GelenListeSorgusu): Promise<GelenEvrakView[]> {
    return this.gorunumler(
      talepIptalDegil,
      s.durum ? eq(gelenEvrak.durum, s.durum as GelenEvrakDurum) : undefined,
      s.mukellefId ? eq(gelenEvrak.mukellefId, s.mukellefId) : undefined,
      s.talepId ? eq(gelenEvrak.talepId, s.talepId) : undefined
    )
  }

  private async gorunum(id: string) {
    const [v] = await this.gorunumler(eq(gelenEvrak.id, id))
    if (!v) throw bulunamadi()
    return v
  }

  private async bul(id: string, kilitli = false) {
    const sorgu = this.txHost.tx.select().from(gelenEvrak).where(eq(gelenEvrak.id, id))
    const [g] = kilitli ? await sorgu.for("update") : await sorgu
    if (!g) throw bulunamadi()
    return gelenSatirindan(g)
  }

  async icerik(req: FastifyRequest, aktor: Personel, id: string) {
    const g = await this.bul(id)
    await this.erisimKaydi.kaydet(req, aktor, {
      hedefTip: "EVRAK",
      hedefId: g.id,
      mukellefId: g.mukellefId,
      ad: g.ad,
    })
    const icerik = await this.dosyalar.getir(gelenAnahtari(g.talepId, g.id))
    const dataUrl = icerik
      ? this.dosyalar.dataUrlYap(icerik, g.mimeType)
      : this.dosyalar.yedekDataUrl(g)
    if (!dataUrl) throw new NotFoundException({ message: "Dosya içeriği bulunamadı" })
    return { dataUrl }
  }

  // --- İnceleme ------------------------------------------------------------

  /**
   * Dosyayı arşive kopyalar ve onaylar. Dönemli talepten gelen bordro evrakı (puantaj, imzalı
   * bordro, dekont) arşivde döneme bağlanır; bordro sayfası onu bu alanlarla bulur.
   * Eksik yan etkiler: puantaj → bordro "Girdi geldi" + MUHSGK görev maddesi (Faz 9), fiş /
   * ekstre → okuma kuyruğu (Faz 10).
   */
  async onayla(aktor: Personel, id: string, body: unknown): Promise<GelenEvrakView> {
    const g = await this.bul(id)
    if (g.durum !== "BEKLIYOR") throw incelenmis()
    const b = govde(body)
    if (!KATEGORI_SIRASI.includes(b.kategori as ArsivKategori)) throw hata("Geçersiz kategori")
    const kategori = b.kategori as ArsivKategori
    const ad = typeof b.ad === "string" ? b.ad.trim() : ""
    if (!ad) throw hata("Dosya adı zorunludur")
    const gecerlilikTarihi = b.gecerlilikTarihi || undefined
    if (
      gecerlilikTarihi !== undefined &&
      (typeof gecerlilikTarihi !== "string" || !YMD_RE.test(gecerlilikTarihi))
    )
      throw hata("Geçersiz geçerlilik tarihi")

    const [talep] = await this.txHost.tx
      .select({ donem: evrakTalebi.donem })
      .from(evrakTalebi)
      .where(eq(evrakTalebi.id, g.talepId))
    const donemli =
      DONEMLI_KATEGORILER.includes(kategori) &&
      Boolean(talep?.donem && BORDRO_DONEM_RE.test(talep.donem))

    // Nesne kopyası transaction dışında; eşzamanlı ikinci onay kilitte 409 alır, kopyası silinir
    await this.yazici.yaz(
      {
        mukellefId: g.mukellefId,
        kategori,
        ad,
        mimeType: g.mimeType,
        boyut: g.boyut,
        yukleyenId: aktor.id,
        gecerlilikTarihi,
        ...(donemli && { donem: talep!.donem!, bordroBelge: ISTENEN_BORDRO_BELGE[g.istenen] }),
      },
      {
        kaynakAnahtar: gelenAnahtari(g.talepId, g.id),
        eksikseAtla: !this.dosyalar.uretimde,
      },
      {
        aktivite: false,
        sonra: async (dosya) => {
          const guncel = await this.bul(id, true)
          if (guncel.durum !== "BEKLIYOR") throw incelenmis()
          await this.txHost.tx
            .update(gelenEvrak)
            .set({
              durum: "ONAYLANDI",
              arsivDosyaId: dosya.id,
              inceleyenId: aktor.id,
              incelemeTarihi: this.saat.simdiIso(),
              redNedeni: null,
            })
            .where(eq(gelenEvrak.id, id))
          await this.aktiviteler.log({
            aktorId: aktor.id,
            eylem: "EVRAK_ONAYLANDI",
            hedefTip: "EVRAK",
            hedefId: id,
            mukellefId: g.mukellefId,
            aciklama: `${ad} → arşiv`,
          })
        },
      }
    )
    return this.gorunum(id)
  }

  @Transactional()
  async reddet(aktor: Personel, id: string, body: unknown): Promise<GelenEvrakView> {
    // Kilit sırası portal ile aynı: önce talep, sonra dosya
    const t = await this.talepler.kilitle((await this.bul(id)).talepId)
    const g = await this.bul(id, true)
    if (g.durum !== "BEKLIYOR") throw incelenmis()
    const b = govde(body)
    const neden = typeof b.neden === "string" ? b.neden.trim() : ""
    if (!neden) throw hata("Red nedeni zorunludur")

    await this.txHost.tx
      .update(gelenEvrak)
      .set({
        durum: "REDDEDILDI",
        redNedeni: neden,
        inceleyenId: aktor.id,
        incelemeTarihi: this.saat.simdiIso(),
      })
      .where(eq(gelenEvrak.id, id))
    if (b.yenidenAc && t.durum !== "IPTAL") await this.talepler.yenidenAcYaz(t)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "EVRAK_REDDEDILDI",
      hedefTip: "EVRAK",
      hedefId: id,
      mukellefId: g.mukellefId,
      aciklama: `${g.ad}: ${neden}`,
    })
    return this.gorunum(id)
  }
}
