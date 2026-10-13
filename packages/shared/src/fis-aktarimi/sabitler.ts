import type {
  FisBelgeTuru,
  FisDurum,
  FisHesapAyari,
  FisOdeme,
  LucaSablonAyari,
  LucaSutunAlan,
  OkumaDurum,
} from "../types/domain"

/** Luca "Excel Veri Aktarımı": bir dosyada en fazla bu kadar fiş yüklenebilir */
export const MAKS_FIS_DOSYA = 50
/** Luca: mahsup fişi en fazla bu kadar satır olabilir */
export const MAKS_FIS_SATIR = 400
/** Okuyucunun güveni bunun altındaysa taslakta uyarı gösterilir */
export const DUSUK_GUVEN = 0.75

export const FIS_DURUM_ETIKET: Record<FisDurum, string> = {
  TASLAK: "Taslak",
  ONAYLANDI: "Aktarıma hazır",
  AKTARILDI: "Aktarıldı",
}

export const OKUMA_DURUM_ETIKET: Record<OkumaDurum, string> = {
  OKUNUYOR: "Okunuyor",
  OKUNDU: "Okundu",
  HATA: "Okunamadı",
}

export const ODEME_ETIKET: Record<FisOdeme, string> = {
  NAKIT: "Nakit",
  KART: "Kart",
  VERESIYE: "Veresiye",
}

export const LUCA_ALAN_ETIKET: Record<LucaSutunAlan, string> = {
  FIS_NO: "Fiş no",
  FIS_TARIHI: "Fiş tarihi",
  FIS_ACIKLAMA: "Fiş açıklaması",
  HESAP_KODU: "Hesap kodu",
  EVRAK_NO: "Evrak no",
  EVRAK_TARIHI: "Evrak tarihi",
  DETAY_ACIKLAMA: "Satır açıklaması",
  BORC: "Borç",
  ALACAK: "Alacak",
  MIKTAR: "Miktar",
  BELGE_TURU: "Belge türü",
  PARA_BIRIMI: "Para birimi",
  KUR: "Kur",
  DOVIZ_TUTAR: "Döviz tutarı",
}

export const FIS_BELGE_TURU_ETIKET: Record<FisBelgeTuru, string> = {
  EF: "e-Fatura (EF)",
  EA: "e-Arşiv fatura (EA)",
  MF: "Muhasebe fişi (MF)",
}

/** Luca'nın zorunlu tuttuğu alanlar; şablondan çıkarılamaz */
export const ZORUNLU_ALANLAR: LucaSutunAlan[] = [
  "FIS_NO",
  "FIS_TARIHI",
  "HESAP_KODU",
  "BORC",
  "ALACAK",
]

/**
 * Luca'nın indirilebilir şablonundaki başlıklar. Gerçek şablon farklıysa büro
 * Ayarlar → Luca aktarımı'ndan başlıkları ve sırayı değiştirir.
 */
export const VARSAYILAN_LUCA_SABLONU: LucaSablonAyari = {
  sutunlar: [
    { alan: "FIS_NO", baslik: "Fiş No" },
    { alan: "FIS_TARIHI", baslik: "Fiş Tarihi" },
    { alan: "FIS_ACIKLAMA", baslik: "Fiş Açıklama" },
    { alan: "HESAP_KODU", baslik: "Hesap Kodu" },
    { alan: "EVRAK_NO", baslik: "Evrak No" },
    { alan: "EVRAK_TARIHI", baslik: "Evrak Tarihi" },
    { alan: "DETAY_ACIKLAMA", baslik: "Detay Açıklama" },
    { alan: "BORC", baslik: "Borç" },
    { alan: "ALACAK", baslik: "Alacak" },
    { alan: "MIKTAR", baslik: "Miktar" },
    { alan: "BELGE_TURU", baslik: "Belge Türü" },
    { alan: "PARA_BIRIMI", baslik: "Para Birimi" },
    { alan: "KUR", baslik: "Kur" },
    { alan: "DOVIZ_TUTAR", baslik: "Döviz Tutar" },
  ],
  tarihFormati: "dd.MM.yyyy",
  baslangicFisNo: 1,
}

export const TARIH_FORMATLARI = ["dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]

/** Tek düzen hesap planına göre varsayılanlar; mükellef kartından değiştirilebilir */
export function varsayilanHesapAyari(mukellefId: string): FisHesapAyari {
  return {
    id: mukellefId,
    gider: "770.01",
    kdv: {
      "1": "191.01.001",
      "10": "191.01.010",
      "20": "191.01.020",
    },
    kasa: "100.01",
    banka: "102.01",
    satici: "320.01",
    eslemeler: [],
  }
}
