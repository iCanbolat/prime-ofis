/**
 * Tahsilat kuralları — saf fonksiyonlar; mock handler ve (ileride) backend aynı hesabı kullanır.
 *
 * Büro serbest meslek erbabıdır: aylık ücret brüt tanımlanır, üzerine KDV eklenir; tevkifat
 * sorumlusu mükellef brütün %20'si kadar gelir vergisi stopajı keser ve ödeme ayının
 * muhtasarında beyan eder. Mükellefin ödeyeceği net = brüt + KDV − stopaj.
 */
import { addMonths, differenceInCalendarDays, format } from "date-fns"

import { hucreSayi } from "../ice-aktarim/mizan"
import { normalize } from "../ice-aktarim/tahakkuk"
import { sonDonemler } from "../e-belge/kontor"
import { fromYmd } from "../lib/tarih"
import type {
  CariHareket,
  Kapatma,
  KesintiKaydi,
  Mukellef,
  MukellefUcret,
} from "../types/domain"

export const VARSAYILAN_KDV_ORANI = 20
export const STOPAJ_ORANI = 0.2
/** Borç tarihinden bu kadar gün sonra hâlâ açıksa gecikmiş sayılır */
export const VADE_GUN = 30
/** Kesinti karşılaştırmasında kuruş farkı toleransı (TL) */
export const KESINTI_TOLERANS = 1

export const yuvarla = (n: number) => Math.round(n * 100) / 100

export interface UcretTutarlari {
  brut: number
  kdv: number
  stopaj: number
  net: number
}

export function ucretHesapla(
  brut: number,
  kdvOrani: number = VARSAYILAN_KDV_ORANI,
  stopajVar = true
): UcretTutarlari {
  const kdv = yuvarla((brut * kdvOrani) / 100)
  const stopaj = stopajVar ? yuvarla(brut * STOPAJ_ORANI) : 0
  return { brut: yuvarla(brut), kdv, stopaj, net: yuvarla(brut + kdv - stopaj) }
}

export const ucretAnahtari = (mukellefId: string, donem: string) =>
  `UCRET:${mukellefId}:${donem}`

/** Aylık ücret borcu dönemin ilk günü tahakkuk eder */
export const ucretBorcTarihi = (donem: string) => `${donem}-01`

/** Başlangıç döneminden içinde bulunulan aya kadar (dahil) borçlandırılacak dönemler */
export function ucretDonemleri(
  ucret: Pick<MukellefUcret, "baslangicDonem">,
  bugunYmd: string
): string[] {
  const son = bugunYmd.slice(0, 7)
  const donemler: string[] = []
  let ay = fromYmd(`${ucret.baslangicDonem}-01`)
  while (format(ay, "yyyy-MM") <= son) {
    donemler.push(format(ay, "yyyy-MM"))
    ay = addMonths(ay, 1)
  }
  return donemler
}

type HareketOzu = Pick<
  CariHareket,
  "id" | "tip" | "kalem" | "tarih" | "tutar" | "kapatmalar" | "stopaj"
>

/** Borç id → kapatılmamış tutar */
export function borcKalanlari(hareketler: HareketOzu[]): Map<string, number> {
  const kalan = new Map<string, number>()
  for (const h of hareketler) if (h.tip === "BORC") kalan.set(h.id, h.tutar)
  for (const h of hareketler) {
    if (h.tip !== "ODEME") continue
    for (const k of h.kapatmalar ?? []) {
      const once = kalan.get(k.borcId)
      if (once !== undefined) kalan.set(k.borcId, yuvarla(once - k.tutar))
    }
  }
  return kalan
}

export interface AcikBorc {
  id: string
  tarih: string
  kalan: number
}

/** Kalanı olan borçlar, eskiden yeniye */
export function acikBorclar(hareketler: HareketOzu[]): AcikBorc[] {
  const kalan = borcKalanlari(hareketler)
  return hareketler
    .filter((h) => h.tip === "BORC" && (kalan.get(h.id) ?? 0) > 0.005)
    .map((h) => ({ id: h.id, tarih: h.tarih, kalan: kalan.get(h.id)! }))
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.id.localeCompare(b.id))
}

/** Ödemenin borçlara dağıtılmamış kısmı (avans) */
export function dagitilmamis(odeme: Pick<CariHareket, "tutar" | "kapatmalar">) {
  const dagitilan = (odeme.kapatmalar ?? []).reduce((t, k) => t + k.tutar, 0)
  return yuvarla(odeme.tutar - dagitilan)
}

/** Tutarı en eski borçtan başlayarak dağıtır (FIFO); artan kısım dağıtılmaz */
export function fifoKapat(tutar: number, acik: AcikBorc[]): Kapatma[] {
  const kapatmalar: Kapatma[] = []
  let kalan = yuvarla(tutar)
  for (const b of acik) {
    if (kalan <= 0) break
    const pay = yuvarla(Math.min(kalan, b.kalan))
    if (pay <= 0) continue
    kapatmalar.push({ borcId: b.id, tutar: pay })
    kalan = yuvarla(kalan - pay)
  }
  return kapatmalar
}

/** Elle seçilen kapatmaların doğrulaması; hata metni ya da null */
export function kapatmaHatasi(
  tutar: number,
  kapatmalar: Kapatma[],
  acik: AcikBorc[]
): string | null {
  const kalan = new Map(acik.map((b) => [b.id, b.kalan]))
  let toplam = 0
  for (const k of kapatmalar) {
    if (!(k.tutar > 0)) return "Kapatma tutarı sıfırdan büyük olmalı"
    const b = kalan.get(k.borcId)
    if (b === undefined) return "Kapatılacak borç bulunamadı veya zaten kapalı"
    if (k.tutar > b + 0.005) return "Kapatma tutarı borcun kalanını aşıyor"
    toplam += k.tutar
  }
  if (toplam > tutar + 0.005)
    return "Kapatmaların toplamı ödeme tutarını aşıyor"
  return null
}

/** Pozitif: mükellefin büroya borcu; negatif: avans */
export function bakiye(hareketler: Pick<CariHareket, "tip" | "tutar">[]) {
  return yuvarla(
    hareketler.reduce((t, h) => t + (h.tip === "BORC" ? h.tutar : -h.tutar), 0)
  )
}

export interface CariDurum {
  bakiye: number
  acikBorc: number
  /** En eski açık borcun tarihi */
  enEskiAcik?: string
  gecikmeGun: number
  geciken: boolean
}

export function cariDurum(
  hareketler: HareketOzu[],
  bugunYmd: string
): CariDurum {
  const acik = acikBorclar(hareketler)
  const enEski = acik[0]?.tarih
  const gecikmeGun = enEski
    ? Math.max(0, differenceInCalendarDays(fromYmd(bugunYmd), fromYmd(enEski)))
    : 0
  return {
    bakiye: bakiye(hareketler),
    acikBorc: yuvarla(acik.reduce((t, b) => t + b.kalan, 0)),
    enEskiAcik: enEski,
    gecikmeGun,
    geciken: gecikmeGun > VADE_GUN,
  }
}

export const YAS_DILIMLERI = ["0-30", "31-60", "61-90", "90+"] as const
export type YasDilimi = (typeof YAS_DILIMLERI)[number]

export function yasDilimi(gun: number): YasDilimi {
  if (gun <= 30) return "0-30"
  if (gun <= 60) return "31-60"
  if (gun <= 90) return "61-90"
  return "90+"
}

/** Açık borçların borç tarihinden bugüne geçen güne göre dağılımı */
export function yaslandirma(
  acik: AcikBorc[],
  bugunYmd: string
): Record<YasDilimi, number> {
  const sonuc: Record<YasDilimi, number> = {
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  }
  const bugunTarih = fromYmd(bugunYmd)
  for (const b of acik) {
    const gun = differenceInCalendarDays(bugunTarih, fromYmd(b.tarih))
    const d = yasDilimi(gun)
    sonuc[d] = yuvarla(sonuc[d] + b.kalan)
  }
  return sonuc
}

export interface AylikTahsilat {
  donem: string
  tahakkuk: number
  tahsilat: number
}

/** Son `adet` ayın tahakkuk (borç) ve tahsilat (yalnızca gerçek ödeme) toplamları */
export function aylikSeri(
  hareketler: Pick<CariHareket, "tip" | "kalem" | "tarih" | "tutar">[],
  bugunYmd: string,
  adet = 12
): AylikTahsilat[] {
  const seri = new Map(
    sonDonemler(bugunYmd, adet).map((d) => [
      d,
      { donem: d, tahakkuk: 0, tahsilat: 0 },
    ])
  )
  for (const h of hareketler) {
    const s = seri.get(h.tarih.slice(0, 7))
    if (!s) continue
    if (h.tip === "BORC") s.tahakkuk = yuvarla(s.tahakkuk + h.tutar)
    else if (h.kalem === "ODEME") s.tahsilat = yuvarla(s.tahsilat + h.tutar)
  }
  return [...seri.values()]
}

/**
 * Ödemeyle kesilmiş sayılan stopaj: kapattığı borçların stopajı, kapatılan pay oranında.
 * Stopaj ödeme ayında muhtasara girdiği için beklenen kesinti bu tutar ve ödeme dönemidir.
 */
export function odemeStopaji(
  odeme: Pick<CariHareket, "kapatmalar">,
  borclar: Map<string, Pick<CariHareket, "tutar" | "stopaj">>
): number {
  let toplam = 0
  for (const k of odeme.kapatmalar ?? []) {
    const b = borclar.get(k.borcId)
    if (!b || b.tutar <= 0) continue
    toplam += (b.stopaj * k.tutar) / b.tutar
  }
  return yuvarla(toplam)
}

// --- Kesinti kontrolü ---------------------------------------------------------------

export type KesintiDurum =
  "ESLESTI" | "EKSIK" | "FAZLA" | "BILDIRILMEMIS" | "KAYITSIZ"

export interface KesintiSatiri {
  /** İVD satırı eşleşmeyen VKN'deyse boş */
  mukellefId?: string
  vkn: string
  unvan: string
  donem: string
  /** Tahsilattan beklenen stopaj */
  beklenen: number
  /** İVD'de bildirilen kesinti */
  bildirilen: number
  fark: number
  durum: KesintiDurum
}

export function kesintiDurumu(
  beklenen: number,
  bildirilen: number,
  tolerans = KESINTI_TOLERANS
): KesintiDurum {
  if (beklenen > 0 && bildirilen <= 0) return "BILDIRILMEMIS"
  if (beklenen <= 0 && bildirilen > 0) return "KAYITSIZ"
  const fark = bildirilen - beklenen
  if (Math.abs(fark) <= tolerans) return "ESLESTI"
  return fark < 0 ? "EKSIK" : "FAZLA"
}

type KesintiMukellef = Pick<Mukellef, "id" | "unvan" | "vkn" | "tckn">

/**
 * Tahsilattaki ödemelerden beklenen stopajı (ödeme dönemine göre) İVD'de bildirilen
 * kesintilerle mükellef × dönem bazında karşılaştırır.
 */
export function kesintiKarsilastir(
  hareketler: CariHareket[],
  mukellefler: KesintiMukellef[],
  kayitlar: Pick<KesintiKaydi, "vkn" | "unvan" | "donem" | "kesinti">[],
  yil: number
): KesintiSatiri[] {
  const mukellefById = new Map(mukellefler.map((m) => [m.id, m]))
  const mukellefByVkn = new Map<string, KesintiMukellef>()
  for (const m of mukellefler) {
    const no = m.vkn ?? m.tckn
    if (no) mukellefByVkn.set(no, m)
  }
  const borclar = new Map(
    hareketler.filter((h) => h.tip === "BORC").map((h) => [h.id, h])
  )

  type Hucre = {
    mukellefId?: string
    vkn: string
    unvan: string
    donem: string
    beklenen: number
    bildirilen: number
  }
  const hucreler = new Map<string, Hucre>()
  const hucre = (anahtar: string, varsayilan: () => Hucre) => {
    let h = hucreler.get(anahtar)
    if (!h) {
      h = varsayilan()
      hucreler.set(anahtar, h)
    }
    return h
  }

  const yilOn = `${yil}-`
  for (const h of hareketler) {
    if (h.tip !== "ODEME" || h.kalem !== "ODEME" || !h.tarih.startsWith(yilOn))
      continue
    const stopaj = odemeStopaji(h, borclar)
    if (stopaj <= 0) continue
    const m = mukellefById.get(h.mukellefId)
    const donem = h.tarih.slice(0, 7)
    const c = hucre(`${h.mukellefId}:${donem}`, () => ({
      mukellefId: h.mukellefId,
      vkn: m?.vkn ?? m?.tckn ?? "",
      unvan: m?.unvan ?? "",
      donem,
      beklenen: 0,
      bildirilen: 0,
    }))
    c.beklenen = yuvarla(c.beklenen + stopaj)
  }

  for (const k of kayitlar) {
    if (!k.donem.startsWith(yilOn)) continue
    const m = mukellefByVkn.get(k.vkn)
    const c = hucre(`${m ? m.id : `vkn:${k.vkn}`}:${k.donem}`, () => ({
      mukellefId: m?.id,
      vkn: k.vkn,
      unvan: m?.unvan ?? k.unvan,
      donem: k.donem,
      beklenen: 0,
      bildirilen: 0,
    }))
    c.bildirilen = yuvarla(c.bildirilen + k.kesinti)
  }

  return [...hucreler.values()]
    .map((c) => ({
      ...c,
      fark: yuvarla(c.bildirilen - c.beklenen),
      durum: kesintiDurumu(c.beklenen, c.bildirilen),
    }))
    .sort(
      (a, b) =>
        a.unvan.localeCompare(b.unvan, "tr") || a.donem.localeCompare(b.donem)
    )
}

// --- İVD kesinti listesi okuma -------------------------------------------------------

export class KesintiOkumaHatasi extends Error {}

export type KesintiSatirOkuma = Omit<KesintiKaydi, "id" | "iceAktarimId">

export interface KesintiOkuma {
  kayitlar: KesintiSatirOkuma[]
  /** Başlıktan sonraki okunamayan (toplam, boş VKN, geçersiz dönem) satırlar */
  atlanan: number
}

const AYLAR = [
  "OCAK",
  "SUBAT",
  "MART",
  "NISAN",
  "MAYIS",
  "HAZIRAN",
  "TEMMUZ",
  "AGUSTOS",
  "EYLUL",
  "EKIM",
  "KASIM",
  "ARALIK",
]

const ikiHane = (n: number) => String(n).padStart(2, "0")

function gecerliDonem(yil: number, ay: number): string | null {
  if (!(yil >= 2000 && yil <= 2100 && ay >= 1 && ay <= 12)) return null
  return `${yil}-${ikiHane(ay)}`
}

/** "2026/03", "03/2026", "2026-03", "202603", "Mart 2026", "01.03.2026", Date → "2026-03" */
export function donemCoz(deger: unknown): string | null {
  if (deger instanceof Date && !Number.isNaN(deger.getTime()))
    return gecerliDonem(deger.getFullYear(), deger.getMonth() + 1)
  const s = normalize(String(deger ?? "")).trim()
  if (!s) return null
  let m = /^(\d{4})\s*[/.-]\s*(\d{1,2})$/.exec(s)
  if (m) return gecerliDonem(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(s)
  if (m) return gecerliDonem(Number(m[2]), Number(m[1]))
  m = /^(\d{4})(\d{2})$/.exec(s)
  if (m) return gecerliDonem(Number(m[1]), Number(m[2]))
  m = /^\d{1,2}[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return gecerliDonem(Number(m[2]), Number(m[1]))
  m = /^([A-Z]+)\s*[/-]?\s*(\d{4})$/.exec(s)
  if (m) {
    const ay = AYLAR.indexOf(m[1]!) + 1
    return ay > 0 ? gecerliDonem(Number(m[2]), ay) : null
  }
  return null
}

function ayCoz(deger: unknown): number | null {
  if (typeof deger === "number") return deger
  const s = normalize(String(deger ?? "")).trim()
  if (/^\d{1,2}$/.test(s)) return Number(s)
  const i = AYLAR.indexOf(s)
  return i >= 0 ? i + 1 : null
}

interface KesintiSutunlari {
  vkn: number
  unvan?: number
  donem?: number
  yil?: number
  ay?: number
  matrah?: number
  kesinti: number
}

const SUTUN_KURALLARI: [keyof KesintiSutunlari, RegExp][] = [
  ["vkn", /\b(VKN|TCKN|VERGI KIMLIK|KIMLIK NO|VERGI NO)/],
  ["unvan", /(UNVAN|ADI SOYADI|AD SOYAD)/],
  ["donem", /DONEM/],
  ["yil", /^YIL$/],
  ["ay", /^AY$/],
  ["matrah", /(MATRAH|GAYRISAFI|BRUT|ODEME TUTARI|ODENEN TUTAR)/],
  ["kesinti", /(KESINTI|TEVKIFAT|VERGI TUTARI|KESILEN)/],
]

function sutunlariBul(
  satirlar: unknown[][]
): { sutunlar: KesintiSutunlari; satir: number } | null {
  for (let i = 0; i < Math.min(satirlar.length, 25); i++) {
    const basliklar = (satirlar[i] ?? []).map((h) =>
      normalize(String(h ?? "")).trim()
    )
    const bulunan: Partial<KesintiSutunlari> = {}
    const kullanilan = new Set<number>()
    for (const [alan, re] of SUTUN_KURALLARI) {
      const j = basliklar.findIndex(
        (b, idx) => !kullanilan.has(idx) && re.test(b)
      )
      if (j >= 0) {
        bulunan[alan] = j
        kullanilan.add(j)
      }
    }
    const donemVar =
      bulunan.donem !== undefined ||
      (bulunan.yil !== undefined && bulunan.ay !== undefined)
    if (bulunan.vkn !== undefined && bulunan.kesinti !== undefined && donemVar)
      return { sutunlar: bulunan as KesintiSutunlari, satir: i }
  }
  return null
}

/**
 * İVD "Hakkınızda yapılan kesintiler" listesini okur. Sütunlar başlık adlarıyla tanınır.
 * Not: örnek düzen varsayımsaldır; gerçek İVD çıktısıyla kalibre edilmelidir.
 */
export function kesintiListesiOku(satirlar: unknown[][]): KesintiOkuma {
  const bulunan = sutunlariBul(satirlar)
  if (!bulunan)
    throw new KesintiOkumaHatasi(
      'Başlık satırı bulunamadı. Listede "VKN", "Dönem" (veya "Yıl" + "Ay") ve "Kesinti" sütunları olmalı.'
    )
  const { sutunlar: c, satir } = bulunan
  const kayitlar: KesintiSatirOkuma[] = []
  let atlanan = 0
  for (const s of satirlar.slice(satir + 1)) {
    if (!s.some((h) => String(h ?? "").trim() !== "")) continue
    const vkn = String(s[c.vkn] ?? "").replace(/\D/g, "")
    let donem: string | null
    if (c.donem !== undefined) donem = donemCoz(s[c.donem])
    else {
      const yil = Number(String(s[c.yil!] ?? "").trim())
      const ay = ayCoz(s[c.ay!])
      donem = ay === null ? null : gecerliDonem(yil, ay)
    }
    const kesinti = hucreSayi(s[c.kesinti])
    const matrah = c.matrah === undefined ? 0 : hucreSayi(s[c.matrah])
    if (
      !/^\d{10,11}$/.test(vkn) ||
      !donem ||
      kesinti === null ||
      matrah === null ||
      kesinti <= 0
    ) {
      atlanan++
      continue
    }
    kayitlar.push({
      vkn,
      unvan: c.unvan === undefined ? "" : String(s[c.unvan] ?? "").trim(),
      donem,
      matrah: yuvarla(matrah),
      kesinti: yuvarla(kesinti),
    })
  }
  return { kayitlar, atlanan }
}
