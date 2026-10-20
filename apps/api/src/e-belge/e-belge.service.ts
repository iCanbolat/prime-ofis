import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleInit,
} from "@nestjs/common"
import { format, subMonths } from "date-fns"
import { and, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm"
import type { FastifyRequest } from "fastify"

import type {
  BaglantiDogrulamaSonucu,
  EntegratorBerat,
  EntegratorFatura,
  EntegratorKimlik,
} from "@prime/shared/e-belge/entegrator-adapter"
import {
  baglantiHatasi,
  EBELGE_DONEM_RE,
  EBELGE_TURLERI,
  EBELGE_YONLERI,
  faturaFiltreHatasi,
  kontorAlimHatasi,
  lucaAktarimHatasi,
} from "@prime/shared/e-belge/girdi"
import { lucaFirmasindanMukellef } from "@prime/shared/e-belge/luca-mukellef"
import {
  donemTuketimi,
  kontorBakiyesi,
  mukellefTuketimleri,
  sonDonemler,
} from "@prime/shared/e-belge/kontor"
import {
  beratTakvimId,
  YANIT_UYARI_GUN,
  yanitDurumu,
  yanitKalanGun,
} from "@prime/shared/e-belge/kurallar"
import { SAYFA_BOYUTU } from "@prime/shared/e-belge/sabitler"
import { toYmd } from "@prime/shared/lib/tarih"
import { yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import type {
  BaglantiKaydetRequest,
  BeratListResponse,
  BeratView,
  EBelgeDetay,
  EBelgeIcerikResponse,
  EBelgeListResponse,
  EBelgeOzetResponse,
  EBelgeView,
  EntegratorBaglantiView,
  KontorAlimRequest,
  KontorAlimView,
  KontorOzetResponse,
  LucaFirmaAktarimRequest,
  LucaFirmaAktarimSonucu,
  SenkronResponse,
} from "@prime/shared/types/api"
import type {
  EBelge,
  EBelgeTur,
  EBelgeYon,
  EDefterBerat,
  EFaturaYanit,
  EntegratorBaglanti,
  GibDurumu,
  KontorAlim,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { ArsivYazici } from "../arsiv/arsiv-yazici.js"
import { BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { SecretBox } from "../core/secret-box.js"
import { sayfala } from "../core/sayfala.js"
import type { DrizzleTx } from "../db/db.module.js"
import {
  arsivDosya,
  ebelge,
  edefterBerat,
  entegratorBaglanti,
  kontorAlim,
  lucaHesap,
  mukellef,
  personel,
} from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { DosyaErisimKaydi } from "../dosya/dosya-erisim-kaydi.js"
import { HatirlatmaService } from "../hatirlatma/hatirlatma.service.js"
import { BeyanDurumuService } from "../takvim/beyan-durumu.service.js"
import { MukellefService } from "../mukellef/mukellef.service.js"
import { Entegrator } from "./entegrator.js"
import { LucaDogrulamaGerekli, LucaOturumService } from "./luca-portal/luca-oturum.service.js"


type BaglantiSatiri = typeof entegratorBaglanti.$inferSelect
type EBelgeSatiri = typeof ebelge.$inferSelect

const baglantiSatirindan = (b: BaglantiSatiri): EntegratorBaglanti =>
  nullsuz(b) as EntegratorBaglanti
const ebelgeSatirindan = (e: EBelgeSatiri): EBelge => nullsuz(e) as EBelge
const beratSatirindan = (b: typeof edefterBerat.$inferSelect): EDefterBerat => ({
  id: `${b.mukellefId}:${b.donem}`,
  ...nullsuz(b),
})
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const trIcerir = (metin: string | undefined, aranan: string) =>
  Boolean(metin && kucuk(metin).includes(kucuk(aranan)))

export interface FaturaSorgusu {
  mukellefId?: string
  tur?: string
  yon?: string
  gibDurumu?: string
  yanit?: string
  yanitYaklasan?: string
  q?: string
  baslangic?: string
  bitis?: string
  sirala?: string
  siralamaYonu?: string
  sayfa?: string
  sayfaBoyutu?: string
}

interface MukellefSenkronu {
  yeniFatura: number
  guncellenenFatura: number
  onaylananBerat: number
}

/** Berat matrisi dönemleri: içinde bulunulan aydan önceki 12 ay */
export function beratDonemleri(bugunYmd: string): string[] {
  const ay = new Date(`${bugunYmd.slice(0, 7)}-01T00:00:00`)
  return Array.from({ length: 12 }, (_, i) => format(subMonths(ay, 12 - i), "yyyy-MM"))
}

/**
 * e-Belge (mock `handlers/e-belge.ts`): Luca bağlantıları, artımlı senkron (faturalar ETTN ile
 * upsert, onaylı berat → takvim), fatura listesi / detay / içerik / ticari yanıt / arşive kayıt,
 * berat matrisi, özet ve kontör. Entegratöre erişim `Entegrator` üzerinden.
 */
@Injectable()
export class EBelgeService implements OnModuleInit {
  private readonly logger = new Logger(EBelgeService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly entegrator: Entegrator,
    private readonly kutu: SecretBox,
    private readonly aktiviteler: AktiviteService,
    private readonly bildirimler: BildirimService,
    private readonly beyanlar: BeyanDurumuService,
    private readonly yazici: ArsivYazici,
    private readonly erisim: DosyaErisimKaydi,
    private readonly hatirlatma: HatirlatmaService,
    private readonly seed: SeedYukleyici,
    private readonly oturum: LucaOturumService,
    private readonly mukellefler: MukellefService,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      if (state.baglanti.length) await db.insert(entegratorBaglanti).values(state.baglanti)
      // Mock şifre SecretBox ile şifrelenir (anahtar yoksa hesap atlanır)
      if (state.lucaHesap.length && this.kutu.hazir) {
        await db
          .insert(lucaHesap)
          .values(state.lucaHesap.map((h) => ({ ...h, sifre: this.kutu.sifrele(h.sifre) })))
      }
      if (state.ebelge.length) await db.insert(ebelge).values(state.ebelge)
      if (state.berat.length) {
        await db.insert(edefterBerat).values(state.berat.map(({ id: _id, ...b }) => b))
      }
      if (state.kontor.length) await db.insert(kontorAlim).values(state.kontor)
    })

    // EBELGE bildirimlerinde e-Arşiv faturası e-Arşiv sekmesine bağlanır
    this.bildirimler.cozucuEkle({
      oncelik: 30,
      cozumle: async (log) => {
        if (log.hedefTip !== "EBELGE" || !log.hedefId) return undefined
        const [e] = await this.txHost.tx
          .select({ tur: ebelge.tur })
          .from(ebelge)
          .where(eq(ebelge.id, log.hedefId))
        return e?.tur === "E_ARSIV" ? { baglam: { eArsiv: true } } : undefined
      },
    })

    this.hatirlatma.ureticiEkle("efatura-yanit", (_bugun, simdi) => this.yanitHatirlatmalari(simdi))

  }

  // Luca portalında gece senkronu yok: doğrulama ekranını çözecek personel yok, senkronu
  // personel başlatır

  // --- Bağlantılar -------------------------------------------------------------------

  async baglantilar(): Promise<EntegratorBaglantiView[]> {
    const satirlar = await this.txHost.tx
      .select({ m: mukellef, b: entegratorBaglanti })
      .from(mukellef)
      .leftJoin(entegratorBaglanti, eq(entegratorBaglanti.mukellefId, mukellef.id))
      .where(eq(mukellef.aktif, true))
    return satirlar
      .map(({ m, b }) => baglantiView(m, b))
      .sort((a, b) => a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR"))
  }

  async baglanti(mukellefId: string): Promise<EntegratorBaglantiView> {
    const [s] = await this.txHost.tx
      .select({ m: mukellef, b: entegratorBaglanti })
      .from(mukellef)
      .leftJoin(entegratorBaglanti, eq(entegratorBaglanti.mukellefId, mukellef.id))
      .where(eq(mukellef.id, mukellefId))
    if (!s) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    return baglantiView(s.m, s.b)
  }

  async baglantiKaydet(
    aktor: Personel,
    mukellefId: string,
    body: BaglantiKaydetRequest
  ): Promise<EntegratorBaglantiView> {
    const [m] = await this.txHost.tx.select().from(mukellef).where(eq(mukellef.id, mukellefId))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    const hata = baglantiHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const kimlik: EntegratorKimlik = { mukellefId, lucaFirmaId: body.lucaFirmaId.trim() }
    const [baskasi] = await this.txHost.tx
      .select({ mukellefId: entegratorBaglanti.mukellefId })
      .from(entegratorBaglanti)
      .where(eq(entegratorBaglanti.lucaFirmaId, kimlik.lucaFirmaId!))
    if (baskasi && baskasi.mukellefId !== mukellefId)
      throw new ConflictException({ message: "Bu Luca firması başka bir mükellefe eşlenmiş" })
    // Entegratöre bağlanılırken transaction açık tutulmaz
    const d = await this.entegrator.baglantiDogrula(kimlik)
    if (!d.gecerli)
      throw new UnprocessableEntityException({
        message: d.hataMesaji ?? "Luca bağlantısı doğrulanamadı",
      })
    await this.baglantiYaz(aktor, m.id, this.baglantiSatiri(aktor, m.id, kimlik.lucaFirmaId!, d))
    return this.baglanti(m.id)
  }

  @Transactional()
  private async baglantiYaz(
    aktor: Personel,
    mukellefId: string,
    satir: Omit<BaglantiSatiri, "sonSenkron">
  ) {
    const { id: _id, mukellefId: _m, ...guncelleme } = satir
    // Mevcut `son_senkron` korunur
    await this.txHost.tx
      .insert(entegratorBaglanti)
      .values(satir)
      .onConflictDoUpdate({ target: entegratorBaglanti.mukellefId, set: guncelleme })
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "ENTEGRATOR_BAGLANDI",
      hedefTip: "MUKELLEF",
      hedefId: mukellefId,
      mukellefId,
      aciklama: `Luca firması ${satir.lucaFirmaId}`,
    })
  }

  private baglantiSatiri(
    aktor: Personel,
    mukellefId: string,
    lucaFirmaId: string,
    d: Omit<BaglantiDogrulamaSonucu, "gecerli" | "hataMesaji">
  ): Omit<BaglantiSatiri, "sonSenkron"> {
    return {
      id: `n_${mukellefId}`,
      mukellefId,
      durum: "BAGLI",
      eFatura: d.eFatura,
      eArsiv: d.eArsiv,
      eDefter: d.eDefter,
      postaKutusu: d.postaKutusu ?? null,
      lucaFirmaId,
      hataMesaji: null,
      baglayanId: aktor.id,
      baglanmaTarihi: this.saat.simdiIso(),
    }
  }

  /**
   * Luca firmalarından mükellef (yönetici): eşli firma atlanır, VKN/TCKN'si kayıtlı mükellef
   * firmaya eşlenir, diğerleri için mükellef açılıp eşlenir. Firma listesi bir kez okunur; her
   * firma kendi transaction'ında yazılır, birinin hatası diğerlerini durdurmaz.
   */
  async lucaFirmalariniAktar(aktor: Personel, body: unknown): Promise<LucaFirmaAktarimSonucu> {
    const hata = lucaAktarimHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const { firmaIdler, sorumluPersonelId } = body as LucaFirmaAktarimRequest
    const firmalar = new Map((await this.oturum.firmalarHam()).map((f) => [f.firmaId, f]))
    const eslemeler = new Set(
      (
        await this.txHost.tx
          .select({ firmaId: entegratorBaglanti.lucaFirmaId })
          .from(entegratorBaglanti)
      ).map((b) => b.firmaId)
    )
    const sonuc: LucaFirmaAktarimSonucu = { olusturulan: 0, eslenen: 0, atlanan: 0, hatalar: [] }
    for (const firmaId of new Set(firmaIdler.map((f) => f.trim()))) {
      const f = firmalar.get(firmaId)
      if (!f) {
        sonuc.hatalar.push({ firmaId, unvan: "—", mesaj: "Firma Luca hesabında bulunamadı" })
        continue
      }
      if (eslemeler.has(firmaId)) {
        sonuc.atlanan++
        continue
      }
      try {
        const yeni = await this.txHost.withTransaction(async () => {
          const kimlik = f.vknTckn?.trim()
          const [mevcut] = kimlik
            ? await this.txHost.tx
                .select({ id: mukellef.id })
                .from(mukellef)
                .where(or(eq(mukellef.vkn, kimlik), eq(mukellef.tckn, kimlik)))
            : []
          const mukellefId =
            mevcut?.id ??
            (
              await this.mukellefler.lucaFirmasindanOlustur(
                aktor,
                lucaFirmasindanMukellef(f, sorumluPersonelId)
              )
            ).id
          const satir = this.baglantiSatiri(aktor, mukellefId, firmaId, f)
          const { id: _id, mukellefId: _m, ...guncelleme } = satir
          await this.txHost.tx
            .insert(entegratorBaglanti)
            .values(satir)
            .onConflictDoUpdate({ target: entegratorBaglanti.mukellefId, set: guncelleme })
          return !mevcut
        })
        if (yeni) sonuc.olusturulan++
        else sonuc.eslenen++
        eslemeler.add(firmaId)
      } catch (e) {
        if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e
        const r = e.getResponse()
        sonuc.hatalar.push({
          firmaId,
          unvan: f.unvan,
          mesaj:
            typeof r === "object" && r && "message" in r ? String(r.message) : e.message,
        })
      }
    }
    if (sonuc.olusturulan + sonuc.eslenen > 0)
      await this.aktiviteler.log({
        aktorId: aktor.id,
        eylem: "LUCA_FIRMALARI_AKTARILDI",
        aciklama: `${sonuc.olusturulan} yeni mükellef, ${sonuc.eslenen} eşleme`,
      })
    return sonuc
  }

  @Transactional()
  async baglantiKaldir(aktor: Personel, mukellefId: string) {
    const silinen = await this.txHost.tx
      .delete(entegratorBaglanti)
      .where(eq(entegratorBaglanti.mukellefId, mukellefId))
      .returning({ id: entegratorBaglanti.id })
    if (!silinen.length) throw new NotFoundException({ message: "Bağlantı bulunamadı" })
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "ENTEGRATOR_BAGLANTI_KALDIRILDI",
      hedefTip: "MUKELLEF",
      hedefId: mukellefId,
      mukellefId,
    })
  }

  // --- Senkron -----------------------------------------------------------------------

  /** Bağlı mükellefleri senkronlar (personel başlatır; gece işi yok) */
  async senkron(aktor: Personel, mukellefId?: string): Promise<SenkronResponse> {
    const kosullar: SQL[] = [
      sql`${entegratorBaglanti.durum} <> 'BAGLI_DEGIL'`,
      eq(mukellef.aktif, true),
    ]
    if (mukellefId) kosullar.push(eq(entegratorBaglanti.mukellefId, mukellefId))
    const hedefler = await this.txHost.tx
      .select({ b: entegratorBaglanti, unvan: mukellef.unvan })
      .from(entegratorBaglanti)
      .innerJoin(mukellef, eq(mukellef.id, entegratorBaglanti.mukellefId))
      .where(and(...kosullar))
    if (mukellefId && !hedefler.length)
      throw new ConflictException({ message: "Mükellefin Luca bağlantısı yok" })

    const aktorId = aktor.id
    const yanit: SenkronResponse = {
      mukellefSayisi: 0,
      yeniFatura: 0,
      guncellenenFatura: 0,
      onaylananBerat: 0,
      hatali: [],
      sonSenkron: this.saat.simdiIso(),
    }
    for (const { b, unvan } of hedefler) {
      if (b.durum === "HATA") {
        yanit.hatali.push({ mukellefId: b.mukellefId, unvan, mesaj: b.hataMesaji ?? "Bağlantı hatası" })
        continue
      }
      try {
        const s = await this.mukellefiSenkronizeEt(b, aktorId)
        yanit.mukellefSayisi++
        yanit.yeniFatura += s.yeniFatura
        yanit.guncellenenFatura += s.guncellenenFatura
        yanit.onaylananBerat += s.onaylananBerat
      } catch (e) {
        // Doğrulama kodu bekleniyor: diğer mükellefler de aynı oturumu bekler, senkron durur
        if (e instanceof LucaDogrulamaGerekli) throw e
        const mesaj =
          (e as { response?: { message?: string } }).response?.message ??
          "Luca'dan veri alınamadı"
        this.logger.warn(`${b.mukellefId} senkronu başarısız: ${mesaj}`)
        yanit.hatali.push({ mukellefId: b.mukellefId, unvan, mesaj })
      }
    }

    if (yanit.mukellefSayisi > 0) {
      try {
        await this.entegrator.kontorBakiyesiOku()
      } catch (e) {
        if (e instanceof LucaDogrulamaGerekli) throw e
        this.logger.warn(`Luca kontör bakiyesi okunamadı: ${(e as Error).message}`)
      }
    }

    await this.aktiviteler.log({
      aktorId,
      eylem: "EBELGE_SENKRONIZE_EDILDI",
      hedefTip: "EBELGE",
      mukellefId,
      aciklama: `${yanit.yeniFatura} yeni fatura, ${yanit.onaylananBerat} berat`,
    })
    return yanit
  }

  /** Entegratör çağrıları transaction dışında; yazma mükellef başına tek transaction'da */
  private async mukellefiSenkronizeEt(b: BaglantiSatiri, aktorId: string) {
    const k = this.kimlik(b)
    const faturalar: EntegratorFatura[] = []
    for (const tur of EBELGE_TURLERI.filter((t) => (t === "E_FATURA" ? b.eFatura : b.eArsiv))) {
      for (const yon of EBELGE_YONLERI) {
        faturalar.push(
          ...(await this.entegrator.faturalariGetir(k, {
            tur,
            yon,
            sonra: b.sonSenkron ?? undefined,
          }))
        )
      }
    }
    const beratlar: EntegratorBerat[] = []
    if (b.eDefter) {
      const yillar = new Set(beratDonemleri(this.bugun()).map((d) => d.slice(0, 4)))
      for (const yil of yillar) beratlar.push(...(await this.entegrator.beratDurumlari(k, yil)))
    }
    return this.senkronYaz(b, faturalar, beratlar, aktorId)
  }

  @Transactional()
  private async senkronYaz(
    b: BaglantiSatiri,
    faturalar: EntegratorFatura[],
    beratlar: EntegratorBerat[],
    aktorId: string
  ): Promise<MukellefSenkronu> {
    const tx = this.txHost.tx
    const sonuc: MukellefSenkronu = { yeniFatura: 0, guncellenenFatura: 0, onaylananBerat: 0 }
    for (const f of faturalar) {
      const [s] = await tx
        .insert(ebelge)
        .values({ ...f, id: newId("f"), mukellefId: b.mukellefId })
        .onConflictDoUpdate({ target: ebelge.ettn, set: { gibDurumu: f.gibDurumu } })
        .returning({ yeni: sql<boolean>`(xmax = 0)` })
      if (s?.yeni) sonuc.yeniFatura++
      else sonuc.guncellenenFatura++
    }

    if (beratlar.length) {
      const onceki = new Map(
        (
          await tx
            .select()
            .from(edefterBerat)
            .where(eq(edefterBerat.mukellefId, b.mukellefId))
            .for("update")
        ).map((x) => [x.donem, x.durum])
      )
      for (const berat of beratlar) {
        if (onceki.get(berat.donem) === berat.durum) continue
        const satir = {
          mukellefId: b.mukellefId,
          donem: berat.donem,
          durum: berat.durum,
          yuklemeTarihi: berat.yuklemeTarihi ?? null,
          onayTarihi: berat.onayTarihi ?? null,
          hataMesaji: berat.hataMesaji ?? null,
        }
        const { mukellefId: _m, donem: _d, ...guncelleme } = satir
        await tx
          .insert(edefterBerat)
          .values(satir)
          .onConflictDoUpdate({
            target: [edefterBerat.mukellefId, edefterBerat.donem],
            set: guncelleme,
          })
        if (berat.durum !== "ONAYLANDI") continue
        sonuc.onaylananBerat++
        // Takvim senkronu yalnızca ileri yönde: zaten onaylı beyana dokunulmaz
        await this.beyanlar.yaz(beratTakvimId(b.mukellefId, berat.donem), "ONAYLANDI", aktorId, {
          aciklamaEki: " (Luca berat)",
          yalnizIleri: true,
        })
      }
    }

    await tx
      .update(entegratorBaglanti)
      .set({ sonSenkron: this.saat.simdiIso() })
      .where(eq(entegratorBaglanti.id, b.id))
    return sonuc
  }

  // --- Faturalar ---------------------------------------------------------------------

  async faturalar(s: FaturaSorgusu): Promise<EBelgeListResponse> {
    const hata = faturaFiltreHatasi(s)
    if (hata) throw new BadRequestException({ message: hata })
    const kosullar: SQL[] = []
    if (s.mukellefId) kosullar.push(eq(ebelge.mukellefId, s.mukellefId))
    if (s.tur) kosullar.push(eq(ebelge.tur, s.tur as EBelgeTur))
    if (s.yon) kosullar.push(eq(ebelge.yon, s.yon as EBelgeYon))
    if (s.gibDurumu) kosullar.push(eq(ebelge.gibDurumu, s.gibDurumu as GibDurumu))
    if (s.baslangic) kosullar.push(gte(ebelge.duzenlemeTarihi, s.baslangic))
    if (s.bitis) kosullar.push(lte(ebelge.duzenlemeTarihi, s.bitis))
    const simdi = this.saat.simdi()
    const q = s.q?.trim()
    const artan = s.siralamaYonu === "asc"
    const tutaraGore = s.sirala === "toplam"

    const filtreli = (await this.viewlar(and(...kosullar), simdi))
      .filter(
        (e) =>
          (!s.yanit || e.yanit === (s.yanit as EFaturaYanit)) &&
          (s.yanitYaklasan !== "true" ||
            (e.yanit === "BEKLIYOR" && (e.yanitKalanGun ?? 99) <= YANIT_UYARI_GUN)) &&
          (!q ||
            trIcerir(e.belgeNo, q) ||
            trIcerir(e.karsiTaraf.unvan, q) ||
            e.karsiTaraf.vknTckn.includes(q) ||
            trIcerir(e.mukellefUnvan, q))
      )
      .sort((a, b) => {
        const fark = tutaraGore
          ? a.toplam - b.toplam
          : a.duzenlemeTarihi.localeCompare(b.duzenlemeTarihi) ||
            a.alinmaTarihi.localeCompare(b.alinmaTarihi)
        return artan ? fark : -fark
      })

    return {
      ...sayfala(filtreli, s, { varsayilan: SAYFA_BOYUTU, kip: "serbest" }),
      toplamTutar:
        Math.round(
          filtreli.filter((e) => e.paraBirimi === "TRY").reduce((t, e) => t + e.toplam, 0) * 100
        ) / 100,
    }
  }

  async detay(id: string): Promise<EBelgeDetay> {
    const { e, m, b } = await this.faturaBul(id)
    return {
      ...ebelgeView(e, m.unvan, this.saat.simdi()),
      mukellefVknTckn: m.vkn ?? m.tckn ?? "",
      kalemler: b ? await this.entegrator.faturaKalemleri(this.kimlik(b), e.ettn) : [],
    }
  }

  async icerik(req: FastifyRequest, aktor: Personel, id: string): Promise<EBelgeIcerikResponse> {
    const { e, b } = await this.faturaBul(id)
    if (!b) throw new ConflictException({ message: "Mükellefin Luca bağlantısı yok" })
    const ad = `${e.belgeNo}.pdf`
    const dataUrl = await this.entegrator.faturaIcerik(this.kimlik(b), e.ettn, "PDF")
    await this.erisim.kaydet(req, aktor, {
      hedefTip: "EBELGE",
      hedefId: e.id,
      mukellefId: e.mukellefId,
      ad,
    })
    return { dataUrl, ad }
  }

  async arsiveKaydet(aktor: Personel, id: string): Promise<EBelgeView> {
    const { e, m, b } = await this.faturaBul(id)
    await this.arsivdeMi(e.arsivDosyaId)
    if (!b) throw new ConflictException({ message: "Mükellefin Luca bağlantısı yok" })
    const dataUrl = await this.entegrator.faturaIcerik(this.kimlik(b), e.ettn, "PDF")
    const icerik = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")
    // "… A.Ş." ile biten unvanlarda çift nokta oluşmasın
    const ad = `${e.belgeNo} - ${e.karsiTaraf.unvan.replace(/\.+$/, "")}.pdf`
    const { sonuc } = await this.yazici.yaz(
      {
        mukellefId: e.mukellefId,
        kategori: "FATURA",
        ad,
        mimeType: "application/pdf",
        boyut: icerik.length,
        yukleyenId: aktor.id,
      },
      { icerik },
      {
        aktivite: false,
        sonra: async (dosya) => {
          const tx = this.txHost.tx
          // Eşzamanlı ikinci istek: kilitten sonra yeniden denetlenir (hata → nesne silinir)
          const [kilitli] = await tx.select().from(ebelge).where(eq(ebelge.id, id)).for("update")
          await this.arsivdeMi(kilitli?.arsivDosyaId ?? null)
          const [g] = await tx
            .update(ebelge)
            .set({ arsivDosyaId: dosya.id })
            .where(eq(ebelge.id, id))
            .returning()
          await this.aktiviteler.log({
            aktorId: aktor.id,
            eylem: "EBELGE_ARSIVE_KAYDEDILDI",
            hedefTip: "ARSIV",
            hedefId: dosya.id,
            mukellefId: e.mukellefId,
            aciklama: ad,
          })
          return g!
        },
      }
    )
    return ebelgeView(ebelgeSatirindan(sonuc!), m.unvan, this.saat.simdi())
  }

  /** Silinmemiş arşiv kaydı varsa 409 + `arsivDosyaId` */
  private async arsivdeMi(arsivDosyaId: string | null | undefined) {
    if (!arsivDosyaId) return
    const [d] = await this.txHost.tx
      .select({ id: arsivDosya.id, silindi: arsivDosya.silindi })
      .from(arsivDosya)
      .where(eq(arsivDosya.id, arsivDosyaId))
    if (d && !d.silindi)
      throw new ConflictException({ message: "Fatura zaten arşivde", arsivDosyaId: d.id })
  }

  // --- e-Defter, özet, kontör ----------------------------------------------------------

  async beratlar(mukellefId?: string): Promise<BeratListResponse> {
    const bugun = this.bugun()
    const donemler = beratDonemleri(bugun)
    const kosullar: SQL[] = [
      eq(entegratorBaglanti.eDefter, true),
      sql`${entegratorBaglanti.durum} <> 'BAGLI_DEGIL'`,
      eq(mukellef.aktif, true),
    ]
    if (mukellefId) kosullar.push(eq(mukellef.id, mukellefId))
    const mukellefler = (
      await this.txHost.tx
        .select({ m: mukellef })
        .from(entegratorBaglanti)
        .innerJoin(mukellef, eq(mukellef.id, entegratorBaglanti.mukellefId))
        .where(and(...kosullar))
    ).map(({ m }) => nullsuz(m) as Mukellef)
    if (!mukellefler.length) return { donemler, items: [] }
    const kayitlar = new Map(
      (
        await this.txHost.tx
          .select()
          .from(edefterBerat)
          .where(inArray(edefterBerat.mukellefId, mukellefler.map((m) => m.id)))
      )
        .map(beratSatirindan)
        .map((b) => [b.id, b])
    )

    const items: BeratView[] = []
    for (const m of mukellefler) {
      const sonTarihler = new Map(
        yukumlulukleriHesapla(m, {
          baslangic: `${donemler[0]}-01`,
          bitis: `${Number(bugun.slice(0, 4)) + 1}-12-31`,
        })
          .filter((y) => y.tip === "E_DEFTER_BERAT")
          .map((y) => [y.donem, y.sonTarih])
      )
      for (const donem of donemler) {
        const id = `${m.id}:${donem}`
        const kayit = kayitlar.get(id) ?? {
          id,
          mukellefId: m.id,
          donem,
          durum: "YUKLENMEDI" as const,
        }
        const sonTarih = sonTarihler.get(donem)
        items.push({
          ...kayit,
          mukellefUnvan: m.unvan,
          ...(sonTarih ? { sonTarih } : {}),
          gecikti: Boolean(sonTarih && sonTarih < bugun && kayit.durum !== "ONAYLANDI"),
        })
      }
    }
    items.sort((a, b) => a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR"))
    return { donemler, items }
  }

  async ozet(sorumlu?: string): Promise<EBelgeOzetResponse> {
    const kosullar: SQL[] = [eq(mukellef.aktif, true)]
    if (sorumlu) kosullar.push(eq(mukellef.sorumluPersonelId, sorumlu))
    const simdi = this.saat.simdi()
    const tx = this.txHost.tx
    const belgeler = await this.viewlar(and(...kosullar), simdi)
    const bekleyen = belgeler.filter((e) => e.yanit === "BEKLIYOR")
    const baglantilar = (
      await tx
        .select({ b: entegratorBaglanti })
        .from(entegratorBaglanti)
        .innerJoin(mukellef, eq(mukellef.id, entegratorBaglanti.mukellefId))
        .where(and(...kosullar))
    ).map(({ b }) => b)
    const kapsam = new Set(baglantilar.map((b) => b.mukellefId))
    const senkronlar = baglantilar
      .map((b) => b.sonSenkron)
      .filter((s): s is string => Boolean(s))
      .sort()
    const beratlar = (await this.beratlar()).items.filter((b) => kapsam.has(b.mukellefId))
    const bakiye = await this.bakiye()
    return {
      yanitBekleyen: bekleyen.length,
      yanitSuresiYaklasan: bekleyen
        .filter((e) => (e.yanitKalanGun ?? 99) <= YANIT_UYARI_GUN)
        .sort((a, b) => a.alinmaTarihi.localeCompare(b.alinmaTarihi)),
      hataliGonderim: belgeler.filter((e) => e.gibDurumu === "HATA").length,
      hataliEArsiv: belgeler.filter((e) => e.gibDurumu === "HATA" && e.tur === "E_ARSIV").length,
      baglantiHatasi: baglantilar.filter((b) => b.durum === "HATA").length,
      bagliMukellef: baglantilar.filter((b) => b.durum === "BAGLI").length,
      beratGeciken: beratlar.filter((b) => b.durum !== "ONAYLANDI" && b.gecikti).length,
      ...(senkronlar.length ? { sonSenkron: senkronlar.at(-1) } : {}),
      // Kontör havuzu büronundur: sorumlu filtresinden bağımsız
      kontorKalan: bakiye.kalan,
      kontorDusuk: bakiye.dusukBakiye,
    }
  }

  async kontor(donemParam?: string): Promise<KontorOzetResponse> {
    const bugun = this.bugun()
    const donem = donemParam && EBELGE_DONEM_RE.test(donemParam) ? donemParam : bugun.slice(0, 7)
    const tx = this.txHost.tx
    const belgeler = await this.tumBelgeler()
    const alimlar = await tx
      .select({ a: kontorAlim, ad: personel.ad, soyad: personel.soyad })
      .from(kontorAlim)
      .leftJoin(personel, eq(personel.id, kontorAlim.ekleyenId))
    const bakiye = kontorBakiyesi(
      alimlar.map(({ a }) => nullsuz(a) as KontorAlim),
      belgeler,
      bugun
    )
    const unvanlar = new Map(
      (await tx.select({ id: mukellef.id, unvan: mukellef.unvan }).from(mukellef)).map((m) => [
        m.id,
        m.unvan,
      ])
    )
    const [luca] = await tx
      .select({ bakiye: lucaHesap.kontorBakiye, tarih: lucaHesap.kontorTarihi })
      .from(lucaHesap)
    return {
      donem,
      ...bakiye,
      ...(luca?.bakiye != null && luca.tarih
        ? { lucaBakiye: luca.bakiye, lucaBakiyeTarihi: luca.tarih }
        : {}),
      aylik: sonDonemler(bugun, 6).map((d) => ({ donem: d, tuketim: donemTuketimi(belgeler, d) })),
      mukellefler: mukellefTuketimleri(belgeler, donem).map((s) => ({
        ...s,
        mukellefUnvan: unvanlar.get(s.mukellefId) ?? "—",
        tutar: s.toplam * bakiye.birimMaliyet,
      })),
      alimlar: alimlar
        .map(
          ({ a, ad, soyad }): KontorAlimView => ({
            ...(nullsuz(a) as KontorAlim),
            ekleyenAd: ad ? `${ad} ${soyad}` : "—",
          })
        )
        .sort((a, b) => b.tarih.localeCompare(a.tarih)),
    }
  }

  @Transactional()
  async kontorAlimEkle(aktor: Personel, body: KontorAlimRequest): Promise<KontorAlimView> {
    const hata = kontorAlimHatasi(body, this.bugun())
    if (hata) throw new BadRequestException({ message: hata })
    const kayit: KontorAlim = {
      id: newId("u"),
      tarih: body.tarih,
      paketAdet: body.paketAdet,
      hediyeAdet: body.hediyeAdet,
      tutar: body.tutar,
      ekleyenId: aktor.id,
      ...(body.not?.trim() ? { not: body.not.trim() } : {}),
    }
    await this.txHost.tx.insert(kontorAlim).values(kayit)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "KONTOR_ALINDI",
      aciklama: `${kayit.paketAdet + kayit.hediyeAdet} kontör`,
    })
    return { ...kayit, ekleyenAd: `${aktor.ad} ${aktor.soyad}` }
  }

  // --- Yardımcılar -------------------------------------------------------------------

  /** Yanıt süresi dolmak üzere olan gelen ticari faturalar → mükellef sorumlusuna */
  private async yanitHatirlatmalari(simdi: Date) {
    const satirlar = await this.txHost.tx
      .select({ e: ebelge, unvan: mukellef.unvan, sorumlu: mukellef.sorumluPersonelId })
      .from(ebelge)
      .innerJoin(mukellef, eq(mukellef.id, ebelge.mukellefId))
      .where(
        and(eq(ebelge.yon, "GELEN"), eq(ebelge.senaryo, "TICARI"), eq(ebelge.yanit, "BEKLIYOR"))
      )
    return satirlar.flatMap(({ e, unvan, sorumlu }) => {
      const v = ebelgeView(ebelgeSatirindan(e), unvan, simdi)
      if (v.yanit !== "BEKLIYOR" || (v.yanitKalanGun ?? 99) > YANIT_UYARI_GUN) return []
      return [
        {
          tur: "EFATURA_YANIT_SURESI" as const,
          anahtar: `EFATURA_YANIT_SURESI:${e.id}`,
          aliciId: sorumlu,
          baslik:
            v.yanitKalanGun === 0
              ? "e-Fatura yanıt süresi bugün doluyor"
              : `e-Fatura yanıt süresi ${v.yanitKalanGun} gün içinde doluyor`,
          aciklama: `${e.belgeNo} · ${unvan}`,
          link: `/e-belge/e-fatura?fatura=${e.id}`,
          mukellefId: e.mukellefId,
          hedefTip: "EBELGE" as const,
          hedefId: e.id,
        },
      ]
    })
  }

  private async faturaBul(id: string) {
    const [s] = await this.txHost.tx
      .select({ e: ebelge, m: mukellef, b: entegratorBaglanti })
      .from(ebelge)
      .innerJoin(mukellef, eq(mukellef.id, ebelge.mukellefId))
      .leftJoin(entegratorBaglanti, eq(entegratorBaglanti.mukellefId, ebelge.mukellefId))
      .where(eq(ebelge.id, id))
    if (!s) throw new NotFoundException({ message: "Fatura bulunamadı" })
    return { e: ebelgeSatirindan(s.e), m: s.m, b: s.b }
  }

  private async viewlar(kosul: SQL | undefined, simdi: Date): Promise<EBelgeView[]> {
    const satirlar = await this.txHost.tx
      .select({ e: ebelge, unvan: mukellef.unvan })
      .from(ebelge)
      .innerJoin(mukellef, eq(mukellef.id, ebelge.mukellefId))
      .where(kosul)
    return satirlar.map(({ e, unvan }) => ebelgeView(ebelgeSatirindan(e), unvan, simdi))
  }

  private async tumBelgeler(): Promise<EBelge[]> {
    return (await this.txHost.tx.select().from(ebelge)).map(ebelgeSatirindan)
  }

  private async bakiye() {
    const alimlar = (await this.txHost.tx.select().from(kontorAlim)).map(
      (a) => nullsuz(a) as KontorAlim
    )
    return kontorBakiyesi(alimlar, await this.tumBelgeler(), this.bugun())
  }

  private kimlik(b: BaglantiSatiri): EntegratorKimlik {
    return { mukellefId: b.mukellefId, ...(b.lucaFirmaId ? { lucaFirmaId: b.lucaFirmaId } : {}) }
  }


  private bugun() {
    return toYmd(this.saat.simdi())
  }
}

function baglantiView(
  m: typeof mukellef.$inferSelect,
  b: BaglantiSatiri | null
): EntegratorBaglantiView {
  const temel: EntegratorBaglanti = b
    ? baglantiSatirindan(b)
    : {
        id: `n_${m.id}`,
        mukellefId: m.id,
        durum: "BAGLI_DEGIL",
        eFatura: false,
        eArsiv: false,
        eDefter: false,
      }
  return {
    ...temel,
    mukellefUnvan: m.unvan,
    mukellefTur: m.tur,
    sorumluPersonelId: m.sorumluPersonelId,
  }
}

function ebelgeView(e: EBelge, mukellefUnvan: string, simdi: Date): EBelgeView {
  const yanit = yanitDurumu(e, simdi)
  return {
    ...e,
    ...(yanit ? { yanit } : {}),
    ...(yanit === "BEKLIYOR" ? { yanitKalanGun: yanitKalanGun(e.alinmaTarihi, simdi) } : {}),
    mukellefUnvan,
  }
}
