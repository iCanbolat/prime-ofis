import type { KdvPeriyodu, DefterTuru, MukellefTur } from "@prime/shared/types/domain"

export const MUKELLEF_TUR_ACIKLAMA: Record<MukellefTur, string> = {
  SAHIS: "Gerçek kişi, TCKN ile",
  LTD: "Limited şirket, VKN ile",
  AS: "Anonim şirket, VKN ile",
}

export const KDV_PERIYODU_ETIKET: Record<KdvPeriyodu, string> = {
  AYLIK: "Aylık",
  UC_AYLIK: "3 aylık",
}

export const DEFTER_TURU_ETIKET: Record<DefterTuru, string> = {
  ISLETME: "İşletme hesabı",
  BILANCO: "Bilanço esası",
}

export const ETIKET_ONERILERI = [
  "Öncelikli",
  "Yeni Müşteri",
  "İhracatçı",
  "Kira Geliri",
  "e-Ticaret",
  "Serbest Meslek",
]

export const VERGI_DAIRESI_ONERILERI = [
  "Kadıköy",
  "Kozyatağı",
  "Mecidiyeköy",
  "Beşiktaş",
  "Üsküdar",
  "Maslak",
  "Zincirlikuyu",
  "Şişli",
  "Çankaya",
  "Bornova",
]

export const SAYFA_BOYUTU = 20
