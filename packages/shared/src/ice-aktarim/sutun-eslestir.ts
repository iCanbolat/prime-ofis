/**
 * Hızlı başlangıç aktarımları için ortak Excel okuma yardımcıları — saf fonksiyonlar.
 *
 * Bürolar mükellef ve şifre listelerini farklı başlıklarla tutar; sütunlar sıraya göre değil,
 * başlık adlarına (Türkçe karakter ve noktalamadan bağımsız) göre bulunur.
 */
import { normalize } from "./tahakkuk"
import { isValidTckn, isValidVkn } from "../lib/tax-id"

export type Hucre = unknown

export interface SutunTanimi<K extends string = string> {
  anahtar: K
  /** Şablondaki başlık */
  baslik: string
  /** Kabul edilen diğer başlıklar */
  esAdlar?: string[]
  zorunlu?: boolean
  /** Şablonun örnek satırı ve açıklama sayfası için */
  ornek?: string | number
  aciklama?: string
}

export type SutunIndeksi<K extends string> = Partial<Record<K, number>>

export class SutunHatasi extends Error {}

/** "VKN / TCKN" → "VKN TCKN", "e-Bildirge İşyeri Şifresi" → "E BILDIRGE ISYERI SIFRESI" */
export const baslikNormal = (h: Hucre) =>
  normalize(String(h ?? ""))
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()

/**
 * Başlık satırını (ilk 20 satır içinde) ve sütun indekslerini bulur. Zorunlu sütunların
 * hepsinin bulunduğu ilk satır başlık kabul edilir; bulunamazsa eksikleri sayan hata atılır.
 */
export function sutunlariEslestir<K extends string>(
  satirlar: Hucre[][],
  tanimlar: SutunTanimi<K>[]
): { indeks: SutunIndeksi<K>; baslikSatiri: number } {
  const adlar = tanimlar.map((t) => ({
    anahtar: t.anahtar,
    adlar: new Set([t.baslik, ...(t.esAdlar ?? [])].map(baslikNormal)),
  }))
  let enIyi: { eksik: string[]; bulunan: number } | null = null
  for (let i = 0; i < Math.min(satirlar.length, 20); i++) {
    const basliklar = (satirlar[i] ?? []).map(baslikNormal)
    const indeks: SutunIndeksi<K> = {}
    for (const { anahtar, adlar: kume } of adlar) {
      const j = basliklar.findIndex((b) => b && kume.has(b))
      if (j >= 0) indeks[anahtar] = j
    }
    const eksik = tanimlar
      .filter((t) => t.zorunlu && indeks[t.anahtar] === undefined)
      .map((t) => t.baslik)
    const bulunan = Object.keys(indeks).length
    if (eksik.length === 0 && bulunan > 0) return { indeks, baslikSatiri: i }
    if (!enIyi || bulunan > enIyi.bulunan) enIyi = { eksik, bulunan }
  }
  throw new SutunHatasi(
    enIyi && enIyi.bulunan > 0
      ? `Zorunlu sütun bulunamadı: ${enIyi.eksik.join(", ")}`
      : "Başlık satırı bulunamadı. Şablondaki sütun adlarını kullanın."
  )
}

/** Başlıktan sonraki dolu satırlar; `satir` Excel'deki satır numarasıdır (1 tabanlı) */
export function veriSatirlari(satirlar: Hucre[][], baslikSatiri: number) {
  return satirlar
    .map((hucreler, i) => ({ satir: i + 1, hucreler }))
    .slice(baslikSatiri + 1)
    .filter(({ hucreler }) => hucreler.some((h) => metin(h) !== ""))
}

export function metin(h: Hucre): string {
  if (h === null || h === undefined) return ""
  if (typeof h === "number")
    return Number.isInteger(h) ? String(h) : String(h).replace(".", ",")
  return String(h).trim()
}

/** Evet/Hayır hücresi; boş veya tanınmayan → undefined */
export function evetHayir(h: Hucre): boolean | undefined {
  if (typeof h === "boolean") return h
  const s = baslikNormal(h)
  if (/^(EVET|E|VAR|1|X|TRUE|DOGRU)$/.test(s)) return true
  if (/^(HAYIR|H|YOK|0|FALSE|YANLIS)$/.test(s)) return false
  return undefined
}

/**
 * VKN/TCKN hücresi: rakamlar dışı atılır. Excel sayı hücresinde baştaki sıfırı düşürdüğü için
 * 9 haneli değer 10 haneli VKN'ye tamamlanır.
 */
export function kimlikNo(h: Hucre): { vkn: string } | { tckn: string } | null {
  let s = metin(h).replace(/\D/g, "")
  if (s.length === 9) s = `0${s}`
  if (s.length === 10 && isValidVkn(s)) return { vkn: s }
  if (s.length === 11 && isValidTckn(s)) return { tckn: s }
  return null
}

export const kimlikDegeri = (k: { vkn: string } | { tckn: string }) =>
  "vkn" in k ? k.vkn : k.tckn

/** Excel tarih seri numarası (1900 sistemi) → Date (UTC gün) */
function excelSeri(n: number): Date {
  return new Date(Math.round((n - 25569) * 86_400_000))
}

const iki = (n: number) => String(n).padStart(2, "0")

/** Tarih hücresi → yyyy-MM-dd. "31.12.2025", "31/12/2025", "2025-12-31" ve Excel tarihi kabul edilir */
export function tarihHucresi(h: Hucre): string | null {
  if (h instanceof Date)
    return `${h.getFullYear()}-${iki(h.getMonth() + 1)}-${iki(h.getDate())}`
  if (typeof h === "number" && h > 20_000 && h < 80_000) {
    const d = excelSeri(h)
    return `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}`
  }
  const s = metin(h)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return gecerliTarih(+m[1]!, +m[2]!, +m[3]!)
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s)
  if (m) return gecerliTarih(+m[3]!, +m[2]!, +m[1]!)
  return null
}

function gecerliTarih(y: number, a: number, g: number): string | null {
  const d = new Date(Date.UTC(y, a - 1, g))
  return d.getUTCMonth() === a - 1 && d.getUTCDate() === g
    ? `${y}-${iki(a)}-${iki(g)}`
    : null
}

/** Dönem hücresi → yyyy-MM. "2026-01", "01/2026", "1.2026", "Ocak 2026" ve Excel tarihi kabul edilir */
export function donemHucresi(h: Hucre): string | null {
  const tarih =
    h instanceof Date || typeof h === "number" ? tarihHucresi(h) : null
  if (tarih) return tarih.slice(0, 7)
  const s = metin(h)
  let m = /^(\d{4})[-./](\d{1,2})$/.exec(s)
  if (m) return gecerliDonem(+m[1]!, +m[2]!)
  m = /^(\d{1,2})[-./](\d{4})$/.exec(s)
  if (m) return gecerliDonem(+m[2]!, +m[1]!)
  m = /^([A-Z]+) (\d{4})$/.exec(baslikNormal(s))
  if (m) {
    const ay = AYLAR.indexOf(m[1]!) + 1
    if (ay > 0) return gecerliDonem(+m[2]!, ay)
  }
  const t = tarihHucresi(s)
  return t ? t.slice(0, 7) : null
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

const gecerliDonem = (y: number, a: number) =>
  a >= 1 && a <= 12 && y >= 2000 && y <= 2100 ? `${y}-${iki(a)}` : null

/** Önizleme satırı. `mesajlar`: hatalıda hata, diğerlerinde bilgi/uyarı */
export type SatirDurumu = "aktarilacak" | "atlanacak" | "hatali"

export interface OkunanSatir<T> {
  satir: number
  etiket: string
  durum: SatirDurumu
  mesajlar: string[]
  veri?: T
}
