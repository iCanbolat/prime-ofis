/**
 * e-Beyanname tahakkuk fişi ayrıştırıcısı — saf fonksiyonlar.
 *
 * Girdi, PDF'ten satır satır çıkarılmış metindir (`dosya-oku.ts`). Fişin düzeni sürümden sürüme
 * değişebildiği için ayrıştırma etiket + desen aramasıyla yapılır; bulunamayan alan boş kalır ve
 * kullanıcı önizlemede tamamlar. Gerçek fişlerle kalibre edilmesi gerekir.
 */
import { isValidTckn, isValidVkn } from "../lib/tax-id"
import type { YukumlulukTip } from "../types/domain"

/** GİB beyanname kodu → takvimdeki yükümlülük. Listede olmayan kodlar takvimde izlenmez. */
export const BEYANNAME_KODU_TIP: Record<string, YukumlulukTip> = {
  KDV1: "KDV",
  MUHSGK: "MUHTASAR_SGK",
  GGECICI: "GECICI_VERGI",
  KGECICI: "GECICI_VERGI",
  KURUMLAR: "KURUMLAR",
  GELIR: "GELIR",
  FORMBA: "BA_BS",
  FORMBS: "BA_BS",
}

const BILINEN_KODLAR = [
  ...Object.keys(BEYANNAME_KODU_TIP),
  "KDV2",
  "KDV4",
  "DAMGA",
  "TURIZM",
  "KONAKLAMA",
  "GMSI",
]

/** Kodun yazılmadığı fişlerde başlıktan tür tahmini */
const BASLIK_TIP: [RegExp, string][] = [
  [/MUHTASAR VE PRIM HIZMET/, "MUHSGK"],
  [/KURUMLAR VERGISI/, "KURUMLAR"],
  [/YILLIK GELIR VERGISI/, "GELIR"],
  [/KURUMLAR GECICI VERGI/, "KGECICI"],
  [/GELIR GECICI VERGI/, "GGECICI"],
  [/FORM ?BA\b/, "FORMBA"],
  [/FORM ?BS\b/, "FORMBS"],
  [/KATMA DEGER VERGISI BEYANNAMESI/, "KDV1"],
]

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

export interface TahakkukOkuma {
  vknTckn?: string
  beyannameKodu?: string
  tip?: YukumlulukTip
  /** Takvim dönemi: "2026-08" / "2026-Q2" / "2025" */
  donem?: string
  tahakkukNo?: string
  odenecek?: number
  /** yyyy-MM-dd */
  vade?: string
  uyarilar: string[]
}

/** Büyük harf + Türkçe karakterleri ASCII'ye indirger: "Vergilendirme Dönemi" → "VERGILENDIRME DONEMI" */
export function normalize(metin: string): string {
  return metin
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[ \t\u00a0]+/g, " ")
}

/** "1.234,56" → 1234.56 */
export function trTutar(metin: string): number {
  return Number(metin.replace(/\./g, "").replace(",", "."))
}

const TUTAR_RE = /\d{1,3}(?:\.\d{3})*,\d{2}/g
/** `test` için bayraksız kopya: global regex'in `lastIndex` durumu testleri bozar */
const TUTAR_VAR = new RegExp(TUTAR_RE.source)
const pad = (n: number) => String(n).padStart(2, "0")

function kimlikBul(m: string): string | undefined {
  const etiketli =
    /(?:VERGI KIMLIK|T\.? ?C\.? KIMLIK)(?: NO| NUMARASI)?\s*:?\s*(\d{10,11})\b/.exec(
      m
    )
  if (etiketli) return etiketli[1]
  for (const [aday] of m.matchAll(/(?<!\d)\d{10,11}(?!\d)/g))
    if (isValidVkn(aday) || isValidTckn(aday)) return aday
  return undefined
}

function kodBul(m: string): string | undefined {
  const etiketli = /BEYANNAME(?:NIN)? (?:TURU|KODU)\s*:?\s*([A-Z0-9]+)/.exec(
    m
  )?.[1]
  if (etiketli && BILINEN_KODLAR.includes(etiketli)) return etiketli
  // "GELIR" başlıktaki "GELIR IDARESI" ile karışmasın diye serbest aramada yok
  const serbest = BILINEN_KODLAR.filter((k) => k !== "GELIR")
  const kod = new RegExp(`\\b(${serbest.join("|")})\\b`).exec(m)?.[1]
  if (kod) return kod
  return BASLIK_TIP.find(([re]) => re.test(m))?.[1]
}

interface Ay {
  yil: number
  ay: number
}

function donemAraligiBul(m: string): { bas: Ay; bit: Ay } | undefined {
  const aralik =
    /(?<!\d[/.])\b(\d{1,2})[/.](\d{4}) ?[-–] ?(\d{1,2})[/.](\d{4})\b/.exec(m)
  if (aralik) {
    const [, a1, y1, a2, y2] = aralik.map(Number) as number[]
    return { bas: { yil: y1!, ay: a1! }, bit: { yil: y2!, ay: a2! } }
  }
  const adli = new RegExp(`\\b(${AYLAR.join("|")}) ?[/-]? ?(\\d{4})\\b`).exec(m)
  if (adli) {
    const ay = { yil: Number(adli[2]), ay: AYLAR.indexOf(adli[1]!) + 1 }
    return { bas: ay, bit: ay }
  }
  // dd/MM/yyyy tarihlerinin "MM/yyyy" kısmı dönem sanılmasın
  const tek = /(?<!\d[/.])\b(\d{1,2})[/.](\d{4})\b/.exec(m)
  if (tek) {
    const ay = { yil: Number(tek[2]), ay: Number(tek[1]) }
    return { bas: ay, bit: ay }
  }
  const yil = /\bYIL[I]?\s*:?\s*(\d{4})\b/.exec(m)
  if (yil) {
    const y = Number(yil[1])
    return { bas: { yil: y, ay: 1 }, bit: { yil: y, ay: 12 } }
  }
  return undefined
}

/** Fişteki dönem aralığını yükümlülüğün takvim dönemine çevirir */
export function takvimDonemi(
  tip: YukumlulukTip,
  bas: Ay,
  bit: Ay
): string | undefined {
  if (bit.ay < 1 || bit.ay > 12) return undefined
  const ceyrek = `${bit.yil}-Q${Math.ceil(bit.ay / 3)}`
  const aySayisi = (bit.yil - bas.yil) * 12 + bit.ay - bas.ay + 1
  switch (tip) {
    case "KURUMLAR":
    case "GELIR":
      return String(bit.yil)
    case "GECICI_VERGI":
      return ceyrek
    case "KDV":
      return aySayisi === 3 ? ceyrek : `${bit.yil}-${pad(bit.ay)}`
    default:
      return `${bit.yil}-${pad(bit.ay)}`
  }
}

function tarih(g: string, a: string, y: string) {
  return `${y}-${pad(Number(a))}-${pad(Number(g))}`
}

export function tahakkukOku(metin: string): TahakkukOkuma {
  const m = normalize(metin)
  const satirlar = m.split("\n")
  const uyarilar: string[] = []

  const vknTckn = kimlikBul(m)
  if (!vknTckn) uyarilar.push("Vergi kimlik numarası bulunamadı")

  const beyannameKodu = kodBul(m)
  const tip = beyannameKodu ? BEYANNAME_KODU_TIP[beyannameKodu] : undefined
  if (!beyannameKodu) uyarilar.push("Beyanname türü bulunamadı")
  else if (!tip)
    uyarilar.push(`${beyannameKodu} beyannamesi takvimde izlenmiyor`)

  const aralik = donemAraligiBul(m)
  const donem =
    tip && aralik ? takvimDonemi(tip, aralik.bas, aralik.bit) : undefined
  if (!aralik) uyarilar.push("Dönem bulunamadı")

  const tahakkukNo =
    /TAHAKKUK (?:FISI )?(?:NO|NUMARASI)\s*:?\s*([A-Z0-9]{4,})/.exec(m)?.[1]

  // Tablonun "TOPLAM" satırındaki son tutar ödenecek toplamdır; yoksa "ÖDENECEK" satırı
  const tutarSatiri =
    satirlar.findLast((s) => /\bTOPLAM\b/.test(s) && TUTAR_VAR.test(s)) ??
    satirlar.find((s) => /ODENECEK/.test(s) && TUTAR_VAR.test(s))
  const tutarlar = tutarSatiri?.match(TUTAR_RE)
  const odenecek = tutarlar ? trTutar(tutarlar.at(-1)!) : undefined
  if (odenecek === undefined) uyarilar.push("Ödenecek tutar bulunamadı")

  // Etiketli vade; yoksa tablodaki ilk vergi satırının son tarihi (sütun: vade tarihi)
  const TARIH_RE = /(\d{2})[/.](\d{2})[/.](\d{4})/g
  const vergiSatiri = satirlar.find(
    (s) => TUTAR_VAR.test(s) && new RegExp(TARIH_RE.source).test(s)
  )
  const vadeEslesme =
    /VADE(?: TARIHI)? ?:? ?(\d{2})[/.](\d{2})[/.](\d{4})/.exec(m) ??
    (vergiSatiri ? [...vergiSatiri.matchAll(TARIH_RE)].at(-1) : undefined)
  const vade = vadeEslesme
    ? tarih(vadeEslesme[1]!, vadeEslesme[2]!, vadeEslesme[3]!)
    : undefined

  return {
    vknTckn,
    beyannameKodu,
    tip,
    donem,
    tahakkukNo,
    odenecek,
    vade,
    uyarilar,
  }
}

/** Takvim dönemi biçimi yükümlülüğe uygun mu? (Önizlemede elle girilen dönem için) */
export function donemGecerliMi(tip: YukumlulukTip, donem: string): boolean {
  switch (tip) {
    case "KURUMLAR":
    case "GELIR":
      return /^\d{4}$/.test(donem)
    case "GECICI_VERGI":
      return /^\d{4}-Q[1-4]$/.test(donem)
    case "KDV":
      return /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/.test(donem)
    default:
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(donem)
  }
}
