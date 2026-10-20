/**
 * GİB e-Tebligat sözleşmesi — **backend** tarafından uygulanır (zamanlanmış gece işi).
 *
 * Mükelleflerin bildirim e-postası ayarıyla uğraşmaması için backend her gece (≈ 03:00) erişimi
 * tanımlı her mükellef adına GİB e-Tebligat kutusuna giriş yapar, son başarılı taramadan sonra
 * düşen belgeleri listeler ve `/api/tebligat` kayıtlarına işler; personel sabah işe geldiğinde
 * tebligatlar, süreleri ve bildirimleri hazırdır. Frontend GİB'e erişmez; yalnızca
 * `/api/tebligat/*` ve `/api/kamu-dogrulama` uçlarını bilir. Geliştirmede MSW handler'ları bu
 * arayüzün mock uygulamasını (`@prime/mock-data/gib-tebligat`) kullanır.
 *
 * Kurallar:
 * - Giriş, borç / levha sorgularıyla aynı İnteraktif VD oturumudur: `KamuSorguAdapter.giris`
 *   (`kurum: "GIB"`) açar, bu adaptör yalnızca açık oturumla kutuyu okur.
 * - **Doğrulama ekranı (CAPTCHA) otomatik geçilmez.** Giriş `DOGRULAMA` dönerse gece işi o
 *   mükellefi atlar, `KamuDogrulama` kaydı (`TEBLIGAT` adımı) açılır; personel kodu girince tarama
 *   aynı oturumla sürer.
 * - Şifre yalnızca backend'de (şifreli) tutulur; yanıtlarda dönmez.
 * - Kutu salt okunur gezilir: belge silinmez, mükellef adına işlem yapılmaz.
 * - Girişi başarısız olan mükellef, hesap kilitlenmesin diye şifre güncellenene kadar gece
 *   denenmez; personel elle "Yeniden dene" ile tek deneme yapabilir.
 * - Tebliğ tarihi belgenin açılmasına değil ulaşma tarihine bağlıdır (ulaşmayı izleyen 5. gün).
 */
import type { KamuOturum } from "../borc/kamu-adapter"
import type { TebligatKurum } from "../types/domain"

/** e-Tebligat kutusundaki bir belgenin liste satırı */
export interface GibTebligatBelgesi {
  /** GİB'deki belge kimliği — tekrar kaydı önler */
  belgeId: string
  /** Gönderen idare (ör. vergi dairesi); SGK belgeleri ayrı sistemdedir */
  kurum: TebligatKurum
  /** GİB'in belge türü metni, ör. "Ödeme Emri" — `tebligatTuru` ile sınıflanır */
  belgeTuru: string
  konu: string
  belgeNo?: string
  /** Belgenin elektronik adrese ulaştığı an (ISO) */
  ulasmaTarihi: string
}

export type GibTaramaSonucu =
  | { gecerli: true; belgeler: GibTebligatBelgesi[] }
  /** Oturum açıkken kutu okunamadı (ör. şifre süresi doldu); erişim HATA'ya düşer */
  | { gecerli: false; hataMesaji: string }

export interface GibTebligatAdapter {
  /** `sonrasi` anından sonra ulaşan belgeler, eskiden yeniye */
  yeniBelgeler(
    oturum: KamuOturum,
    sonrasi: string | undefined
  ): Promise<GibTaramaSonucu>
}
