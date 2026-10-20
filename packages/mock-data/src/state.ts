/** Mock veritabanının tüm koleksiyonları (client MSW ve api seed ortak). */
import type {
  AktiviteLog,
  ArsivDosya,
  Bildirim,
  BordroDonemi,
  EBelge,
  EDefterBerat,
  EvrakTalebi,
  GelenEvrak,
  Gorev,
  IsHareketi,
  Buro,
  Credential,
  KasaMeta,
  KontorAlim,
  Mizan,
  Mukellef,
  EntegratorBaglanti,
  Personel,
  PersonelKimlik,
  TakvimDurumKaydi,
  Tahakkuk,
  CariHareket,
  KesintiIceAktarim,
  KesintiKaydi,
  Tebligat,
  TebligatErisim,
  TebligatTarama,
  BildirimTercihi,
  Gonderim,
  KanalAyari,
  BelgeOkuma,
  MuhasebeFisi,
  FisHesapAyari,
  LucaAktarim,
  LucaHesapKaydi,
  SgkErisim,
  VergiLevhasi,
  BorcSorgusu,
  BorcuYokturTalebi,
  KamuDogrulama,
  KamuTarama,
} from "@prime/shared/types/domain"

export interface DbState {
  buro: Buro[]
  personel: Personel[]
  /** Personel giriş şifresi özetleri (id = personelId); API yanıtlarına eklenmez */
  kimlik: PersonelKimlik[]
  mukellef: Mukellef[]
  aktivite: AktiviteLog[]
  /** Şifreli kasa kayıtları. Seed'de boştur; ilk kasa isteğinde `ensureVault()` doldurur. */
  credential: Credential[]
  kasa: KasaMeta[]
  /** Beyan durumları; takvim olaylarının kendisi kural motoruyla hesaplanır */
  takvim: TakvimDurumKaydi[]
  /** Arşiv dosyalarının meta verisi; içerik `blob-store` (IndexedDB) içinde */
  arsiv: ArsivDosya[]
  /** Magic link evrak talepleri */
  talep: EvrakTalebi[]
  /** Portaldan gelen dosyalar (meta); içerik `blob-store` içinde */
  gelen: GelenEvrak[]
  /** Büro içi görevler */
  gorev: Gorev[]
  /** Mükellef başına Luca bağlantısı (web servis anahtarı burada da tutulmaz) */
  baglanti: EntegratorBaglanti[]
  /** Luca'dan senkronize edilen e-Fatura / e-Arşiv başlıkları */
  ebelge: EBelge[]
  /** e-Defter berat durumları */
  berat: EDefterBerat[]
  /** Büronun Luca kontör alımları (tüketim e-belgelerden hesaplanır) */
  kontor: KontorAlim[]
  /** İçe aktarılan tahakkuk fişleri */
  tahakkuk: Tahakkuk[]
  /** İçe aktarılan mizanlar */
  mizan: Mizan[]
  /** Uygulama içi bildirimler (aktivite ve hatırlatmalardan üretilir) */
  bildirim: Bildirim[]
  /** Büronun mükelleflerle cari hesabı (ücret borçları, tahsilatlar) */
  cari: CariHareket[]
  /** İVD kesinti listesi içe aktarımları (yıl başına bir kayıt) */
  kesintiAktarim: KesintiIceAktarim[]
  kesinti: KesintiKaydi[]
  /** e-Tebligat kayıtları (gece GİB taramasından veya elle) */
  tebligat: Tebligat[]
  /** Mükellef başına GİB e-Tebligat erişimi (şifre burada da tutulmaz) */
  tebligatErisim: TebligatErisim[]
  /** Gece taraması çalışmaları (en yeni 30) */
  tebligatTarama: TebligatTarama[]
  /** Büronun dış gönderim kanalları (gizli alanlar burada da tutulmaz) */
  kanal: KanalAyari[]
  /** Personel bildirim kanal tercihleri (id = personelId) */
  bildirimTercihi: BildirimTercihi[]
  /** Dış kanal gönderim kayıtları (outbox) */
  gonderim: Gonderim[]
  /** Onaylanan fiş / ekstrelerin okunması */
  okuma: BelgeOkuma[]
  /** Okumadan üretilen muhasebe fişleri (Luca'ya aktarılır) */
  fis: MuhasebeFisi[]
  /** Mükellef başına varsayılan hesaplar ve öğrenilen eşlemeler (id = mukellefId) */
  fisHesapAyari: FisHesapAyari[]
  /** İndirilen Luca Excel dosyaları */
  lucaAktarim: LucaAktarim[]
  /** Büronun Luca portal kullanıcısı (0 ya da 1 kayıt, id `buro`) */
  lucaHesap: LucaHesapKaydi[]
  /** Mükellef × ay bordro kayıtları (yalnızca işlem yapılanlar; id = `${mukellefId}:${donem}`) */
  bordro: BordroDonemi[]
  /** İşe giriş / çıkış bildirim takibi */
  isHareketi: IsHareketi[]
  /** Mükellef başına SGK İşveren Sistemi erişimi (şifreler burada da tutulmaz) */
  sgkErisim: SgkErisim[]
  /** GİB'den alınan vergi levhaları (PDF arşivde) */
  vergiLevhasi: VergiLevhasi[]
  /** Mükellef × kurum son borç sorgusu (id = `${mukellefId}:${kurum}`) */
  borcSorgusu: BorcSorgusu[]
  borcuYoktur: BorcuYokturTalebi[]
  /** Personelin çözmesini bekleyen GİB / SGK doğrulama ekranları */
  kamuDogrulama: KamuDogrulama[]
  /** Gece borç / levha sorgusu çalışmaları (en yeni 30) */
  kamuTarama: KamuTarama[]
}
