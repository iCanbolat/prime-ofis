/**
 * Beyan ve bildirim kuralları — veri olarak tutulur. Mevzuat değiştiğinde yalnızca bu dosya
 * güncellenir; hesaplama `motor.ts`'dedir. Tarihler "vergilendirme dönemini izleyen" ay/yıla göre.
 */
import { endOfMonth } from "date-fns"

import type { Mukellef, YukumlulukTip } from "../types/domain"

export type Periyot = "AYLIK" | "UC_AYLIK" | "YILLIK"

export interface YukumlulukKurali {
  tip: YukumlulukTip
  periyot: Periyot
  /** 3 aylık kurallarda hangi çeyrekler için beyan verilir (varsayılan: hepsi) */
  ceyrekler?: number[]
  uygulanirMi: (m: Mukellef) => boolean
  /**
   * Dönemin son günü (ay sonu / çeyrek sonu / yıl sonu) verildiğinde yasal son günü döner.
   * Hafta sonu / tatil kaydırması motor tarafından uygulanır.
   */
  sonGun: (donemSonu: Date) => Date
}

/** Dönem sonunu izleyen n. ayın belirli günü */
const izleyenAyinGunu = (ay: number, gun: number) => (donemSonu: Date) =>
  new Date(donemSonu.getFullYear(), donemSonu.getMonth() + ay, gun)

/** Dönem sonunu izleyen n. ayın son günü */
const izleyenAyinSonu = (ay: number) => (donemSonu: Date) =>
  endOfMonth(new Date(donemSonu.getFullYear(), donemSonu.getMonth() + ay, 1))

export const KURALLAR: YukumlulukKurali[] = [
  {
    // KDV beyannamesi: izleyen ayın 28'i
    tip: "KDV",
    periyot: "AYLIK",
    uygulanirMi: (m) => m.kdvMukellefi && m.kdvPeriyodu === "AYLIK",
    sonGun: izleyenAyinGunu(1, 28),
  },
  {
    // 3 aylık KDV: çeyreği izleyen ayın 28'i
    tip: "KDV",
    periyot: "UC_AYLIK",
    uygulanirMi: (m) => m.kdvMukellefi && m.kdvPeriyodu === "UC_AYLIK",
    sonGun: izleyenAyinGunu(1, 28),
  },
  {
    // Muhtasar ve prim hizmet: izleyen ayın 26'sı. Şirketlerde stopaj (kira, ücret) nedeniyle her zaman.
    tip: "MUHTASAR_SGK",
    periyot: "AYLIK",
    uygulanirMi: (m) => m.tur !== "SAHIS" || m.sgkIsyeriVar,
    sonGun: izleyenAyinGunu(1, 26),
  },
  {
    // Geçici vergi: çeyreği izleyen 2. ayın 17'si; 4. dönem beyanı kaldırıldı
    tip: "GECICI_VERGI",
    periyot: "UC_AYLIK",
    ceyrekler: [1, 2, 3],
    uygulanirMi: () => true,
    sonGun: izleyenAyinGunu(2, 17),
  },
  {
    // Kurumlar vergisi: izleyen yılın Nisan ayı sonu
    tip: "KURUMLAR",
    periyot: "YILLIK",
    uygulanirMi: (m) => m.tur !== "SAHIS",
    sonGun: izleyenAyinSonu(4),
  },
  {
    // Yıllık gelir vergisi: izleyen yılın Mart ayı sonu
    tip: "GELIR",
    periyot: "YILLIK",
    uygulanirMi: (m) => m.tur === "SAHIS",
    sonGun: izleyenAyinSonu(3),
  },
  {
    // Ba-Bs formları: izleyen ayın son günü (bilanço esası)
    tip: "BA_BS",
    periyot: "AYLIK",
    uygulanirMi: (m) => m.defterTuru === "BILANCO",
    sonGun: izleyenAyinSonu(1),
  },
  {
    // e-Defter berat yükleme: ilgili ayı izleyen 3. ayın sonu
    tip: "E_DEFTER_BERAT",
    periyot: "AYLIK",
    uygulanirMi: (m) => m.eDefterMukellefi,
    sonGun: izleyenAyinSonu(3),
  },
]

export interface YukumlulukTanimi {
  ad: string
  kisaAd: string
  /** Takvimde renk kodu (tailwind sınıfları) */
  renk: string
}

export const YUKUMLULUK_TANIMLARI: Record<YukumlulukTip, YukumlulukTanimi> = {
  KDV: {
    ad: "KDV beyannamesi",
    kisaAd: "KDV",
    renk: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  MUHTASAR_SGK: {
    ad: "Muhtasar ve prim hizmet",
    kisaAd: "MUHSGK",
    renk: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  GECICI_VERGI: {
    ad: "Geçici vergi",
    kisaAd: "Geçici",
    renk: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  KURUMLAR: {
    ad: "Kurumlar vergisi",
    kisaAd: "Kurumlar",
    renk: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  GELIR: {
    ad: "Yıllık gelir vergisi",
    kisaAd: "Gelir",
    renk: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  BA_BS: {
    ad: "Ba-Bs formları",
    kisaAd: "Ba-Bs",
    renk: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  E_DEFTER_BERAT: {
    ad: "e-Defter berat",
    kisaAd: "e-Defter",
    renk: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
}

export const YUKUMLULUK_SIRASI: YukumlulukTip[] = [
  "KDV",
  "MUHTASAR_SGK",
  "GECICI_VERGI",
  "BA_BS",
  "E_DEFTER_BERAT",
  "KURUMLAR",
  "GELIR",
]
