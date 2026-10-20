import type {
  BeratDurumu,
  EBelgeFaturaTipi,
  EBelgeSenaryo,
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  GibDurumu,
  EntegratorBaglantiDurumu,
} from "../types/domain"

export const EBELGE_TUR_ETIKET: Record<EBelgeTur, string> = {
  E_FATURA: "e-Fatura",
  E_ARSIV: "e-Arşiv",
}

export const EBELGE_YON_ETIKET: Record<EBelgeYon, string> = {
  GELEN: "Gelen",
  GIDEN: "Giden",
}

export const SENARYO_ETIKET: Record<EBelgeSenaryo, string> = {
  TEMEL: "Temel",
  TICARI: "Ticari",
  EARSIV: "e-Arşiv",
}

export const FATURA_TIPI_ETIKET: Record<EBelgeFaturaTipi, string> = {
  SATIS: "Satış",
  IADE: "İade",
  TEVKIFAT: "Tevkifat",
  ISTISNA: "İstisna",
}

export const GIB_DURUM_ETIKET: Record<GibDurumu, string> = {
  BASARILI: "Başarılı",
  ISLENIYOR: "İşleniyor",
  HATA: "Hatalı",
  IPTAL: "İptal",
}

export const YANIT_ETIKET: Record<EFaturaYanit, string> = {
  BEKLIYOR: "Yanıt bekliyor",
  KABUL: "Kabul edildi",
  RED: "Reddedildi",
  SURESI_DOLDU: "Yanıt süresi doldu",
}

export const BERAT_DURUM_ETIKET: Record<BeratDurumu, string> = {
  YUKLENMEDI: "Yüklenmedi",
  YUKLENDI: "Berat bekleniyor",
  ONAYLANDI: "Berat alındı",
  HATA: "Hatalı",
}

export const BAGLANTI_DURUM_ETIKET: Record<EntegratorBaglantiDurumu, string> = {
  BAGLI: "Bağlı",
  HATA: "Bağlantı hatası",
  BAGLI_DEGIL: "Bağlı değil",
}

export const SAYFA_BOYUTU = 20
