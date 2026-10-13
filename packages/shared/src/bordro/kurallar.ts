/**
 * Bordro takibi kuralları — saf fonksiyonlar; mock handler ve (ileride) backend aynı hesabı kullanır.
 *
 * Bordro dönemi iş ayıdır ("2026-08"). O dönemin MUHSGK beyanı ertesi ayın 26'sındadır (takvim
 * kuralıyla aynı; son gün tatile rastlarsa izleyen ilk iş günü). Puantaj ve ek ödeme/kesinti
 * girdisi, son güne `BORDRO_GIRDI_ESIGI_IS_GUNU` iş günü kala hâlâ gelmediyse uyarı verilir.
 *
 * Not: eşik büro içi bir çalışma kuralıdır, yasal süre değildir.
 */
import { addDays, addMonths, format } from "date-fns"

import { isGunuMu, isGununeKaydir } from "../takvim/motor"
import { fromYmd, toYmd } from "../lib/tarih"
import type {
  ArsivKategori,
  BordroBelgeTur,
  BordroDurum,
  BordroSaklananDurum,
  IstenenEvrak,
  Mukellef,
} from "../types/domain"

/** Son güne bu kadar iş günü kala girdi gelmediyse "yaklaşıyor" */
export const BORDRO_GIRDI_ESIGI_IS_GUNU = 5
/** Girdi geldikten sonra bu kadar iş günü kala beyan hâlâ verilmediyse "yaklaşıyor" */
export const BORDRO_SON_ESIK_IS_GUNU = 1

export const BORDRO_DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Saklanabilen durumların akış sırası */
export const BORDRO_DURUM_SIRASI: BordroSaklananDurum[] = [
  "BEKLENIYOR",
  "GIRDI_GELDI",
  "HAZIRLANDI",
  "MUKELLEFE_GITTI",
]

export type BordroUyari = "YOK" | "YAKLASIYOR" | "GECIKTI"

/** Bordrosu olan (aktif ve çalışanı / SGK işyeri kaydı bulunan) mükellef mi? */
export function bordroUygulanirMi(
  m: Pick<Mukellef, "aktif" | "calisanSayisi" | "sgkIsyeriVar">
): boolean {
  return m.aktif && (m.calisanSayisi > 0 || m.sgkIsyeriVar)
}

export const bordroKayitId = (mukellefId: string, donem: string) =>
  `${mukellefId}:${donem}`

/** Dönemin MUHSGK son günü (yyyy-MM-dd): ertesi ayın 26'sı, tatilde ilk iş günü */
export function bordroSonTarih(donem: string): string {
  const ayBasi = fromYmd(`${donem}-01`)
  const yasal = addDays(addMonths(ayBasi, 1), 25)
  return toYmd(isGununeKaydir(yasal))
}

/**
 * `bugunYmd` ile `sonYmd` arasındaki iş günü sayısı. Son gün geçtiyse negatif.
 * Bugün hariç, son gün dahil sayılır.
 */
export function kalanIsGunu(bugunYmd: string, sonYmd: string): number {
  if (sonYmd === bugunYmd) return 0
  const ileri = sonYmd > bugunYmd
  const [bas, bit] = ileri ? [bugunYmd, sonYmd] : [sonYmd, bugunYmd]
  const sinir = fromYmd(bit)
  let sayi = 0
  for (let d = addDays(fromYmd(bas), 1); d <= sinir; d = addDays(d, 1)) {
    if (isGunuMu(d)) sayi++
  }
  return ileri ? sayi : -sayi
}

/**
 * Uyarı seviyesi:
 *  - GECIKTI: son gün geçti, beyan verilmedi
 *  - YAKLASIYOR: girdi hâlâ gelmedi ve son güne eşik kadar kaldı; ya da girdi geldi ama son güne
 *    1 iş günü kaldı
 */
export function bordroUyari(
  durum: BordroDurum,
  sonTarih: string,
  bugunYmd: string
): BordroUyari {
  if (durum === "BEYAN_VERILDI") return "YOK"
  if (sonTarih < bugunYmd) return "GECIKTI"
  const kalan = kalanIsGunu(bugunYmd, sonTarih)
  if (durum === "BEKLENIYOR" && kalan <= BORDRO_GIRDI_ESIGI_IS_GUNU)
    return "YAKLASIYOR"
  if (kalan <= BORDRO_SON_ESIK_IS_GUNU) return "YAKLASIYOR"
  return "YOK"
}

/** "2026-09-23" → "2026-08" (içinde bulunulan ayın bordro dönemi bir önceki aydır) */
export function guncelBordroDonemi(bugunYmd: string): string {
  return format(addMonths(fromYmd(`${bugunYmd.slice(0, 7)}-01`), -1), "yyyy-MM")
}

/** En yeni dönem önce: [guncel, bir önceki, …] */
export function sonBordroDonemleri(bugunYmd: string, adet: number): string[] {
  const guncel = fromYmd(`${guncelBordroDonemi(bugunYmd)}-01`)
  return Array.from({ length: adet }, (_, i) =>
    format(addMonths(guncel, -i), "yyyy-MM")
  )
}

// --- Dönem belgeleri -----------------------------------------------------------------

/** Bordro sayfasında ve arşivde belgelerin gösterim sırası */
export const BORDRO_BELGE_SIRASI: BordroBelgeTur[] = [
  "PUANTAJ",
  "ICMAL",
  "PUSULA",
  "TAHAKKUK",
  "IMZALI",
  "DEKONT",
]

/** Dönem ve bordro belge türü taşıyabilen arşiv kategorileri */
export const DONEMLI_KATEGORILER: ArsivKategori[] = ["BORDRO", "SGK_BELGESI"]

/** Portaldan gelen evrak türünün arşivdeki bordro belge türü */
export const ISTENEN_BORDRO_BELGE: Partial<
  Record<IstenenEvrak, BordroBelgeTur>
> = {
  PUANTAJ: "PUANTAJ",
  IMZALI_BORDRO: "IMZALI",
  UCRET_DEKONTU: "DEKONT",
}

const AD_TURLERI: [RegExp, BordroBelgeTur][] = [
  [/pusula|hesap.?pusula|payslip/, "PUSULA"],
  [/tahakkuk|muhsgk|aphb|hizmet.?listesi/, "TAHAKKUK"],
  [/puantaj/, "PUANTAJ"],
  [/imzal/, "IMZALI"],
  [/dekont|odeme.?listesi/, "DEKONT"],
  [/icmal|dokum|bordro/, "ICMAL"],
]

/**
 * Dosya adından belge türü tahmini (Luca çıktılarının olağan adları). Kullanıcı yükleme
 * ekranında değiştirebilir; tahmin yoksa ICMAL.
 */
export function bordroBelgeTahmini(dosyaAdi: string): BordroBelgeTur {
  const ad = dosyaAdi
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
  return AD_TURLERI.find(([re]) => re.test(ad))?.[1] ?? "ICMAL"
}
