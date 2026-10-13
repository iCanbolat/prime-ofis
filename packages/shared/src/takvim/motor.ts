/**
 * Takvim kural motoru — saf fonksiyonlar, UI ve API'den bağımsız.
 * Mükellef özellikleri + kurallar + tatil tablosu → belirli tarih aralığındaki yükümlülükler.
 * Hem mock sunucu hem (ileride) görev üretimi bu motoru kullanır.
 */
import { addDays, endOfMonth, isWeekend } from "date-fns"

import {
  KURALLAR,
  YUKUMLULUK_SIRASI,
  type Periyot,
  type YukumlulukKurali,
} from "./kurallar"
import { TATIL_HARITASI } from "./tatiller"
import { formatDonem } from "../lib/format"
import { fromYmd, toYmd } from "../lib/tarih"
import type { Mukellef, YukumlulukTip } from "../types/domain"

export interface HesaplananYukumluluk {
  tip: YukumlulukTip
  donem: string
  /** Kaydırma uygulanmış son gün (yyyy-MM-dd) */
  sonTarih: string
  /** Kuraldaki asıl son gün (yyyy-MM-dd) */
  yasalSonTarih: string
}

export interface TarihAraligi {
  /** yyyy-MM-dd, dahil */
  baslangic: string
  /** yyyy-MM-dd, dahil */
  bitis: string
}

type Tatiller = ReadonlyMap<string, string>

export function isGunuMu(
  tarih: Date,
  tatiller: Tatiller = TATIL_HARITASI
): boolean {
  return !isWeekend(tarih) && !tatiller.has(toYmd(tarih))
}

/** VUK 18: son gün tatile rastlarsa tatili izleyen ilk iş günü */
export function isGununeKaydir(
  tarih: Date,
  tatiller: Tatiller = TATIL_HARITASI
): Date {
  let sonuc = tarih
  while (!isGunuMu(sonuc, tatiller)) sonuc = addDays(sonuc, 1)
  return sonuc
}

interface Donem {
  donem: string
  donemSonu: Date
}

/** `bitis`e kadar biten, son günü aralığa düşebilecek dönemleri üretir (en uzun gecikme ~4 ay). */
function donemler(
  periyot: Periyot,
  baslangic: Date,
  bitis: Date,
  ceyrekler?: number[]
): Donem[] {
  const sonuc: Donem[] = []
  const ilkYil = baslangic.getFullYear() - 1
  const sonYil = bitis.getFullYear()

  for (let yil = ilkYil; yil <= sonYil; yil++) {
    if (periyot === "YILLIK") {
      sonuc.push({ donem: String(yil), donemSonu: new Date(yil, 11, 31) })
      continue
    }
    if (periyot === "UC_AYLIK") {
      for (let ceyrek = 1; ceyrek <= 4; ceyrek++) {
        if (ceyrekler && !ceyrekler.includes(ceyrek)) continue
        sonuc.push({
          donem: `${yil}-Q${ceyrek}`,
          donemSonu: endOfMonth(new Date(yil, ceyrek * 3 - 1, 1)),
        })
      }
      continue
    }
    for (let ay = 0; ay < 12; ay++) {
      sonuc.push({
        donem: `${yil}-${String(ay + 1).padStart(2, "0")}`,
        donemSonu: endOfMonth(new Date(yil, ay, 1)),
      })
    }
  }
  return sonuc
}

export function uygulananKurallar(m: Mukellef): YukumlulukKurali[] {
  return KURALLAR.filter((k) => k.uygulanirMi(m))
}

/** Mükellefin tabi olduğu yükümlülük türleri (gösterim sırasıyla) */
export function uygulananTipler(m: Mukellef): YukumlulukTip[] {
  const tipler = new Set(uygulananKurallar(m).map((k) => k.tip))
  return YUKUMLULUK_SIRASI.filter((t) => tipler.has(t))
}

export function yukumlulukleriHesapla(
  m: Mukellef,
  aralik: TarihAraligi,
  tatiller: Tatiller = TATIL_HARITASI
): HesaplananYukumluluk[] {
  const baslangic = fromYmd(aralik.baslangic)
  const bitis = fromYmd(aralik.bitis)
  const sonuc: HesaplananYukumluluk[] = []

  for (const kural of uygulananKurallar(m)) {
    for (const { donem, donemSonu } of donemler(
      kural.periyot,
      baslangic,
      bitis,
      kural.ceyrekler
    )) {
      const yasal = kural.sonGun(donemSonu)
      const sonGun = isGununeKaydir(yasal, tatiller)
      const sonTarih = toYmd(sonGun)
      if (sonTarih < aralik.baslangic || sonTarih > aralik.bitis) continue
      sonuc.push({
        tip: kural.tip,
        donem,
        sonTarih,
        yasalSonTarih: toYmd(yasal),
      })
    }
  }

  return sonuc.sort(
    (a, b) =>
      a.sonTarih.localeCompare(b.sonTarih) ||
      YUKUMLULUK_SIRASI.indexOf(a.tip) - YUKUMLULUK_SIRASI.indexOf(b.tip)
  )
}

export const takvimOlayId = (
  mukellefId: string,
  tip: YukumlulukTip,
  donem: string
) => `${mukellefId}:${tip}:${donem}`

const CEYREK_AYLARI = ["Oca–Mar", "Nis–Haz", "Tem–Eyl", "Eki–Ara"]

/** "2026-09" → "Eylül 2026", "2026-Q3" → "2026/3 (Tem–Eyl)", "2025" → "2025 yılı" */
export function donemEtiketi(donem: string): string {
  const ceyrek = /^(\d{4})-Q([1-4])$/.exec(donem)
  if (ceyrek)
    return `${ceyrek[1]}/${ceyrek[2]} (${CEYREK_AYLARI[Number(ceyrek[2]) - 1]})`
  if (/^\d{4}$/.test(donem)) return `${donem} yılı`
  return formatDonem(donem)
}

/** Son gün neden kaydırıldı? Kaydırma yoksa null. Ör. "hafta sonu", "Kurban Bayramı 2. gün" */
export function kaydirmaNedeni(
  yasalSonTarih: string,
  sonTarih: string,
  tatiller: Tatiller = TATIL_HARITASI
): string | null {
  if (yasalSonTarih === sonTarih) return null
  return tatiller.get(yasalSonTarih) ?? "hafta sonu"
}
