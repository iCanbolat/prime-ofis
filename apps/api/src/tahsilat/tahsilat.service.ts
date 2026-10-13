import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, eq, inArray, sql } from "drizzle-orm"

import { formatTRY } from "@prime/shared/lib/format"
import { toYmd } from "@prime/shared/lib/tarih"
import {
  acilisBakiyesiHatasi,
  hareketHatasi,
  kesintiIceAktarHatasi,
  ucretHatasi,
} from "@prime/shared/tahsilat/girdi"
import {
  acikBorclar,
  aylikSeri,
  borcKalanlari,
  cariDurum,
  dagitilmamis,
  fifoKapat,
  kapatmaHatasi,
  kesintiKarsilastir,
  ucretHesapla,
  yaslandirma,
  yuvarla,
  type KesintiDurum,
  type KesintiSatirOkuma,
} from "@prime/shared/tahsilat/kurallar"
import type {
  AcikBorcView,
  AcilisKaydi,
  BorcEkleRequest,
  CariEkstreResponse,
  CariHareketView,
  CariListResponse,
  CariSatiri,
  HareketEkleRequest,
  KesintiIceAktarimView,
  KesintiRaporResponse,
  OdemeEkleRequest,
  TahsilatOzetResponse,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type {
  CariHareket,
  KesintiIceAktarim,
  Mukellef,
  MukellefUcret,
  Personel,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { sayfala } from "../core/sayfala.js"
import type { DrizzleTx } from "../db/db.module.js"
import {
  cariHareket,
  kesintiIceAktarim,
  kesintiKaydi,
  mukellef,
  personel,
} from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { cariSatirindan, CariYazici } from "./cari-yazici.js"
import { SISTEM_AKTOR, UcretBorclari } from "./ucret-borclari.js"

export interface CariListeSorgusu {
  q?: string
  sorumlu?: string
  geciken?: string
  bakiyeli?: string
  sirala?: string
  yon?: string
  sayfa?: string
  sayfaBoyutu?: string
}

type Govde = Record<string, unknown>
type CariMukellef = Pick<
  Mukellef,
  "id" | "unvan" | "tur" | "sorumluPersonelId" | "aktif" | "vkn" | "tckn"
> & { ucret?: MukellefUcret }

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })
const mukellefYok = () => new NotFoundException({ message: "Mükellef bulunamadı" })
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const metin = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const ucretKopyasi = (u: MukellefUcret): MukellefUcret => ({
  aylikBrut: yuvarla(u.aylikBrut),
  kdvOrani: u.kdvOrani,
  stopajVar: u.stopajVar,
  baslangicDonem: u.baslangicDonem,
})
const bosKesintiOzeti = (): Record<KesintiDurum, number> => ({
  ESLESTI: 0,
  EKSIK: 0,
  FAZLA: 0,
  BILDIRILMEMIS: 0,
  KAYITSIZ: 0,
})

const cariMukellefKolonlari = {
  id: mukellef.id,
  unvan: mukellef.unvan,
  tur: mukellef.tur,
  sorumluPersonelId: mukellef.sorumluPersonelId,
  aktif: mukellef.aktif,
  vkn: mukellef.vkn,
  tckn: mukellef.tckn,
  ucret: mukellef.ucret,
}

/**
 * Büronun mükelleflerle cari hesabı (mock `tahsilat.ts`): özet, cari liste ve ekstre okumada
 * hesaplanır; hareket ekleme / silme, hızlı başlangıç bakiyeleri, ücret tanımı ve İVD kesinti
 * karşılaştırması.
 */
@Injectable()
export class TahsilatService implements OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly cari: CariYazici,
    private readonly ucretler: UcretBorclari,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      if (state.cari.length) await db.insert(cariHareket).values(state.cari)
      if (state.kesintiAktarim.length)
        await db.insert(kesintiIceAktarim).values(state.kesintiAktarim)
      if (state.kesinti.length) await db.insert(kesintiKaydi).values(state.kesinti)
    })
  }

  private bugun() {
    return toYmd(this.saat.simdi())
  }

  // --- Okuma ---------------------------------------------------------------

  /** Aktif ya da hareketi olan mükelleflerin cari satırları */
  private async cariSatirlari(bugun: string, sorumlu?: string) {
    const mukellefler = (
      await this.txHost.tx
        .select(cariMukellefKolonlari)
        .from(mukellef)
        .where(sorumlu ? eq(mukellef.sorumluPersonelId, sorumlu) : undefined)
    ).map((m) => nullsuz(m) as CariMukellef)
    const hareketler = (
      await this.txHost.tx
        .select()
        .from(cariHareket)
        .where(
          sorumlu
            ? inArray(
                cariHareket.mukellefId,
                mukellefler.map((m) => m.id)
              )
            : undefined
        )
    ).map(cariSatirindan)
    const grup = new Map<string, CariHareket[]>()
    for (const h of hareketler) grup.set(h.mukellefId, [...(grup.get(h.mukellefId) ?? []), h])
    const satirlar = mukellefler
      .filter((m) => m.aktif || grup.has(m.id))
      .map((m) => cariSatiri(m, grup.get(m.id) ?? [], bugun))
    return { satirlar, grup, mukellefler }
  }

  async ozet(sorumlu?: string): Promise<TahsilatOzetResponse> {
    const bugun = this.bugun()
    const { satirlar, grup } = await this.cariSatirlari(bugun, sorumlu)
    const hareketler = satirlar.flatMap((s) => grup.get(s.mukellefId) ?? [])
    const seri = aylikSeri(hareketler, bugun)
    const buAy = seri.find((s) => s.donem === bugun.slice(0, 7))
    const acik = satirlar.flatMap((s) => acikBorclar(grup.get(s.mukellefId) ?? []))
    return {
      toplamAlacak: yuvarla(satirlar.reduce((t, s) => t + Math.max(0, s.bakiye), 0)),
      avans: yuvarla(satirlar.reduce((t, s) => t + Math.max(0, -s.bakiye), 0)),
      buAyTahakkuk: buAy?.tahakkuk ?? 0,
      buAyTahsilat: buAy?.tahsilat ?? 0,
      borcluMukellef: satirlar.filter((s) => s.acikBorc > 0).length,
      gecikenMukellef: satirlar.filter((s) => s.geciken).length,
      ucretliMukellef: satirlar.filter((s) => s.ucret).length,
      yaslandirma: yaslandirma(acik, bugun),
      aylik: seri,
      enGecikenler: satirlar
        .filter((s) => s.geciken)
        .sort((a, b) => b.gecikmeGun - a.gecikmeGun || b.acikBorc - a.acikBorc)
        .slice(0, 5),
    }
  }

  async cariListe(s: CariListeSorgusu): Promise<CariListResponse> {
    const { satirlar, mukellefler } = await this.cariSatirlari(this.bugun(), s.sorumlu || undefined)
    const kimlik = new Map(mukellefler.map((m) => [m.id, m]))
    const q = s.q?.trim() ?? ""
    const filtrelenen = satirlar.filter((satir) => {
      const m = kimlik.get(satir.mukellefId)
      return (
        (!q ||
          kucuk(satir.mukellefUnvan).includes(kucuk(q)) ||
          Boolean(m?.vkn?.includes(q) || m?.tckn?.includes(q))) &&
        (s.geciken !== "true" || satir.geciken) &&
        (s.bakiyeli !== "true" || Math.abs(satir.bakiye) > 0.005)
      )
    })
    const yon = s.yon === "asc" ? 1 : -1
    filtrelenen.sort((a, b) => {
      if (s.sirala === "unvan") return -yon * a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      if (s.sirala === "bakiye") return yon * (a.bakiye - b.bakiye)
      return (
        yon * (a.gecikmeGun - b.gecikmeGun) ||
        yon * (a.bakiye - b.bakiye) ||
        a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    })
    return {
      ...sayfala(filtrelenen, s),
      toplamBakiye: yuvarla(filtrelenen.reduce((t, x) => t + x.bakiye, 0)),
    }
  }

  async ekstre(mukellefId: string): Promise<CariEkstreResponse> {
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id, unvan: mukellef.unvan, ucret: mukellef.ucret })
      .from(mukellef)
      .where(eq(mukellef.id, mukellefId))
    if (!m) throw mukellefYok()
    const hareketler = (await this.cari.hareketler(m.id)).sort(
      (a, b) =>
        a.tarih.localeCompare(b.tarih) ||
        (a.tip === b.tip ? 0 : a.tip === "BORC" ? -1 : 1) ||
        a.olusturmaTarihi.localeCompare(b.olusturmaTarihi)
    )
    const adlar = await this.aktorAdlari(hareketler.map((h) => h.olusturanId))
    const kalanlar = borcKalanlari(hareketler)
    let yuruyen = 0
    const views = hareketler.map((h): CariHareketView => {
      yuruyen = yuvarla(yuruyen + (h.tip === "BORC" ? h.tutar : -h.tutar))
      return {
        ...h,
        olusturanAd: adlar(h.olusturanId),
        kalan: h.tip === "BORC" ? kalanlar.get(h.id) : undefined,
        dagitilmamis: h.tip === "ODEME" ? dagitilmamis(h) : undefined,
        bakiyeSonrasi: yuruyen,
      }
    })
    const byId = new Map(hareketler.map((h) => [h.id, h]))
    return {
      mukellefId: m.id,
      mukellefUnvan: m.unvan,
      ucret: m.ucret ?? undefined,
      durum: cariDurum(hareketler, this.bugun()),
      hareketler: views,
      acikBorclar: acikBorclar(hareketler).map((b): AcikBorcView => {
        const h = byId.get(b.id)!
        return { ...b, tutar: h.tutar, kalem: h.kalem, donem: h.donem, aciklama: h.aciklama }
      }),
      avans: yuvarla(
        hareketler.filter((h) => h.tip === "ODEME").reduce((t, h) => t + dagitilmamis(h), 0)
      ),
    }
  }

  /** `sistem` → "Otomatik", silinmiş personel → "—" */
  private async aktorAdlari(idler: string[]) {
    const personelIdler = [...new Set(idler.filter((id) => id !== SISTEM_AKTOR))]
    const satirlar = personelIdler.length
      ? await this.txHost.tx
          .select({ id: personel.id, ad: personel.ad, soyad: personel.soyad })
          .from(personel)
          .where(inArray(personel.id, personelIdler))
      : []
    const adlar = new Map(satirlar.map((p) => [p.id, `${p.ad} ${p.soyad}`]))
    return (id: string) => (id === SISTEM_AKTOR ? "Otomatik" : (adlar.get(id) ?? "—"))
  }

  // --- Hareketler ----------------------------------------------------------

  async hareketEkle(aktor: Personel, body: unknown): Promise<CariHareket> {
    const hataMetni = hareketHatasi(body, this.bugun())
    if (hataMetni) throw hata(hataMetni)
    const b = body as HareketEkleRequest
    await this.mukellefVar(b.mukellefId)
    // Ödeme dağıtılmadan önce bu ayın ücret borcu oluşmuş olsun
    await this.ucretler.mukellefIcin(b.mukellefId)
    return b.tip === "BORC" ? this.borcYaz(aktor, b) : this.odemeYaz(aktor, b)
  }

  private async mukellefVar(id: unknown) {
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id })
      .from(mukellef)
      .where(eq(mukellef.id, typeof id === "string" ? id : ""))
    if (!m) throw mukellefYok()
  }

  @Transactional()
  private async borcYaz(aktor: Personel, b: BorcEkleRequest): Promise<CariHareket> {
    await this.cari.kilitle(b.mukellefId)
    const t = ucretHesapla(b.brut, b.kdvOrani, b.stopajVar)
    const id = newId("ch")
    await this.txHost.tx.insert(cariHareket).values({
      id,
      mukellefId: b.mukellefId,
      tip: "BORC",
      kalem: "EK_HIZMET",
      tarih: b.tarih,
      brut: t.brut,
      kdv: t.kdv,
      stopaj: t.stopaj,
      tutar: t.net,
      aciklama: b.aciklama.trim(),
      makbuzNo: metin(b.makbuzNo) || null,
      olusturanId: aktor.id,
      olusturmaTarihi: this.saat.simdiIso(),
    })
    await this.cari.avansUygula(b.mukellefId)
    const kayit = await this.hareket(id)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TAHSILAT_BORC_EKLENDI",
      hedefTip: "TAHSILAT",
      hedefId: kayit.id,
      mukellefId: kayit.mukellefId,
      aciklama: `${kayit.aciklama} · ${formatTRY(kayit.tutar)}`,
    })
    return kayit
  }

  @Transactional()
  private async odemeYaz(aktor: Personel, b: OdemeEkleRequest): Promise<CariHareket> {
    await this.cari.kilitle(b.mukellefId)
    const acik = acikBorclar(await this.cari.hareketler(b.mukellefId))
    const tutar = yuvarla(b.tutar)
    let kapatmalar = b.kapatmalar
    if (kapatmalar) {
      kapatmalar = kapatmalar.map((k) => ({ borcId: k.borcId, tutar: yuvarla(k.tutar) }))
      const kHata = kapatmaHatasi(tutar, kapatmalar, acik)
      if (kHata) throw hata(kHata)
    } else kapatmalar = fifoKapat(tutar, acik)

    const [satir] = await this.txHost.tx
      .insert(cariHareket)
      .values({
        id: newId("ch"),
        mukellefId: b.mukellefId,
        tip: "ODEME",
        kalem: b.kalem,
        tarih: b.tarih,
        brut: 0,
        kdv: 0,
        stopaj: 0,
        tutar,
        aciklama: metin(b.aciklama) || null,
        makbuzNo: metin(b.makbuzNo) || null,
        kapatmalar,
        olusturanId: aktor.id,
        olusturmaTarihi: this.saat.simdiIso(),
      })
      .returning()
    const kayit = cariSatirindan(satir!)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TAHSILAT_ODEME_ALINDI",
      hedefTip: "TAHSILAT",
      hedefId: kayit.id,
      mukellefId: kayit.mukellefId,
      aciklama: `${b.kalem === "DUZELTME" ? "Alacak düzeltmesi" : "Ödeme"} · ${formatTRY(tutar)}`,
    })
    return kayit
  }

  private async hareket(id: string) {
    const [h] = await this.txHost.tx.select().from(cariHareket).where(eq(cariHareket.id, id))
    if (!h) throw new NotFoundException({ message: "Hareket bulunamadı" })
    return cariSatirindan(h)
  }

  /** Silinen borcu kapatan ödemelerin payı avansa döner, sonra açık borçlara yeniden dağılır */
  @Transactional()
  async hareketSil(aktor: Personel, id: string) {
    const once = await this.hareket(id)
    if (once.kalem === "AYLIK_UCRET")
      throw new ConflictException({
        message: "Otomatik aylık ücret borcu silinemez; alacak düzeltmesi ekleyin",
      })
    await this.cari.kilitle(once.mukellefId)
    const h = await this.hareket(id)
    await this.txHost.tx.delete(cariHareket).where(eq(cariHareket.id, h.id))
    if (h.tip === "BORC") {
      const odemeler = await this.txHost.tx
        .select({ id: cariHareket.id, kapatmalar: cariHareket.kapatmalar })
        .from(cariHareket)
        .where(
          and(
            eq(cariHareket.mukellefId, h.mukellefId),
            sql`${cariHareket.kapatmalar} @> ${JSON.stringify([{ borcId: h.id }])}::jsonb`
          )
        )
      for (const o of odemeler) {
        await this.txHost.tx
          .update(cariHareket)
          .set({ kapatmalar: o.kapatmalar!.filter((k) => k.borcId !== h.id) })
          .where(eq(cariHareket.id, o.id))
      }
      await this.cari.avansUygula(h.mukellefId)
    }
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "TAHSILAT_HAREKET_SILINDI",
        hedefTip: "TAHSILAT",
        mukellefId: h.mukellefId,
        aciklama: `${h.aciklama ?? (h.tip === "BORC" ? "Borç" : "Ödeme")} · ${formatTRY(h.tutar)}`,
      },
      false
    )
  }

  // --- Hızlı başlangıç ve ücret --------------------------------------------

  /**
   * Aylık ücret + açılış bakiyesi. Açılış bakiyesi mükellef başına bir kez yazılır (tekrar
   * aktarımda atlanır); tanımlı ücret yalnızca `uzerineYaz` ile değişir. Satır bazında hata.
   */
  async acilisToplu(aktor: Personel, body: unknown): Promise<TopluAktarimSonucu> {
    const { uzerineYaz, kayitlar } = govde(body)
    if (!Array.isArray(kayitlar) || kayitlar.length === 0) throw hata("Aktarılacak kayıt yok")
    const sonuc: TopluAktarimSonucu = { olusturulan: 0, guncellenen: 0, atlanan: 0, hatalar: [] }
    for (const ham of kayitlar) {
      const k = govde(ham) as Partial<AcilisKaydi>
      const satir = typeof k.satir === "number" ? k.satir : 0
      const [m] = await this.txHost.tx
        .select({ id: mukellef.id })
        .from(mukellef)
        .where(eq(mukellef.id, typeof k.mukellefId === "string" ? k.mukellefId : ""))
      const hataMetni = !m
        ? "Mükellef bulunamadı"
        : (k.ucret && ucretHatasi(k.ucret)) || (k.bakiye && acilisBakiyesiHatasi(k.bakiye)) || null
      if (!m || hataMetni) {
        sonuc.hatalar.push({ satir, mesaj: hataMetni || "Geçersiz kayıt" })
        continue
      }
      // Bugüne kadarki aylar mevcut ücretle kesinleşsin
      await this.ucretler.mukellefIcin(m.id)
      const { degisti, yeniKayit } = await this.acilisKaydiYaz(aktor, m.id, k, uzerineYaz === true)
      // Yeni ücretin başlangıç döneminden bugüne kadarki borçları
      await this.ucretler.mukellefIcin(m.id)
      if (!degisti) sonuc.atlanan++
      else if (yeniKayit) sonuc.olusturulan++
      else sonuc.guncellenen++
    }
    return sonuc
  }

  @Transactional()
  private async acilisKaydiYaz(
    aktor: Personel,
    mukellefId: string,
    k: Partial<AcilisKaydi>,
    uzerineYaz: boolean
  ) {
    await this.cari.kilitle(mukellefId)
    const [m] = await this.txHost.tx
      .select({ ucret: mukellef.ucret })
      .from(mukellef)
      .where(eq(mukellef.id, mukellefId))
      .for("update")
    let degisti = false
    let yeniKayit = false

    if (k.ucret && (!m!.ucret || uzerineYaz)) {
      const ucret = ucretKopyasi(k.ucret)
      await this.txHost.tx.update(mukellef).set({ ucret }).where(eq(mukellef.id, mukellefId))
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: "UCRET_GUNCELLENDI",
          hedefTip: "MUKELLEF",
          hedefId: mukellefId,
          mukellefId,
          aciklama: `Aylık ${formatTRY(ucret.aylikBrut)} + KDV (içe aktarım)`,
        },
        false
      )
      degisti = true
      yeniKayit ||= !m!.ucret
    }

    const hareketler = await this.cari.hareketler(mukellefId)
    const acilisVar = hareketler.some((h) => h.kalem === "ACILIS")
    const tutar = k.bakiye ? yuvarla(k.bakiye.tutar) : 0
    if (k.bakiye && tutar !== 0 && !acilisVar) {
      const borc = tutar > 0
      const id = newId("ch")
      await this.txHost.tx.insert(cariHareket).values({
        id,
        mukellefId,
        tip: borc ? "BORC" : "ODEME",
        kalem: "ACILIS",
        tarih: k.bakiye.tarih,
        brut: borc ? tutar : 0,
        kdv: 0,
        stopaj: 0,
        tutar: Math.abs(tutar),
        aciklama: "Açılış bakiyesi",
        kapatmalar: borc ? null : fifoKapat(-tutar, acikBorclar(hareketler)),
        olusturanId: aktor.id,
        olusturmaTarihi: this.saat.simdiIso(),
      })
      if (borc) await this.cari.avansUygula(mukellefId)
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: borc ? "TAHSILAT_BORC_EKLENDI" : "TAHSILAT_ODEME_ALINDI",
          hedefTip: "TAHSILAT",
          hedefId: id,
          mukellefId,
          aciklama: `Açılış bakiyesi · ${formatTRY(tutar)}`,
        },
        false
      )
      degisti = true
      yeniKayit = true
    }
    return { degisti, yeniKayit }
  }

  /** Geçmiş dönemlerin borçları değişmez; eksik dönemler yeni ücretle üretilir */
  async ucretKaydet(aktor: Personel, id: string, body: unknown): Promise<Mukellef> {
    await this.mukellefVar(id)
    const { ucret } = govde(body)
    if (ucret) {
      const hataMetni = ucretHatasi(ucret)
      if (hataMetni) throw hata(hataMetni)
    }
    // Bugüne kadarki aylar eski ücretle kesinleşsin; yeni ücret sonraki aylara uygulanır
    await this.ucretler.mukellefIcin(id)
    const guncel = await this.ucretYaz(aktor, id, ucret ? ucretKopyasi(ucret as MukellefUcret) : null)
    await this.ucretler.mukellefIcin(id)
    return guncel
  }

  @Transactional()
  private async ucretYaz(aktor: Personel, id: string, ucret: MukellefUcret | null) {
    const [satir] = await this.txHost.tx
      .update(mukellef)
      .set({ ucret })
      .where(eq(mukellef.id, id))
      .returning()
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "UCRET_GUNCELLENDI",
        hedefTip: "MUKELLEF",
        hedefId: id,
        mukellefId: id,
        aciklama: ucret ? `Aylık ${formatTRY(ucret.aylikBrut)} + KDV` : "Aylık ücret kaldırıldı",
      },
      false
    )
    return nullsuz(satir!) as Mukellef
  }

  // --- Kesinti kontrolü -----------------------------------------------------

  async kesinti(yilParam?: string): Promise<KesintiRaporResponse> {
    const aktarimlar = await this.txHost.tx.select().from(kesintiIceAktarim)
    const yillar = [...new Set(aktarimlar.map((a) => a.yil))].sort((a, b) => b - a)
    const istenen = Number(yilParam)
    const yil =
      istenen >= 2000 && istenen <= 2100
        ? Math.trunc(istenen)
        : (yillar[0] ?? Number(this.bugun().slice(0, 4)))
    const aktarim = aktarimlar.find((a) => a.yil === yil)
    let satirlar: KesintiRaporResponse["satirlar"] = []
    if (aktarim) {
      const [hareketler, mukellefler, kayitlar] = await Promise.all([
        this.txHost.tx.select().from(cariHareket),
        this.txHost.tx
          .select({ id: mukellef.id, unvan: mukellef.unvan, vkn: mukellef.vkn, tckn: mukellef.tckn })
          .from(mukellef),
        this.txHost.tx
          .select()
          .from(kesintiKaydi)
          .where(eq(kesintiKaydi.iceAktarimId, aktarim.id)),
      ])
      satirlar = kesintiKarsilastir(
        hareketler.map(cariSatirindan),
        mukellefler.map((m) => nullsuz(m)),
        kayitlar,
        yil
      )
    }
    const ozet = bosKesintiOzeti()
    for (const s of satirlar) ozet[s.durum]++
    return {
      yil,
      iceAktarim: aktarim && (await this.aktarimView(aktarim)),
      satirlar,
      ozet,
      yillar,
    }
  }

  private async aktarimView(a: KesintiIceAktarim): Promise<KesintiIceAktarimView> {
    const ad = await this.aktorAdlari([a.yukleyenId])
    return { ...a, yukleyenAd: ad(a.yukleyenId) }
  }

  /** Aynı yıl için yeniden yükleme öncekinin yerine geçer */
  @Transactional()
  async kesintiIceAktar(aktor: Personel, body: unknown): Promise<KesintiIceAktarimView> {
    const { yil, dosyaAdi, kayitlar } = govde(body)
    const hataMetni = kesintiIceAktarHatasi(yil, kayitlar)
    if (hataMetni) throw hata(hataMetni)
    const satirlar = kayitlar as KesintiSatirOkuma[]
    await this.txHost.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kesinti:${yil}`}))`)
    await this.txHost.tx.delete(kesintiIceAktarim).where(eq(kesintiIceAktarim.yil, yil as number))
    const [aktarim] = await this.txHost.tx
      .insert(kesintiIceAktarim)
      .values({
        id: newId("ki"),
        yil: yil as number,
        dosyaAdi: metin(dosyaAdi) || "kesinti-listesi",
        satirSayisi: satirlar.length,
        yukleyenId: aktor.id,
        zaman: this.saat.simdiIso(),
      })
      .returning()
    await this.txHost.tx.insert(kesintiKaydi).values(
      satirlar.map((k) => ({
        id: newId("ks"),
        iceAktarimId: aktarim!.id,
        vkn: k.vkn,
        unvan: metin(k.unvan),
        donem: k.donem,
        matrah: yuvarla(k.matrah ?? 0),
        kesinti: yuvarla(k.kesinti),
      }))
    )
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "KESINTI_ICE_AKTARILDI",
        aciklama: `${yil as number} · ${satirlar.length} satır`,
      },
      false
    )
    return { ...aktarim!, yukleyenAd: `${aktor.ad} ${aktor.soyad}` }
  }
}

function cariSatiri(m: CariMukellef, hareketler: CariHareket[], bugun: string): CariSatiri {
  const sonOdeme = hareketler
    .filter((h) => h.tip === "ODEME" && h.kalem === "ODEME")
    .reduce<string | undefined>((s, h) => (!s || h.tarih > s ? h.tarih : s), undefined)
  return {
    ...cariDurum(hareketler, bugun),
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    mukellefTur: m.tur,
    sorumluPersonelId: m.sorumluPersonelId,
    ucret: m.ucret,
    sonOdeme,
  }
}
