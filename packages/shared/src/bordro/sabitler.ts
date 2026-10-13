import type { BordroUyari } from "./kurallar"
import type { BordroBelgeTur, BordroDurum } from "../types/domain"

export const BORDRO_DURUM_ETIKET: Record<BordroDurum, string> = {
  BEKLENIYOR: "Girdi bekleniyor",
  GIRDI_GELDI: "Girdi geldi",
  HAZIRLANDI: "Bordro hazırlandı",
  MUKELLEFE_GITTI: "Mükellefe gitti",
  BEYAN_VERILDI: "Beyan verildi",
}

export const BORDRO_UYARI_ETIKET: Record<BordroUyari, string> = {
  YOK: "Sorun yok",
  YAKLASIYOR: "Yaklaşıyor",
  GECIKTI: "Gecikti",
}

/** MUHSGK görev şablonundaki (gorev/sabitler.ts) ilgili checklist maddeleri */
export const BORDRO_MADDE_GIRDI = "Puantaj ve bordro alındı"
export const BORDRO_MADDE_HAZIR = "Bordro hazırlandı"

/** Müşteri portalında / mesajlarda gösterilen kısa not */
export const BORDRO_MUHSGK_NOTU =
  "Bordro dönemi iş ayıdır; MUHSGK beyanı ertesi ayın 26'sında verilir."

export const BORDRO_BELGE_ETIKET: Record<BordroBelgeTur, string> = {
  PUANTAJ: "Puantaj",
  ICMAL: "Bordro dökümü (icmal)",
  PUSULA: "Ücret hesap pusulaları",
  TAHAKKUK: "Tahakkuk / hizmet listesi",
  IMZALI: "İmzalı bordro",
  DEKONT: "Ücret ödeme dekontu",
}

/** Rozetlerde kısa ad */
export const BORDRO_BELGE_KISA: Record<BordroBelgeTur, string> = {
  PUANTAJ: "Puantaj",
  ICMAL: "İcmal",
  PUSULA: "Pusula",
  TAHAKKUK: "Tahakkuk",
  IMZALI: "İmzalı bordro",
  DEKONT: "Dekont",
}

/** Bordro takibi listesi: ızgara 2/3 sütuna tam bölünsün */
export const BORDRO_SAYFA_BOYUTU = 24
