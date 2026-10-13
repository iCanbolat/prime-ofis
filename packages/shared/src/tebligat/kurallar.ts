/**
 * e-Tebligat süre kuralları — saf fonksiyonlar; mock handler ve (ileride) backend aynı hesabı kullanır.
 *
 * VUK 107/A: elektronik ortamda tebliğ, belgenin muhatabın elektronik adresine ulaştığı tarihi
 * izleyen beşinci günün sonunda yapılmış sayılır. Yasal süreler tebliğ tarihinden işler; son gün
 * tatile rastlarsa izleyen ilk iş gününe uzar (VUK 18).
 *
 * Not: süreler en yaygın durumlar için varsayılandır ve mevzuata göre doğrulanmalıdır. Yazıda
 * farklı bir süre belirtilmişse kayıttaki `sureGun` kullanılır.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"

import { normalize } from "../ice-aktarim/tahakkuk"
import { isGununeKaydir } from "../takvim/motor"
import { fromYmd, toYmd } from "../lib/tarih"
import type { Tebligat, TebligatDurum, TebligatTur } from "../types/domain"

/** Ulaşmayı izleyen bu kadar günün sonunda tebliğ edilmiş sayılır */
export const TEBLIG_GUN = 5
/** Son işlem gününe bu kadar gün kala "acil" */
export const ACIL_GUN = 3

export interface SureKurali {
  /** Tebliğden itibaren gün; null → yasal süre izlenmez */
  gun: number | null
  /** Süre içinde yapılacak iş */
  islem: string
  dayanak?: string
}

export const SURE_KURALLARI: Record<TebligatTur, SureKurali> = {
  ODEME_EMRI: {
    gun: 15,
    islem: "Ödeme veya vergi mahkemesinde dava",
    dayanak: "6183 s. Kanun md. 55, 58",
  },
  VERGI_CEZA_IHBARNAMESI: {
    gun: 30,
    islem: "Dava, uzlaşma veya indirimli ödeme başvurusu",
    dayanak: "VUK 376, İYUK 7",
  },
  IZAHA_DAVET: {
    gun: 15,
    islem: "İzah",
    dayanak: "VUK 370",
  },
  BILGI_ISTEME: {
    gun: 15,
    islem: "İstenen bilgi ve belgelerin verilmesi",
    dayanak: "VUK 148",
  },
  INCELEME: {
    gun: 15,
    islem: "Defter ve belgelerin ibrazı",
    dayanak: "VUK 139",
  },
  DIGER: { gun: null, islem: "İnceleme" },
}

export const ACIK_DURUMLAR: readonly TebligatDurum[] = ["YENI", "INCELENDI"]
export const acikMi = (durum: TebligatDurum) => ACIK_DURUMLAR.includes(durum)

/** Belgenin ulaştığı yerel gün (yyyy-MM-dd) */
export const ulasmaGunu = (ulasmaTarihi: string) =>
  format(parseISO(ulasmaTarihi), "yyyy-MM-dd")

/** Tebliğ tarihi: ulaşmayı izleyen 5. gün (tatil kaydırması yapılmaz) */
export function tebligTarihi(ulasmaTarihi: string): string {
  return toYmd(addDays(fromYmd(ulasmaGunu(ulasmaTarihi)), TEBLIG_GUN))
}

export function sureGunu(t: Pick<Tebligat, "tur" | "sureGun">): number | null {
  return t.sureGun ?? SURE_KURALLARI[t.tur].gun
}

/** Son işlem günü: tebliğ + süre, iş gününe kaydırılmış; süre yoksa undefined */
export function sonIslemTarihi(
  t: Pick<Tebligat, "tur" | "sureGun" | "ulasmaTarihi">
): string | undefined {
  const gun = sureGunu(t)
  if (gun === null) return undefined
  return toYmd(
    isGununeKaydir(addDays(fromYmd(tebligTarihi(t.ulasmaTarihi)), gun))
  )
}

export interface TebligatSureDurumu {
  tebligTarihi: string
  sonIslemTarihi?: string
  /** Son işlem gününe kalan gün (geçmişse negatif) */
  kalanGun?: number
  acik: boolean
  /** Açık ve son işlem günü geçmiş */
  gecikti: boolean
  /** Açık ve son işlem gününe ≤ 3 gün */
  acil: boolean
}

export function sureDurumu(
  t: Pick<Tebligat, "tur" | "sureGun" | "ulasmaTarihi" | "durum">,
  bugunYmd: string
): TebligatSureDurumu {
  const son = sonIslemTarihi(t)
  const kalanGun =
    son === undefined
      ? undefined
      : differenceInCalendarDays(fromYmd(son), fromYmd(bugunYmd))
  const acik = acikMi(t.durum)
  return {
    tebligTarihi: tebligTarihi(t.ulasmaTarihi),
    sonIslemTarihi: son,
    kalanGun,
    acik,
    gecikti: acik && kalanGun !== undefined && kalanGun < 0,
    acil:
      acik && kalanGun !== undefined && kalanGun >= 0 && kalanGun <= ACIL_GUN,
  }
}

/** Sıra önemli: daha özgül ifade önce */
const TUR_KALIPLARI: [TebligatTur, RegExp][] = [
  ["ODEME_EMRI", /ODEME EMRI/],
  [
    "VERGI_CEZA_IHBARNAMESI",
    /(VERGI\/CEZA|VERGI ZIYAI|CEZA) IHBARNAME|IHBARNAME/,
  ],
  ["IZAHA_DAVET", /IZAHA DAVET/],
  ["BILGI_ISTEME", /BILGI (ISTEME|TALEP)|BILGI VE BELGE (ISTEME|TALEP)/],
  ["INCELEME", /INCELEME|DEFTER VE BELGE(LERIN)? IBRAZ/],
]

/**
 * GİB e-Tebligat kutusundaki belge türü / konu metnini sınıflar; tanınmayan → `DIGER`.
 * Not: kalıplar örnek metinlerle yazıldı; gerçek GİB belge türleriyle kalibre edilmelidir.
 */
export function tebligatTuru(metin: string): TebligatTur {
  const n = normalize(metin)
  return TUR_KALIPLARI.find(([, re]) => re.test(n))?.[0] ?? "DIGER"
}
