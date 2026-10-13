/**
 * Domain modelleri. Mock DB, MSW handler'ları ve feature'lar bu tipleri ortak kullanır.
 * Tüm tarih alanları ISO 8601 string olarak tutulur (JSON / localStorage uyumu için).
 */

export type ISODateString = string

export type Rol = "YONETICI" | "PERSONEL"

export interface Buro {
  id: string
  ad: string
  vkn: string
  vergiDairesi: string
  telefon: string
  eposta: string
  adres: string
  /** Evrak talebi mesaj şablonları; değişkenler: {unvan} {donem} {link} {buro} {sonTarih} {evraklar} {neden} */
  mesajSablonlari: Record<MesajSablonTip, string>
  /** Ücret ödemeleri için büro IBAN'ı (borç hatırlatma mesajında) */
  iban?: string
  /** Luca "Excel Veri Aktarımı" sütun düzeni; yoksa varsayılan kullanılır */
  lucaSablonu?: LucaSablonAyari
}

/**
 * TALEP: ilk gönderim / yeniden gönderim; RED: reddedilen evrak için tekrar yükleme isteği;
 * TAHAKKUK: beyanname tahakkukunun mükellefe iletilmesi; BORC_HATIRLATMA: ücret borcu hatırlatması
 */
export type MesajSablonTip = "TALEP" | "RED" | "TAHAKKUK" | "BORC_HATIRLATMA"

export interface Personel {
  id: string
  ad: string
  soyad: string
  eposta: string
  telefon: string
  rol: Rol
  /** Avatar arka planı için tailwind renk anahtarı */
  renk: PersonelRenk
  aktif: boolean
}

/**
 * Personel giriş şifresinin özeti (id = personelId). Yalnızca sunucuda tutulur; `/personel`
 * yanıtlarına hiçbir zaman eklenmez. PBKDF2-SHA256, 32 byte.
 */
export interface PersonelKimlik {
  id: string
  salt: string
  hash: string
  iterations: number
}

export type PersonelRenk = "blue" | "emerald" | "amber" | "rose" | "violet"

export type MukellefTur = "SAHIS" | "LTD" | "AS"
export type KdvPeriyodu = "AYLIK" | "UC_AYLIK"
export type DefterTuru = "ISLETME" | "BILANCO"

export interface Mukellef {
  id: string
  tur: MukellefTur
  unvan: string
  /** Ltd / A.Ş. için 10 haneli VKN */
  vkn?: string
  /** Şahıs için 11 haneli TCKN (vergi kimlik no olarak da kullanılır) */
  tckn?: string
  /** Ltd / A.Ş. için */
  ticaretSicilNo?: string
  /** Ltd / A.Ş. için 16 haneli MERSİS numarası */
  mersisNo?: string
  vergiDairesi: string
  naceKodu: string
  faaliyet: string
  telefon: string
  eposta: string
  il: string
  ilce: string
  adres: string
  sorumluPersonelId: string
  kdvMukellefi: boolean
  kdvPeriyodu: KdvPeriyodu
  defterTuru: DefterTuru
  sgkIsyeriVar: boolean
  calisanSayisi: number
  eDefterMukellefi: boolean
  aktif: boolean
  etiketler: string[]
  olusturmaTarihi: ISODateString
  /** Büronun bu mükelleften aldığı aylık hizmet bedeli; tanımlıysa her ay otomatik borçlandırılır */
  ucret?: MukellefUcret
  /** Mükellefe gönderimde tercih edilen kanal; yoksa telefon varsa WhatsApp, yoksa e-posta */
  tercihKanal?: MukellefKanal
}

export type MukellefKanal = "WHATSAPP" | "EPOSTA"

/** Aylık serbest meslek ücreti. Tutarlar TL; KDV ve stopaj brütten hesaplanır. */
export interface MukellefUcret {
  aylikBrut: number
  /** Yüzde, ör. 20 */
  kdvOrani: number
  /** Mükellef %20 gelir vergisi stopajı keser mi (tevkifat sorumlusu) */
  stopajVar: boolean
  /** İlk borçlandırılacak dönem ("2026-01") */
  baslangicDonem: string
}

export type AktiviteEylem =
  | "GIRIS"
  | "CIKIS"
  | "MUKELLEF_OLUSTURULDU"
  | "MUKELLEF_GUNCELLENDI"
  | "SIFRE_EKLENDI"
  | "SIFRE_GORUNTULENDI"
  | "SIFRE_KOPYALANDI"
  | "SIFRE_TEBLIGATA_AKTARILDI"
  | "SIFRE_GUNCELLENDI"
  | "SIFRE_SILINDI"
  | "BEYAN_DURUMU_GUNCELLENDI"
  | "ARSIV_YUKLENDI"
  | "ARSIV_GUNCELLENDI"
  | "ARSIV_SILINDI"
  | "ARSIV_GERI_ALINDI"
  | "ARSIV_KALICI_SILINDI"
  | "DOSYA_GORUNTULENDI"
  | "DOSYA_INDIRILDI"
  | "BORDRO_GUNCELLENDI"
  | "BORDRO_OZET_ICE_AKTARILDI"
  | "ISE_HAREKETI_KAYDEDILDI"
  | "TALEP_OLUSTURULDU"
  | "TALEP_GONDERILDI"
  | "TALEP_UZATILDI"
  | "TALEP_IPTAL_EDILDI"
  | "TALEP_YENIDEN_ACILDI"
  | "TALEP_TAMAMLANDI"
  | "EVRAK_YUKLENDI"
  | "EVRAK_ONAYLANDI"
  | "EVRAK_REDDEDILDI"
  | "SABLON_GUNCELLENDI"
  | "GOREV_OLUSTURULDU"
  | "GOREV_GUNCELLENDI"
  | "GOREV_DURUMU_DEGISTI"
  | "GOREV_ATANDI"
  | "GOREV_YORUMLANDI"
  | "GOREV_SILINDI"
  | "DONEM_GOREVLERI_OLUSTURULDU"
  | "ENTEGRATOR_BAGLANDI"
  | "ENTEGRATOR_BAGLANTI_KALDIRILDI"
  | "EBELGE_SENKRONIZE_EDILDI"
  | "EFATURA_KABUL_EDILDI"
  | "EFATURA_REDDEDILDI"
  | "EBELGE_ARSIVE_KAYDEDILDI"
  | "KONTOR_ALINDI"
  | "TAHAKKUK_ICE_AKTARILDI"
  | "MIZAN_ICE_AKTARILDI"
  | "TAHSILAT_BORC_EKLENDI"
  | "TAHSILAT_ODEME_ALINDI"
  | "TAHSILAT_HAREKET_SILINDI"
  | "UCRET_GUNCELLENDI"
  | "KESINTI_ICE_AKTARILDI"
  | "BURO_GUNCELLENDI"
  | "TEBLIGAT_ALINDI"
  | "TEBLIGAT_GUNCELLENDI"
  | "TEBLIGAT_ERISIMI_TANIMLANDI"
  | "TEBLIGAT_ERISIMI_KALDIRILDI"
  | "TEBLIGAT_ERISIM_HATASI"
  | "KANAL_GUNCELLENDI"
  | "KANAL_KALDIRILDI"
  | "MUKELLEFE_GONDERILDI"
  | "FIS_OKUNDU"
  | "FIS_ONAYLANDI"
  | "LUCA_AKTARIMI"
  | "LUCA_AKTARIMI_GERI_ALINDI"
  | "PERSONEL_EKLENDI"
  | "PERSONEL_GUNCELLENDI"
  | "PERSONEL_SIFRESI_DEGISTI"
  | "PERSONEL_SILINDI"
  | "SGK_ERISIMI_TANIMLANDI"
  | "SGK_ERISIMI_KALDIRILDI"
  | "SGK_ERISIM_HATASI"
  | "SIFRE_SGK_SORGUSUNA_AKTARILDI"
  | "VERGI_LEVHASI_ALINDI"
  | "BORC_SORGULANDI"
  | "BORC_TESPIT_EDILDI"
  | "BORCU_YOKTUR_TALEP_EDILDI"
  | "BORCU_YOKTUR_SONUCLANDI"
  | "KAMU_DOGRULAMA_BEKLIYOR"
  | "KAMU_DOGRULAMA_TAMAMLANDI"

export interface AktiviteLog {
  id: string
  aktorId: string
  eylem: AktiviteEylem
  hedefTip?:
    | "MUKELLEF"
    | "CREDENTIAL"
    | "GOREV"
    | "EVRAK"
    | "TAKVIM"
    | "ARSIV"
    | "EBELGE"
    | "TAHSILAT"
    | "TEBLIGAT"
    | "FIS"
    | "BORDRO"
    | "BORC"
  hedefId?: string
  /** Kaydın ilişkili olduğu mükellef (mükellef kartındaki aktivite akışı için) */
  mukellefId?: string
  aciklama?: string
  zaman: ISODateString
}

/** Bildirim türü: aktivite eylemleri + yalnızca bildirimde var olan türler (anma, hatırlatmalar) */
export type BildirimTur =
  | AktiviteEylem
  | "GOREV_ANILDI"
  | "GOREV_GECIKTI"
  | "BELGE_GECERLILIK"
  | "EFATURA_YANIT_SURESI"
  | "BEYAN_YAKLASIYOR"
  | "ODEME_GECIKTI"
  | "TEBLIGAT_SURE_YAKLASIYOR"
  | "BORDRO_GIRDI_BEKLIYOR"
  | "ISE_HAREKETI_SURE"

/** Uygulama içi bildirim. `aliciId: null` → tüm kullanıcılara yayın (aktörün kendisi hariç). */
export interface Bildirim {
  id: string
  tur: BildirimTur
  aliciId: string | null
  aktorId?: string
  baslik: string
  aciklama?: string
  /** Uygulama içi yol, ör. /gorevler?gorev=o_12 */
  link?: string
  mukellefId?: string
  hedefTip?: AktiviteLog["hedefTip"]
  hedefId?: string
  zaman: ISODateString
  /** Okuyan kullanıcılar (yayınlarda okundu bilgisi kişi başınadır) */
  okuyanlar: string[]
  /** Hatırlatmaların tekilleştirme anahtarı, ör. "GOREV_GECIKTI:o_12:2026-09-23" */
  anahtar?: string
}

/** Şifre kasasında tutulan sistemler */
export type Sistem = "GIB" | "SGK" | "IVD" | "EBILDIRGE"

export interface EncryptedPayload {
  /** base64 AES-256-GCM şifreli metin (auth tag dahil) */
  cipherText: string
  /** base64 12 byte IV — her şifrelemede yeni üretilir */
  iv: string
}

/**
 * Bir mükellefin bir sistemdeki giriş bilgisi. Şifreler istemcide kasa anahtarıyla şifrelenir;
 * sunucu (mock) yalnızca şifreli veriyi görür. Şifreli içerik: `CredentialSecret` JSON'u.
 */
export interface Credential extends EncryptedPayload {
  id: string
  mukellefId: string
  sistem: Sistem
  kullaniciAdi: string
  /** Şifrelenmez; hassas bilgi yazılmamalı */
  not?: string
  sonGuncelleme: ISODateString
  guncelleyenId: string
}

/** Şifreli alanın çözülmüş hali */
export interface CredentialSecret {
  sifre: string
  /** GİB "şifre", SGK "işyeri şifresi" gibi ikinci gizli alan */
  ekSifre?: string
}

/**
 * Büro kasasının anahtar türetme bilgisi. Ana şifre hiçbir yerde saklanmaz;
 * doğrulama için bilinen bir metnin şifreli hali (`verifier`) tutulur.
 */
export interface KasaMeta {
  id: string
  salt: string
  iterations: number
  verifier: EncryptedPayload
  olusturmaTarihi: ISODateString
}

/** Vergi / bildirim yükümlülüğü türleri */
export type YukumlulukTip =
  | "KDV"
  | "MUHTASAR_SGK"
  | "GECICI_VERGI"
  | "KURUMLAR"
  | "GELIR"
  | "BA_BS"
  | "E_DEFTER_BERAT"

/** Saklanan beyan durumu. "Gecikti" saklanmaz; son tarih ve bugünden türetilir. */
export type BeyanDurumu = "BEKLIYOR" | "HAZIRLANDI" | "ONAYLANDI"

/**
 * Takvim olayları kural motoruyla her istekte hesaplanır; DB'de yalnızca
 * durum değişiklikleri tutulur. id = `${mukellefId}:${tip}:${donem}`
 */
export interface TakvimDurumKaydi {
  id: string
  mukellefId: string
  tip: YukumlulukTip
  /** "2026-09" (aylık), "2026-Q3" (3 aylık), "2025" (yıllık) */
  donem: string
  durum: BeyanDurumu
  guncelleyenId: string
  guncellemeTarihi: ISODateString
}

export type ArsivKategori =
  | "IMZA_SIRKULERI"
  | "TICARET_SICIL_GAZETESI"
  | "VERGI_LEVHASI"
  | "KIRA_SOZLESMESI"
  | "FAALIYET_BELGESI"
  | "KIMLIK"
  | "FATURA"
  | "BANKA_EKSTRESI"
  | "TAHAKKUK"
  | "MIZAN"
  | "TEBLIGAT"
  | "BORDRO"
  | "SGK_BELGESI"
  | "BORCU_YOKTUR"
  | "DIGER"

/**
 * Dijital arşiv dosyası (meta veri). İçerik ayrı saklanır (mock: IndexedDB),
 * `GET /api/arsiv/:id/icerik` ile alınır.
 */
export interface ArsivDosya {
  id: string
  mukellefId: string
  kategori: ArsivKategori
  ad: string
  mimeType: string
  /** byte */
  boyut: number
  yukleyenId: string
  yuklemeTarihi: ISODateString
  /** yyyy-MM-dd — imza sirküleri, faaliyet belgesi, kira sözleşmesi gibi süreli belgeler */
  gecerlilikTarihi?: string
  /** "2026-08" — dönemli belgeler (bordro dökümü, puantaj, dekont…); bordro sayfası bununla bulur */
  donem?: string
  /** Bordro dönemine ait belgenin türü; yalnızca dönemli bordro belgelerinde */
  bordroBelge?: BordroBelgeTur
  /** Çöp kutusunda mı */
  silindi: boolean
  silinmeTarihi?: ISODateString
}

export type TalepKanal = "WHATSAPP" | "EPOSTA" | "LINK"
/** Saklanan durum. "Süresi doldu" saklanmaz; `sonKullanma` ve şimdiden türetilir. */
export type TalepKayitDurumu = "AKTIF" | "TAMAMLANDI" | "IPTAL"
export type TalepDurumu = TalepKayitDurumu | "SURESI_DOLDU"

/** Müşteriden istenebilecek evrak türleri (şablon) */
export type IstenenEvrak =
  | "FIS_FATURA"
  | "BANKA_EKSTRESI"
  | "KIRA_SOZLESMESI"
  | "KIMLIK"
  | "IMZA_SIRKULERI"
  | "VERGI_LEVHASI"
  | "TICARET_SICIL_GAZETESI"
  | "FAALIYET_BELGESI"
  | "PUANTAJ"
  | "ISE_GIRIS_CIKIS"
  | "IMZALI_BORDRO"
  | "UCRET_DEKONTU"
  | "DIGER"

export interface TalepGonderim {
  kanal: TalepKanal
  zaman: ISODateString
  gonderenId: string
}

/**
 * Müşteriye magic link ile gönderilen evrak talebi. Portal adresi: `/p/${token}`.
 * Token tahmin edilemez (32 byte rastgele, base64url) ve yalnızca URL path'inde taşınır.
 */
export interface EvrakTalebi {
  id: string
  mukellefId: string
  token: string
  kanal: TalepKanal
  istenenler: IstenenEvrak[]
  /** "2026-09"; dönemsiz talepler için boş */
  donem?: string
  /** Müşteriye gösterilen ek açıklama */
  aciklama?: string
  durum: TalepKayitDurumu
  sonKullanma: ISODateString
  olusturanId: string
  olusturmaTarihi: ISODateString
  gonderimler: TalepGonderim[]
  /** Müşterinin "Gönderimi tamamla" ile bıraktığı not */
  musteriNotu?: string
  tamamlanmaTarihi?: ISODateString
}

export type GelenEvrakDurum = "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI"

/** Portal üzerinden müşterinin yüklediği dosya. İçerik blob-store'da (id ile). */
export interface GelenEvrak {
  id: string
  talepId: string
  mukellefId: string
  /** Müşterinin hangi istenen evrak için yüklediği */
  istenen: IstenenEvrak
  ad: string
  mimeType: string
  boyut: number
  yuklemeTarihi: ISODateString
  durum: GelenEvrakDurum
  redNedeni?: string
  /** Onaylanınca oluşturulan arşiv dosyası */
  arsivDosyaId?: string
  /** Fiş / ekstre onaylanınca başlatılan okuma (Fiş aktarımı) */
  okumaId?: string
  inceleyenId?: string
  incelemeTarihi?: ISODateString
}

export type GorevDurum = "YAPILACAK" | "DEVAM" | "KONTROL" | "TAMAM"
export type GorevOncelik = "DUSUK" | "NORMAL" | "YUKSEK"
/** Beyanname görevleri yükümlülük tipini taşır; serbest görevler "DIGER" */
export type GorevTip = YukumlulukTip | "DIGER"

export interface GorevChecklistMaddesi {
  id: string
  metin: string
  tamam: boolean
  tamamlayanId?: string
  tamamlanmaTarihi?: ISODateString
}

export interface GorevYorum {
  id: string
  yazarId: string
  metin: string
  /** Yorumda @ ile anılan personel id'leri */
  bahsedilenler: string[]
  zaman: ISODateString
}

/** Büro içi iş takibi kaydı */
export interface Gorev {
  id: string
  baslik: string
  aciklama?: string
  mukellefId: string
  tip: GorevTip
  /** "2026-08" / "2026-Q2" / "2025"; serbest görevlerde isteğe bağlı */
  donem?: string
  atananId: string
  durum: GorevDurum
  oncelik: GorevOncelik
  /** yyyy-MM-dd */
  sonTarih: string
  checklist: GorevChecklistMaddesi[]
  yorumlar: GorevYorum[]
  bagliTalepIdler: string[]
  olusturanId: string
  olusturmaTarihi: ISODateString
  guncellemeTarihi: ISODateString
  tamamlanmaTarihi?: ISODateString
  /**
   * Takvim olayından üretilen görevlerde `${mukellefId}:${tip}:${donem}` (takvim olay id'si).
   * Dönem görevi üretimini idempotent yapar ve beyan durumu senkronu için kullanılır.
   */
  otomatikAnahtar?: string
}

// --- e-Belge (Luca) ------------------------------------------------------

/**
 * Mükellefin Luca hesabıyla bağlantısı (mükellef başına bir kayıt). Web servis anahtarı yalnızca
 * backend'de şifreli saklanır; istemci ve mock DB yalnızca son 4 haneyi (`anahtarIpucu`) görür.
 */
export type EntegratorBaglantiDurumu = "BAGLI" | "HATA" | "BAGLI_DEGIL"
export type EntegratorOrtam = "TEST" | "CANLI"

export interface EntegratorBaglanti {
  id: string
  mukellefId: string
  durum: EntegratorBaglantiDurumu
  ortam: EntegratorOrtam
  /** Luca'da açık servisler (GİB kayıtlı kullanıcı durumu) */
  eFatura: boolean
  eArsiv: boolean
  eDefter: boolean
  /** e-Fatura gelen posta kutusu etiketi, ör. "urn:mail:defaultpk@cinar.com.tr" */
  postaKutusu?: string
  /** Web servis anahtarının son 4 karakteri */
  anahtarIpucu?: string
  sonSenkron?: ISODateString
  hataMesaji?: string
  baglayanId?: string
  baglanmaTarihi?: ISODateString
}

export type EBelgeTur = "E_FATURA" | "E_ARSIV"
export type EBelgeYon = "GELEN" | "GIDEN"
/** TEMEL: yanıt yok; TICARI: alıcı 8 gün içinde kabul/red verir; EARSIV: e-Arşiv faturası */
export type EBelgeSenaryo = "TEMEL" | "TICARI" | "EARSIV"
export type EBelgeFaturaTipi = "SATIS" | "IADE" | "TEVKIFAT" | "ISTISNA"
/** GİB'e iletim durumu */
export type GibDurumu = "BASARILI" | "ISLENIYOR" | "HATA" | "IPTAL"
/** Saklanan ticari fatura yanıtı. "Süresi doldu" saklanmaz; `alinmaTarihi`nden türetilir. */
export type EFaturaYanitKayit = "BEKLIYOR" | "KABUL" | "RED"
export type EFaturaYanit = EFaturaYanitKayit | "SURESI_DOLDU"

/**
 * Luca'dan senkronize edilen e-Fatura / e-Arşiv faturası (başlık bilgisi).
 * Kalemler saklanmaz; detay isteğinde entegratörden alınır.
 */
export interface EBelge {
  id: string
  mukellefId: string
  tur: EBelgeTur
  yon: EBelgeYon
  /** Evrensel tekil tanımlayıcı (UUID) */
  ettn: string
  /** 16 karakter, ör. "ABC2026000000123" */
  belgeNo: string
  senaryo: EBelgeSenaryo
  faturaTipi: EBelgeFaturaTipi
  karsiTaraf: { unvan: string; vknTckn: string }
  /** yyyy-MM-dd */
  duzenlemeTarihi: string
  /** Faturanın posta kutusuna düştüğü / gönderildiği an */
  alinmaTarihi: ISODateString
  matrah: number
  kdv: number
  toplam: number
  paraBirimi: "TRY" | "USD" | "EUR"
  gibDurumu: GibDurumu
  /** Yalnızca gelen ticari faturalarda */
  yanit?: EFaturaYanitKayit
  redNedeni?: string
  yanitlayanId?: string
  yanitTarihi?: ISODateString
  /** "Arşive kaydet" ile oluşturulan arşiv dosyası */
  arsivDosyaId?: string
}

/** e-Defter beratının GİB durumu. id = `${mukellefId}:${donem}` */
export type BeratDurumu = "YUKLENMEDI" | "YUKLENDI" | "ONAYLANDI" | "HATA"

export interface EDefterBerat {
  id: string
  mukellefId: string
  /** "2026-06" */
  donem: string
  durum: BeratDurumu
  yuklemeTarihi?: ISODateString
  onayTarihi?: ISODateString
  hataMesaji?: string
}

export const ARSIV_KATEGORI_ETIKET: Record<ArsivKategori, string> = {
  IMZA_SIRKULERI: "İmza sirküleri",
  TICARET_SICIL_GAZETESI: "Ticaret sicil gazetesi",
  VERGI_LEVHASI: "Vergi levhası",
  KIRA_SOZLESMESI: "Kira sözleşmesi",
  FAALIYET_BELGESI: "Faaliyet belgesi",
  KIMLIK: "Kimlik",
  FATURA: "Fatura",
  BANKA_EKSTRESI: "Banka ekstresi",
  TAHAKKUK: "Tahakkuk fişi",
  MIZAN: "Mizan",
  TEBLIGAT: "e-Tebligat",
  BORDRO: "Bordro",
  SGK_BELGESI: "SGK belgesi",
  BORCU_YOKTUR: "Borcu yoktur yazısı",
  DIGER: "Diğer",
}

export const MUKELLEF_TUR_ETIKET: Record<MukellefTur, string> = {
  SAHIS: "Şahıs",
  LTD: "Ltd. Şti.",
  AS: "A.Ş.",
}

export const ROL_ETIKET: Record<Rol, string> = {
  YONETICI: "Yönetici",
  PERSONEL: "Personel",
}

/**
 * Büronun Luca'dan aldığı kontör paketi. Kontör havuzu büroya aittir; tüketim ayrıca saklanmaz,
 * senkronize edilen e-belgelerden hesaplanır (bkz. `features/e-belge/kontor.ts`).
 */
export interface KontorAlim {
  id: string
  /** yyyy-MM-dd */
  tarih: string
  paketAdet: number
  /** Luca Net / Koza kullanıcılarına verilen hediye kontör */
  hediyeAdet: number
  /** KDV dahil ödenen tutar (TL) */
  tutar: number
  not?: string
  ekleyenId: string
}

// --- İçe aktarım ----------------------------------------------------------------

/**
 * e-Beyanname tahakkuk fişinden içe aktarılan kayıt. İçe aktarım takvimdeki beyanı
 * "Onaylandı" yapar; PDF arşive (TAHAKKUK) kaydedilir. Mükellef + tip + dönem başına bir kayıt.
 */
export interface Tahakkuk {
  id: string
  mukellefId: string
  tip: YukumlulukTip
  /** Takvim dönemi: "2026-08" / "2026-Q2" / "2025" */
  donem: string
  /** GİB beyanname kodu, ör. "KDV1", "MUHSGK" */
  beyannameKodu?: string
  tahakkukNo?: string
  /** Ödenecek toplam (TL) */
  odenecek?: number
  /** yyyy-MM-dd */
  vade?: string
  arsivDosyaId?: string
  yukleyenId: string
  yuklemeTarihi: ISODateString
}

export type MizanKontrolDurumu = "GECTI" | "UYARI" | "HATA"

export interface MizanKontrol {
  kod: string
  durum: MizanKontrolDurumu
  baslik: string
  aciklama?: string
}

/** Ana hesap (3 haneli) düzeyinde mizan satırı */
export interface MizanHesap {
  kod: string
  ad: string
  borc: number
  alacak: number
}

/**
 * Muhasebe paketinden (Luca, Zirve, ETA…) alınan mizanın içe aktarılmış hali.
 * Mükellef + dönem başına bir kayıt; kontroller içe aktarım anında çalışır.
 */
export interface Mizan {
  id: string
  mukellefId: string
  /** "2026-08": mizanın ait olduğu ay (kümülatif) */
  donem: string
  dosyaAdi: string
  hesaplar: MizanHesap[]
  kontroller: MizanKontrol[]
  arsivDosyaId?: string
  yukleyenId: string
  yuklemeTarihi: ISODateString
}

// --- Tahsilat ------------------------------------------------------------------

/**
 * Büronun kendi cari hesabı (mükelleften alacağı hizmet bedeli). Mükellefin ticari muhasebesi
 * değildir. BORC: aylık ücret / ek hizmet; ODEME: tahsilat ya da alacak düzeltmesi (indirim).
 */
export type CariHareketTip = "BORC" | "ODEME"
/** ACILIS: içe aktarımda devralınan bakiye (+ borç → BORC, avans → ODEME) */
export type CariKalem =
  "AYLIK_UCRET" | "EK_HIZMET" | "ODEME" | "DUZELTME" | "ACILIS"

export interface Kapatma {
  borcId: string
  tutar: number
}

export interface CariHareket {
  id: string
  mukellefId: string
  tip: CariHareketTip
  kalem: CariKalem
  /** Aylık ücrette ait olduğu dönem ("2026-09") */
  donem?: string
  /** yyyy-MM-dd — borçta tahakkuk, ödemede tahsil tarihi */
  tarih: string
  /** Borçta brüt ücret; ödemede 0 */
  brut: number
  kdv: number
  /** Mükellefin keseceği gelir vergisi stopajı */
  stopaj: number
  /** Borçta ödenecek net (brüt + KDV − stopaj); ödemede alınan tutar */
  tutar: number
  aciklama?: string
  /** Serbest meslek makbuzu no */
  makbuzNo?: string
  /** Yalnızca ODEME: hangi borçları kapattığı. Dağıtılmayan kısım avanstır. */
  kapatmalar?: Kapatma[]
  /** Otomatik aylık ücrette `UCRET:${mukellefId}:${donem}` — idempotent üretim */
  otomatikAnahtar?: string
  olusturanId: string
  olusturmaTarihi: ISODateString
}

/** İVD "Hakkınızda yapılan kesintiler" listesinin bir yılı için içe aktarım */
export interface KesintiIceAktarim {
  id: string
  yil: number
  dosyaAdi: string
  satirSayisi: number
  yukleyenId: string
  zaman: ISODateString
}

/** İVD kesinti satırı: kesintiyi yapan (mükellef) VKN'si, dönem, matrah ve kesilen vergi */
export interface KesintiKaydi {
  id: string
  iceAktarimId: string
  vkn: string
  unvan: string
  /** "2026-03" */
  donem: string
  matrah: number
  kesinti: number
}

// --- e-Tebligat -------------------------------------------------------------------

export type TebligatKurum = "GIB" | "SGK"
export type TebligatTur =
  | "ODEME_EMRI"
  | "VERGI_CEZA_IHBARNAMESI"
  | "IZAHA_DAVET"
  | "BILGI_ISTEME"
  | "INCELEME"
  | "DIGER"
/** YENI/INCELENDI açık sayılır; süre takibi yalnızca açık tebligatlarda yapılır */
export type TebligatDurum = "YENI" | "INCELENDI" | "ISLEM_YAPILDI" | "KAPANDI"

/**
 * e-Tebligat kaydı. Gece taramasında mükellefin GİB e-Tebligat kutusundan okunarak ya da elle
 * oluşturulur. Tebliğ tarihi, son işlem günü ve kalan gün saklanmaz; ulaşma tarihinden türetilir.
 */
export interface Tebligat {
  id: string
  mukellefId: string
  vkn: string
  kurum: TebligatKurum
  tur: TebligatTur
  konu: string
  belgeNo?: string
  /** Belgenin elektronik adrese ulaştığı an */
  ulasmaTarihi: ISODateString
  /** Türün varsayılan süresi yerine yazıda belirtilen süre (gün) */
  sureGun?: number
  durum: TebligatDurum
  atananId?: string
  gorevId?: string
  arsivDosyaId?: string
  not?: string
  kaynak: "GIB" | "ELLE"
  /** GİB e-Tebligat kutusundaki belgenin kimliği — aynı belge iki kez kaydedilmez */
  gibBelgeId?: string
  olusturmaTarihi: ISODateString
}

export type TebligatErisimDurumu = "AKTIF" | "HATA"

/**
 * Mükellefin GİB e-Tebligat erişimi (mükellef başına bir kayıt). Backend her gece bu bilgilerle
 * mükellefin e-Tebligat kutusuna salt okunur giriş yapar. Şifre yalnızca backend'de (KMS ile
 * şifreli) saklanır; istemci ve mock DB son 4 karakteri (`sifreIpucu`) görür. Şifre kasasından
 * bağımsızdır: kasa sıfır bilgili olduğu için sunucu gece kasayı çözemez.
 */
export interface TebligatErisim {
  id: string
  mukellefId: string
  /** GİB İnteraktif Vergi Dairesi kullanıcı kodu (TCKN / VKN / kullanıcı kodu) */
  kullaniciKodu: string
  sifreIpucu: string
  durum: TebligatErisimDurumu
  hataMesaji?: string
  /** Son başarılı tarama */
  sonTarama?: ISODateString
  /**
   * Şifre kasadaki İnteraktif VD kaydından aktarıldıysa o kayıt ve aktarıldığı andaki
   * güncellenme zamanı; kasadaki kayıt sonradan değişirse "kasadaki şifre daha yeni" uyarısı verilir.
   */
  kasaKaynagi?: { credentialId: string; credentialGuncelleme: ISODateString }
  tanimlayanId: string
  tanimlamaTarihi: ISODateString
}

/** Büro geneli gece taraması çalışması (gerçek backend'de zamanlanmış iş) */
export interface TebligatTarama {
  id: string
  baslangic: ISODateString
  bitis: ISODateString
  /** Erişimi tanımlı, taranan mükellef sayısı */
  taranan: number
  /** Girişi başarısız olan mükellef sayısı */
  hatali: number
  /** Kaydedilen yeni tebligat sayısı */
  yeni: number
}

// --- Borç ve levha sorguları (Faz 14) ------------------------------------------------

/** Sorgunun yapıldığı kamu sistemi: GİB (İnteraktif VD) veya SGK (İşveren Sistemi) */
export type KamuKurum = "GIB" | "SGK"

export type SgkErisimDurumu = "AKTIF" | "HATA"

/**
 * Mükellefin SGK İşveren Sistemi erişimi (yalnızca SGK işyeri olanlarda). Backend bu bilgilerle
 * prim borcunu sorgular ve borcu yoktur yazısı ister. Şifreler yalnızca backend'de (KMS ile
 * şifreli) saklanır; istemci ve mock DB son 4 karakteri görür. GİB tarafı ayrı erişim istemez:
 * e-Tebligat için tanımlı İVD erişimi (`TebligatErisim`) kullanılır.
 */
export interface SgkErisim {
  id: string
  mukellefId: string
  kullaniciAdi: string
  isyeriKodu: string
  sistemSifreIpucu: string
  isyeriSifreIpucu: string
  durum: SgkErisimDurumu
  hataMesaji?: string
  /** Son başarılı sorgu */
  sonSorgu?: ISODateString
  /** Şifreler kasadaki SGK kaydından aktarıldıysa (bkz. `TebligatErisim.kasaKaynagi`) */
  kasaKaynagi?: { credentialId: string; credentialGuncelleme: ISODateString }
  tanimlayanId: string
  tanimlamaTarihi: ISODateString
}

/** GİB'den alınan vergi levhası (mükellef + levha yılı başına bir kayıt; PDF arşivde) */
export interface VergiLevhasi {
  id: string
  mukellefId: string
  /** Levhanın ait olduğu hesap dönemi, ör. 2025 */
  yil: number
  vergiTuru: string
  /** Beyan edilen matrah (TL); levhada yoksa boş */
  matrah?: number
  onayKodu: string
  sorguTarihi: ISODateString
  arsivDosyaId: string
}

/** Borç dökümünün bir kalemi. Toplam ve "vadesi geçti" saklanmaz, türetilir. */
export interface BorcKalemi {
  /** Vergi / prim türü metni, ör. "Katma Değer Vergisi", "SGK primi" */
  tur: string
  /** Takvimdeki yükümlülük karşılığı (tahakkuk eşleştirmesi için) */
  yukumlulukTip?: YukumlulukTip
  /** Takvim dönemi: "2026-08" / "2026-Q2" / "2025" */
  donem?: string
  /** yyyy-MM-dd */
  vade: string
  asil: number
  gecikme: number
}

/** Bir mükellefin bir kurumdaki son borç sorgusu. id = `${mukellefId}:${kurum}` */
export interface BorcSorgusu {
  id: string
  mukellefId: string
  kurum: KamuKurum
  kalemler: BorcKalemi[]
  sorguTarihi: ISODateString
  sorgulayanId: string
}

/**
 * `DOGRULAMA_BEKLIYOR`: talep, GİB/SGK girişindeki doğrulama ekranı personelce çözülene kadar
 * gönderilmedi. `TALEP_EDILDI`: kurum yazıyı hazırlıyor. Süresi dolan yazı ayrıca saklanmaz.
 */
export type BorcuYokturDurum =
  "DOGRULAMA_BEKLIYOR" | "TALEP_EDILDI" | "HAZIR" | "BORCU_VAR" | "HATA"

export interface BorcuYokturTalebi {
  id: string
  mukellefId: string
  kurum: KamuKurum
  /** Kurumun verdiği talep numarası (gönderilince) */
  talepNo?: string
  durum: BorcuYokturDurum
  talepEdenId: string
  talepTarihi: ISODateString
  sonucTarihi?: ISODateString
  /** Hazır yazının arşiv kaydı */
  arsivDosyaId?: string
  /** yyyy-MM-dd */
  gecerlilikTarihi?: string
  /** BORCU_VAR / HATA açıklaması */
  aciklama?: string
}

/** Doğrulama çözülünce aynı oturumla çalıştırılacak sorgu adımları */
export type KamuAdim = "VERGI_LEVHASI" | "BORC" | "BORCU_YOKTUR"

/**
 * GİB/SGK girişinde çıkan doğrulama ekranı (CAPTCHA). Otomatik geçilmez: robot durur, kayıt
 * açılır, mükellef sorumlusuna bildirim gider; personel görseldeki kodu uygulamada girer ve
 * bekleyen adımlar aynı oturumla devam eder. Mükellef + kurum başına en çok bir kayıt.
 */
export interface KamuDogrulama {
  id: string
  mukellefId: string
  kurum: KamuKurum
  /** Kurumun doğrulama oturumunun kimliği (backend'de tutulur) */
  oturumId: string
  /** Kısa ömürlü doğrulama görseli; loglanmaz */
  gorselDataUrl: string
  sonGecerlilik: ISODateString
  bekleyenAdimlar: KamuAdim[]
  olusturmaTarihi: ISODateString
}

/** Büro geneli gece borç / levha sorgusu çalışması (gerçek backend'de zamanlanmış iş) */
export interface KamuTarama {
  id: string
  baslangic: ISODateString
  bitis: ISODateString
  /** Sorgulanan mükellef × kurum sayısı */
  sorgulanan: number
  hatali: number
  /** Doğrulama ekranı nedeniyle bekleyen */
  dogrulama: number
  /** Alınan yeni vergi levhası */
  levha: number
}

// --- Gönderim kanalları ------------------------------------------------------------

export type KanalTip = "EPOSTA" | "TELEGRAM" | "WHATSAPP"
export type KanalDurumu = "BAGLI" | "HATA" | "YAPILANDIRILMADI"
/** WhatsApp Business'ta her mesaj türü Meta'da onaylı bir şablona eşlenir */
export type WhatsappSablon = MesajSablonTip | "PERSONEL_HATIRLATMA"

interface KanalAyariTemel {
  /** = tip (büro başına kanal başına bir kayıt) */
  id: KanalTip
  aktif: boolean
  durum: KanalDurumu
  /** Şifre / token'ın son 4 karakteri; kendisi yalnızca backend'de (KMS) */
  gizliIpucu?: string
  sonTest?: ISODateString
  hataMesaji?: string
  guncelleyenId?: string
  guncellemeTarihi?: ISODateString
}

export interface EpostaKanalAyari extends KanalAyariTemel {
  tip: "EPOSTA"
  sunucu: string
  port: number
  guvenlik: "TLS" | "STARTTLS"
  kullanici: string
  gonderenAd: string
  gonderenAdres: string
}

export interface TelegramKanalAyari extends KanalAyariTemel {
  tip: "TELEGRAM"
  /** "@PrimeOfisBot" — personel botla kendi sohbetini bağlar */
  botKullaniciAdi: string
}

/** Meta WhatsApp Cloud API */
export interface WhatsappKanalAyari extends KanalAyariTemel {
  tip: "WHATSAPP"
  telefonNumarasiId: string
  wabaId: string
  /** Mükelleflerin gördüğü numara, ör. "+90 216 345 67 89" */
  gorunenNumara: string
  /** Mesaj türü → onaylı Meta şablon adı */
  sablonlar: Partial<Record<WhatsappSablon, string>>
}

export type KanalAyari =
  EpostaKanalAyari | TelegramKanalAyari | WhatsappKanalAyari

/** Personelin hangi bildirim kategorilerini hangi dış kanaldan alacağı. Uygulama içi her zaman açık. */
export interface BildirimTercihi {
  /** = personelId */
  id: string
  /** Kategori anahtarları `features/bildirim/gorunum.ts → BildirimKategori` */
  kanallar: Partial<Record<string, KanalTip[]>>
  telegramChatId?: string
  /** Botla eşleştirme için tek kullanımlık kod (`/start <kod>`) */
  telegramBaglamaKodu?: string
}

export type GonderimDurumu = "KUYRUKTA" | "GONDERILDI" | "HATA" | "ELLE"
export type GonderimKaynak = "BILDIRIM" | "TALEP" | "TAHAKKUK" | "BORC" | "TEST"

/**
 * Dış kanal gönderim kaydı (outbox). Backend bu kayıtları kuyruktan işler, sonuç ve hatayı yazar.
 * ELLE: kanal yapılandırılmadığı için bağlantı (wa.me / mailto) kullanıcıya açıldı.
 */
export interface Gonderim {
  id: string
  kanal: KanalTip
  aliciTip: "PERSONEL" | "MUKELLEF"
  aliciId: string
  aliciAd: string
  /** Maskeli adres: "ay***@firma.com", "+90 532 *** ** 67", "Telegram sohbeti" */
  adres: string
  konu: string
  ozet: string
  sablon?: WhatsappSablon
  durum: GonderimDurumu
  hataMesaji?: string
  kaynak: GonderimKaynak
  kaynakId?: string
  gonderenId?: string
  denemeSayisi: number
  zaman: ISODateString
}

// ——— Fiş aktarımı (OCR → muhasebe fişi → Luca Excel) ———

export type OkumaTur = "FIS" | "EKSTRE"
export type OkumaDurum = "OKUNUYOR" | "OKUNDU" | "HATA"
export type FisOdeme = "NAKIT" | "KART" | "VERESIYE"

export interface KdvKirilimi {
  /** Yüzde, ör. 20 */
  oran: number
  matrah: number
  kdv: number
}

/** Fiş / fatura görselinden okunan alanlar */
export interface FisOkumasi {
  /** yyyy-MM-dd */
  belgeTarihi: string
  belgeNo: string
  saticiUnvan: string
  saticiVkn?: string
  kdvKirilimi: KdvKirilimi[]
  toplam: number
  odeme: FisOdeme
  /** 0–1; okuyucunun alanlardan emin olma derecesi */
  guven: number
}

export interface EkstreHareketi {
  /** yyyy-MM-dd */
  tarih: string
  aciklama: string
  /** + hesaba giriş, − çıkış */
  tutar: number
}

/** Banka ekstresinden okunan hareketler */
export interface EkstreOkumasi {
  banka: string
  iban?: string
  donemBas: string
  donemSon: string
  hareketler: EkstreHareketi[]
}

/** Onaylanan gelen evrakın okunması. Backend'de Claude ile yapılır (`fis-aktarimi/okuyucu.ts`). */
export interface BelgeOkuma {
  id: string
  gelenId: string
  arsivDosyaId?: string
  mukellefId: string
  tur: OkumaTur
  durum: OkumaDurum
  hataMesaji?: string
  fis?: FisOkumasi
  ekstre?: EkstreOkumasi
  olusturmaTarihi: ISODateString
}

export type FisDurum = "TASLAK" | "ONAYLANDI" | "AKTARILDI"
/** Luca "Belge Türü" kodu: EF e-Fatura, EA e-Arşiv fatura, MF muhasebe fişi */
export type FisBelgeTuru = "EF" | "EA" | "MF"

export interface FisSatiri {
  hesapKodu: string
  aciklama: string
  borc: number
  alacak: number
  /** Karşı hesabı belirleyen anahtar (VKN / ekstre kelimesi); hesap değişince öğrenilir */
  eslemeAnahtari?: string
}

/** Luca'ya aktarılacak mahsup fişi */
export interface MuhasebeFisi {
  id: string
  mukellefId: string
  okumaId: string
  /** Önizleme için kaynak gelen evrak */
  gelenId: string
  arsivDosyaId?: string
  /** yyyy-MM-dd */
  tarih: string
  aciklama: string
  evrakNo?: string
  evrakTarihi?: string
  /** Yoksa MF */
  belgeTuru?: FisBelgeTuru
  satirlar: FisSatiri[]
  durum: FisDurum
  /** Okumadan gelen uyarılar (düşük güven, mükerrer, e-fatura…) */
  uyarilar: string[]
  /** Ekstre 400 satırı aşınca bölünür: "1/2" */
  parca?: string
  aktarimId?: string
  onaylayanId?: string
  onayTarihi?: ISODateString
  olusturmaTarihi: ISODateString
}

export interface HesapEslemesi {
  /** VKN ya da ekstre açıklamasında aranan kelime (büyük harf) */
  anahtar: string
  hesapKodu: string
}

/** Mükellef başına varsayılan hesaplar ve öğrenilen eşlemeler. id = mukellefId */
export interface FisHesapAyari {
  id: string
  gider: string
  /** KDV oranı → hesap, ör. { "20": "191.01.020" } */
  kdv: Record<string, string>
  kasa: string
  banka: string
  satici: string
  eslemeler: HesapEslemesi[]
}

export type LucaSutunAlan =
  | "FIS_NO"
  | "FIS_TARIHI"
  | "FIS_ACIKLAMA"
  | "HESAP_KODU"
  | "EVRAK_NO"
  | "EVRAK_TARIHI"
  | "DETAY_ACIKLAMA"
  | "BORC"
  | "ALACAK"
  | "MIKTAR"
  | "BELGE_TURU"
  | "PARA_BIRIMI"
  | "KUR"
  | "DOVIZ_TUTAR"

export interface LucaSutun {
  alan: LucaSutunAlan
  baslik: string
}

export interface LucaSablonAyari {
  sutunlar: LucaSutun[]
  /** date-fns biçimi, ör. "dd.MM.yyyy" */
  tarihFormati: string
  /** Her dosyada fiş numaraları bundan başlar */
  baslangicFisNo: number
}

/** İndirilen bir Luca Excel dosyası */
export interface LucaAktarim {
  id: string
  mukellefId: string
  fisIdleri: string[]
  dosyaAdi: string
  olusturanId: string
  tarih: ISODateString
  geriAlindi?: boolean
}

// --- Bordro takibi -----------------------------------------------------------------

/**
 * Bir mükellefin bir ayki bordro aşaması. `BEYAN_VERILDI` saklanmaz: MUHSGK beyanı takvimde
 * "Onaylandı" olunca türetilir.
 */
export type BordroDurum =
  | "BEKLENIYOR"
  | "GIRDI_GELDI"
  | "HAZIRLANDI"
  | "MUKELLEFE_GITTI"
  | "BEYAN_VERILDI"

/** Saklanabilen durumlar */
export type BordroSaklananDurum = Exclude<BordroDurum, "BEYAN_VERILDI">

/**
 * Dönem bordrosunun toplamları (TL). Çalışan bazlı satırlar (ad, TCKN, maaş) ne okunur ne saklanır;
 * yalnızca bu toplamlar tutulur.
 */
export interface BordroOzeti {
  calisanSayisi: number
  brutToplam: number
  netToplam: number
  sgkIsciPayi: number
  sgkIsverenPayi: number
  /** İşçi + işveren işsizlik sigortası primi */
  issizlikToplam: number
  gelirVergisi: number
  damgaVergisi: number
}

/**
 * Bir bordro dönemine ait arşiv belgesinin türü. Muhasebe paketinin (Luca…) çıktıları ICMAL,
 * PUSULA, TAHAKKUK; mükelleften gelenler PUANTAJ, IMZALI, DEKONT.
 */
export type BordroBelgeTur =
  "PUANTAJ" | "ICMAL" | "PUSULA" | "TAHAKKUK" | "IMZALI" | "DEKONT"

/**
 * Mükellef × ay bordro kaydı. Yalnızca işlem yapılınca oluşur (kayıt yoksa "Bekleniyor").
 * id = `${mukellefId}:${donem}`; donem "2026-08" (iş ayı; MUHSGK ertesi ayın 26'sında).
 */
export interface BordroDonemi {
  id: string
  mukellefId: string
  donem: string
  durum: BordroSaklananDurum
  /** Puantaj girdisinin geldiği evrak talebi */
  girdiTalepId?: string
  /** Mükellef bu ay puantajda değişiklik olmadığını bildirdi (dosyasız girdi) */
  degisiklikYok?: boolean
  ozet?: BordroOzeti
  not?: string
  guncelleyenId: string
  guncellemeTarihi: ISODateString
}

export type IsHareketiTur = "GIRIS" | "CIKIS"
export type IsHareketiDurum = "BEKLIYOR" | "BILDIRILDI"

/** SGK işe giriş / işten çıkış bildirimi takibi. Kimlik numarası tutulmaz. */
export interface IsHareketi {
  id: string
  mukellefId: string
  tur: IsHareketiTur
  /** yyyy-MM-dd: işe başlama veya işten ayrılma günü */
  tarih: string
  /** Ad soyad (serbest metin) */
  kisi: string
  durum: IsHareketiDurum
  bildirimTarihi?: ISODateString
  /** Bildirgenin arşivdeki kaydı */
  belgeArsivId?: string
  olusturanId: string
  olusturmaTarihi: ISODateString
}
