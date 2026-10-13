import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { and, asc, eq } from "drizzle-orm"

import { ISTENEN_EVRAKLAR, MUSTERI_AKTOR_ID } from "@prime/shared/evrak-talebi/sabitler"
import type { PortalResponse, PortalYukleme } from "@prime/shared/types/api"
import type { EvrakTalebi, IstenenEvrak } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { newId } from "../core/id.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { buro, evrakTalebi, gelenEvrak, mukellef } from "../db/schema/index.js"
import { DosyaService, gelenAnahtari } from "../dosya/dosya.service.js"
import { EvrakTalebiService, talepSatirindan } from "./evrak-talebi.service.js"

type Govde = Record<string, unknown>

const GECERSIZ = "Bu bağlantı geçersiz"
const MAKS_AD = 120
const MAKS_NOT = 500

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })

/**
 * Müşteri portalı (girişsiz). Erişim yalnızca URL'deki token ile; yanıt mükellefin yalnızca
 * ilgili talep bilgisini içerir (VKN, telefon vb. dönmez). Yazmalar talep satırını kilitler:
 * yükleme, silme, tamamlama ve büro incelemesi birbiriyle yarışmaz.
 */
@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly talepler: EvrakTalebiService,
    private readonly dosyalar: DosyaService,
    private readonly saat: Saat
  ) {}

  private async talepBul(token: string, kilitli = false): Promise<EvrakTalebi> {
    const sorgu = this.txHost.tx.select().from(evrakTalebi).where(eq(evrakTalebi.token, token))
    const [t] = kilitli ? await sorgu.for("update") : await sorgu
    if (!t) throw new NotFoundException({ message: GECERSIZ })
    return talepSatirindan(t)
  }

  /** Aktif değilse 410 */
  private aktifOlmali(t: EvrakTalebi) {
    const durum = this.talepler.durum(t)
    if (durum === "AKTIF") return
    throw new GoneException({
      message:
        durum === "SURESI_DOLDU"
          ? "Bu bağlantının süresi dolmuş"
          : durum === "IPTAL"
            ? "Bu talep iptal edilmiş"
            : "Bu talep tamamlanmış",
    })
  }

  private async yuklemeler(talepId: string): Promise<PortalYukleme[]> {
    const satirlar = await this.txHost.tx
      .select({
        id: gelenEvrak.id,
        istenen: gelenEvrak.istenen,
        ad: gelenEvrak.ad,
        mimeType: gelenEvrak.mimeType,
        boyut: gelenEvrak.boyut,
        durum: gelenEvrak.durum,
        redNedeni: gelenEvrak.redNedeni,
        yuklemeTarihi: gelenEvrak.yuklemeTarihi,
      })
      .from(gelenEvrak)
      .where(eq(gelenEvrak.talepId, talepId))
      .orderBy(asc(gelenEvrak.yuklemeTarihi), asc(gelenEvrak.id))
    return satirlar.map(({ redNedeni, ...y }) => ({ ...y, ...(redNedeni ? { redNedeni } : {}) }))
  }

  private async yanit(t: EvrakTalebi): Promise<PortalResponse> {
    const [[b], [m], yuklemeler] = await Promise.all([
      this.txHost.tx.select({ ad: buro.ad, telefon: buro.telefon }).from(buro).limit(1),
      this.txHost.tx
        .select({ unvan: mukellef.unvan })
        .from(mukellef)
        .where(eq(mukellef.id, t.mukellefId)),
      this.yuklemeler(t.id),
    ])
    return {
      durum: this.talepler.durum(t),
      buro: { ad: b?.ad ?? "", telefon: b?.telefon ?? "" },
      mukellefUnvan: m?.unvan ?? "",
      istenenler: t.istenenler,
      ...(t.donem ? { donem: t.donem } : {}),
      ...(t.aciklama ? { aciklama: t.aciklama } : {}),
      sonKullanma: t.sonKullanma,
      // Puantaj yerine "Bu ay değişiklik yok" bordro takibiyle (Faz 9) gelir
      degisiklikYokSecilebilir: false,
      yuklemeler,
    }
  }

  async getir(token: string): Promise<PortalResponse> {
    return this.yanit(await this.talepBul(token))
  }

  async yukle(token: string, body: unknown): Promise<PortalYukleme> {
    const t = await this.talepBul(token)
    this.aktifOlmali(t)
    const b = govde(body)
    if (!t.istenenler.includes(b.istenen as IstenenEvrak))
      throw hata("Bu evrak bu talepte istenmiyor")
    const istenen = b.istenen as IstenenEvrak
    const ad = typeof b.ad === "string" ? b.ad.trim().slice(0, MAKS_AD) : ""
    if (!ad) throw hata("Dosya adı zorunludur")
    const dosya = await this.dosyalar.dataUrlCoz(b.dataUrl)

    // Önce nesne, sonra satır; transaction hata verirse nesne silinir
    const id = newId("g")
    const anahtar = gelenAnahtari(t.id, id)
    await this.dosyalar.koy(anahtar, dosya)
    try {
      await this.yuklemeKaydet(token, {
        id,
        istenen,
        ad,
        mimeType: dosya.mimeType,
        boyut: dosya.boyut,
      })
    } catch (e) {
      await this.dosyalar.sil(anahtar).catch((err: unknown) => {
        this.logger.warn({ err, anahtar }, "Öksüz gelen evrak nesnesi silinemedi")
      })
      throw e
    }
    const yukleme = (await this.yuklemeler(t.id)).find((y) => y.id === id)
    return yukleme!
  }

  @Transactional()
  private async yuklemeKaydet(
    token: string,
    y: Pick<PortalYukleme, "id" | "istenen" | "ad" | "mimeType" | "boyut">
  ) {
    // Doğrulamadan sonra talep kapanmış olabilir: kilit altında yeniden bakılır
    const t = await this.talepBul(token, true)
    this.aktifOlmali(t)
    await this.txHost.tx.insert(gelenEvrak).values({
      ...y,
      talepId: t.id,
      mukellefId: t.mukellefId,
      yuklemeTarihi: this.saat.simdiIso(),
      durum: "BEKLIYOR",
    })
    await this.aktiviteler.log({
      aktorId: MUSTERI_AKTOR_ID,
      eylem: "EVRAK_YUKLENDI",
      hedefTip: "EVRAK",
      hedefId: y.id,
      mukellefId: t.mukellefId,
      aciklama: `${y.ad} (${ISTENEN_EVRAKLAR[y.istenen].ad})`,
    })
  }

  async sil(token: string, id: string): Promise<{ id: string }> {
    const talepId = await this.silKaydi(token, id)
    // Satır silindikten (commit) sonra; nesne silinemezse yalnızca öksüz nesne kalır
    const anahtar = gelenAnahtari(talepId, id)
    await this.dosyalar.sil(anahtar).catch((err: unknown) => {
      this.logger.warn({ err, anahtar }, "Gelen evrak nesnesi silinemedi")
    })
    return { id }
  }

  @Transactional()
  private async silKaydi(token: string, id: string) {
    const t = await this.talepBul(token, true)
    this.aktifOlmali(t)
    const [g] = await this.txHost.tx
      .select({ durum: gelenEvrak.durum })
      .from(gelenEvrak)
      .where(and(eq(gelenEvrak.id, id), eq(gelenEvrak.talepId, t.id)))
      .for("update")
    if (!g) throw new NotFoundException({ message: "Dosya bulunamadı" })
    if (g.durum !== "BEKLIYOR")
      throw new ConflictException({ message: "İncelenmiş dosyalar silinemez" })
    await this.txHost.tx.delete(gelenEvrak).where(eq(gelenEvrak.id, id))
    return t.id
  }

  @Transactional()
  async tamamla(token: string, body: unknown): Promise<PortalResponse> {
    const t = await this.talepBul(token, true)
    this.aktifOlmali(t)
    const b = govde(body)
    // "Bu ay değişiklik yok" bordro takibiyle (Faz 9) gelir; şimdilik hiçbir talepte seçilemez
    if (b.degisiklikYok === true) throw hata("Bu talepte değişiklik yok bildirilemez")
    const bekleyen = await this.txHost.tx.$count(
      gelenEvrak,
      and(eq(gelenEvrak.talepId, t.id), eq(gelenEvrak.durum, "BEKLIYOR"))
    )
    if (bekleyen === 0) throw hata("Göndermeden önce en az bir dosya yükleyin")
    const not = typeof b.not === "string" ? b.not.trim().slice(0, MAKS_NOT) : ""

    await this.txHost.tx
      .update(evrakTalebi)
      .set({
        durum: "TAMAMLANDI",
        tamamlanmaTarihi: this.saat.simdiIso(),
        ...(not ? { musteriNotu: not } : {}),
      })
      .where(eq(evrakTalebi.id, t.id))
    await this.aktiviteler.log({
      aktorId: MUSTERI_AKTOR_ID,
      eylem: "TALEP_TAMAMLANDI",
      hedefTip: "EVRAK",
      hedefId: t.id,
      mukellefId: t.mukellefId,
      aciklama: `${bekleyen} dosya`,
    })
    return this.yanit(await this.talepBul(token))
  }
}
