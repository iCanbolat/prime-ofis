/**
 * İşe giriş / işten çıkış bildirim süreleri — saf fonksiyonlar.
 *
 * Varsayılan kurallar (5510 s. Kanun md. 8 uyarınca en yaygın durumlar):
 *  - İşe giriş: çalışmaya başlamadan önce bildirilir. Son gün başlama günüdür; sonrası gecikmedir.
 *    Süre geriye doğru işlediği için tatile kaydırılmaz.
 *  - İşten çıkış: ayrılıştan itibaren 10 gün içinde bildirilir; son gün tatile rastlarsa izleyen
 *    ilk iş gününe uzar.
 *
 * Not: süreler mevzuata göre doğrulanmalıdır (kaynaklarla teyit edilmedi).
 */
import { addDays } from "date-fns"

import { kalanIsGunu, type BordroUyari } from "./kurallar"
import { isGununeKaydir } from "../takvim/motor"
import { fromYmd, toYmd } from "../lib/tarih"
import type { IsHareketiDurum, IsHareketiTur } from "../types/domain"

/** Çıkış bildirimi için gün sayısı */
export const CIKIS_BILDIRIM_GUN = 10
/** Son güne bu kadar iş günü kala "yaklaşıyor" */
export const HAREKET_ESIK_IS_GUNU = 1

export const HAREKET_TUR_ETIKET: Record<IsHareketiTur, string> = {
  GIRIS: "İşe giriş",
  CIKIS: "İşten çıkış",
}

export const HAREKET_DURUM_ETIKET: Record<IsHareketiDurum, string> = {
  BEKLIYOR: "Bildirilmedi",
  BILDIRILDI: "Bildirildi",
}

/** Bildirimin yapılması gereken son gün (yyyy-MM-dd) */
export function hareketSonTarih(tur: IsHareketiTur, tarih: string): string {
  if (tur === "GIRIS") return tarih
  return toYmd(isGununeKaydir(addDays(fromYmd(tarih), CIKIS_BILDIRIM_GUN)))
}

export function hareketUyari(
  durum: IsHareketiDurum,
  sonTarih: string,
  bugunYmd: string
): BordroUyari {
  if (durum === "BILDIRILDI") return "YOK"
  if (sonTarih < bugunYmd) return "GECIKTI"
  return kalanIsGunu(bugunYmd, sonTarih) <= HAREKET_ESIK_IS_GUNU
    ? "YAKLASIYOR"
    : "YOK"
}
