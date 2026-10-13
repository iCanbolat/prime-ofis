import type {
  ArsivKategori,
  IstenenEvrak,
  MesajSablonTip,
  TalepDurumu,
  TalepKanal,
} from "../types/domain"

/** Müşteri portalından gelen aktivite kayıtları bu aktörle yazılır */
export const MUSTERI_AKTOR_ID = "musteri"

export interface IstenenEvrakTanimi {
  ad: string
  /** Onaylanınca arşivde önerilen kategori */
  kategori: ArsivKategori
  /** Portalda müşteriye kısa açıklama */
  ipucu?: string
  /** Maaş / kişisel veri içerir: bağlantı varsayılan olarak kısa ömürlü tutulur */
  hassas?: boolean
}

export const ISTENEN_EVRAKLAR: Record<IstenenEvrak, IstenenEvrakTanimi> = {
  FIS_FATURA: {
    ad: "Aylık fiş / fatura",
    kategori: "FATURA",
    ipucu:
      "Alış ve satış fişleri, faturalar. Her fişi ayrı, düz ve tamamı okunacak şekilde çekin.",
  },
  BANKA_EKSTRESI: {
    ad: "Banka ekstresi",
    kategori: "BANKA_EKSTRESI",
    ipucu:
      "Dönemin tüm hesap hareketleri. İnternet şubesinden indirilen PDF'i tercih edin.",
  },
  KIRA_SOZLESMESI: { ad: "Kira sözleşmesi", kategori: "KIRA_SOZLESMESI" },
  KIMLIK: {
    ad: "Kimlik fotokopisi",
    kategori: "KIMLIK",
    ipucu: "Ön ve arka yüz",
  },
  IMZA_SIRKULERI: { ad: "İmza sirküleri", kategori: "IMZA_SIRKULERI" },
  VERGI_LEVHASI: { ad: "Vergi levhası", kategori: "VERGI_LEVHASI" },
  TICARET_SICIL_GAZETESI: {
    ad: "Ticaret sicil gazetesi",
    kategori: "TICARET_SICIL_GAZETESI",
  },
  FAALIYET_BELGESI: { ad: "Faaliyet belgesi", kategori: "FAALIYET_BELGESI" },
  PUANTAJ: {
    ad: "Puantaj / ek ödeme-kesinti bilgisi",
    kategori: "BORDRO",
    ipucu:
      "Dönem puantajı: izin, fazla mesai, prim, avans ve kesinti (icra, nafaka) bilgileri. İstirahat raporlarını büronuz SGK'dan alır.",
    hassas: true,
  },
  ISE_GIRIS_CIKIS: {
    ad: "İşe giriş / çıkış belgeleri",
    kategori: "SGK_BELGESI",
    ipucu: "Yeni işe başlayan veya ayrılan çalışanların bilgi ve belgeleri.",
    hassas: true,
  },
  IMZALI_BORDRO: {
    ad: "İmzalı bordro",
    kategori: "BORDRO",
    ipucu: "Çalışanlarca imzalanmış dönem bordrosu.",
    hassas: true,
  },
  UCRET_DEKONTU: {
    ad: "Ücret ödeme dekontu",
    kategori: "BORDRO",
    ipucu:
      "Maaşların banka yoluyla ödendiğini gösteren dekont veya toplu ödeme listesi.",
    hassas: true,
  },
  DIGER: { ad: "Diğer evraklar", kategori: "DIGER" },
}

export const ISTENEN_SIRASI: IstenenEvrak[] = [
  "FIS_FATURA",
  "BANKA_EKSTRESI",
  "PUANTAJ",
  "ISE_GIRIS_CIKIS",
  "IMZALI_BORDRO",
  "UCRET_DEKONTU",
  "KIRA_SOZLESMESI",
  "KIMLIK",
  "IMZA_SIRKULERI",
  "VERGI_LEVHASI",
  "TICARET_SICIL_GAZETESI",
  "FAALIYET_BELGESI",
  "DIGER",
]

/** Arşivdeki eksik kategoriden istenecek evrak türü */
export const KATEGORIDEN_ISTENEN: Partial<Record<ArsivKategori, IstenenEvrak>> =
  {
    IMZA_SIRKULERI: "IMZA_SIRKULERI",
    TICARET_SICIL_GAZETESI: "TICARET_SICIL_GAZETESI",
    VERGI_LEVHASI: "VERGI_LEVHASI",
    KIRA_SOZLESMESI: "KIRA_SOZLESMESI",
    FAALIYET_BELGESI: "FAALIYET_BELGESI",
    KIMLIK: "KIMLIK",
    BORDRO: "IMZALI_BORDRO",
    SGK_BELGESI: "ISE_GIRIS_CIKIS",
    BANKA_EKSTRESI: "BANKA_EKSTRESI",
    DIGER: "DIGER",
  }

export function kategorilerdenIstenen(
  kategoriler: ArsivKategori[]
): IstenenEvrak[] {
  return [...new Set(kategoriler.map((k) => KATEGORIDEN_ISTENEN[k] ?? "DIGER"))]
}

export const KANAL_ETIKET: Record<TalepKanal, string> = {
  WHATSAPP: "WhatsApp",
  EPOSTA: "E-posta",
  LINK: "Bağlantı",
}

export const TALEP_DURUM_ETIKET: Record<TalepDurumu, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  SURESI_DOLDU: "Süresi doldu",
  IPTAL: "İptal",
}

export const GECERLILIK_SECENEKLERI = [3, 7, 14, 30] as const
export const VARSAYILAN_GECERLILIK_GUN = 7
/** Bordro / SGK gibi hassas evraklar için varsayılan bağlantı ömrü */
export const HASSAS_GECERLILIK_GUN = 3

/** Seçilen evraklardan biri hassassa true */
export function hassasMi(istenenler: IstenenEvrak[]): boolean {
  return istenenler.some((i) => ISTENEN_EVRAKLAR[i]?.hassas)
}

export function varsayilanGecerlilik(istenenler: IstenenEvrak[]): number {
  return hassasMi(istenenler)
    ? HASSAS_GECERLILIK_GUN
    : VARSAYILAN_GECERLILIK_GUN
}

/** Büro şablonu yoksa kullanılan mesajlar */
export const VARSAYILAN_SABLONLAR: Record<MesajSablonTip, string> = {
  TALEP:
    "Merhaba {unvan}, {buro} olarak {donem} dönemi için şu evraklara ihtiyacımız var: {evraklar}. Aşağıdaki bağlantıdan fotoğraf çekerek veya dosya seçerek yükleyebilirsiniz: {link} (Son gün: {sonTarih}). Teşekkürler.",
  RED: "Merhaba {unvan}, gönderdiğiniz evraklardan biri uygun değil: {neden}. Lütfen aynı bağlantıdan tekrar yükleyin: {link} (Son gün: {sonTarih}). {buro}",
  TAHAKKUK:
    "Merhaba {unvan}, {donem} dönemi {beyan} beyannamenizin tahakkuku ektedir. Ödenecek tutar {tutar}, son ödeme günü {vade}. {buro}",
  BORC_HATIRLATMA:
    "Merhaba {unvan}, {donemler} dönemlerine ait {bakiye} tutarındaki hizmet bedeli ödemeniz bulunmaktadır. IBAN: {iban}. Ödediyseniz bu mesajı dikkate almayınız. {buro}",
}
