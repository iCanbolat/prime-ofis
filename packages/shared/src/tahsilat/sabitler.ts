import type { KesintiDurum } from "./kurallar"
import type { CariKalem } from "../types/domain"

export const SAYFA_BOYUTU = 20

export const KALEM_ETIKET: Record<CariKalem, string> = {
  AYLIK_UCRET: "Aylık ücret",
  EK_HIZMET: "Ek hizmet",
  ODEME: "Ödeme",
  DUZELTME: "Alacak düzeltmesi",
  ACILIS: "Açılış bakiyesi",
}

export const KESINTI_DURUM_ETIKET: Record<KesintiDurum, string> = {
  ESLESTI: "Eşleşti",
  EKSIK: "Eksik bildirilmiş",
  FAZLA: "Fazla bildirilmiş",
  BILDIRILMEMIS: "Bildirilmemiş",
  KAYITSIZ: "Tahsilatta yok",
}

export const KESINTI_DURUM_ACIKLAMA: Record<KesintiDurum, string> = {
  ESLESTI: "İVD'deki kesinti tahsilattan beklenen stopajla uyuşuyor.",
  EKSIK:
    "Mükellef beklenenden az stopaj bildirmiş; muhtasarını düzeltmesi gerekebilir.",
  FAZLA:
    "Mükellef beklenenden fazla stopaj bildirmiş; kayıtsız ödeme veya hata olabilir.",
  BILDIRILMEMIS:
    "Ödeme alındı ama İVD'de kesinti görünmüyor; mükellefin muhtasarı kontrol edilmeli.",
  KAYITSIZ: "İVD'de kesinti var ama tahsilatta bu döneme ait ödeme yok.",
}

export const KDV_ORANLARI = [20, 10, 1, 0] as const
