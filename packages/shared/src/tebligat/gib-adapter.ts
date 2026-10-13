/**
 * GİB e-Tebligat sözleşmesi — **backend** tarafından uygulanır (zamanlanmış gece işi).
 *
 * Mükelleflerin bildirim e-postası ayarıyla uğraşmaması için backend her gece (≈ 03:00) erişimi
 * tanımlı her mükellef adına GİB e-Tebligat kutusuna giriş yapar, son başarılı taramadan sonra
 * düşen belgeleri listeler ve `/api/tebligat` kayıtlarına işler; personel sabah işe geldiğinde
 * tebligatlar, süreleri ve bildirimleri hazırdır. Frontend GİB'e erişmez; yalnızca
 * `/api/tebligat/*` uçlarını bilir. Geliştirmede MSW handler'ları bu arayüzün mock uygulamasını
 * (`mocks/gib/mock-adapter.ts`) kullanır.
 *
 * Kurallar:
 * - Şifre yalnızca backend'de (KMS ile şifreli) tutulur; yanıtlarda dönmez.
 * - Kutu salt okunur gezilir: belge silinmez, mükellef adına işlem yapılmaz.
 * - Girişi başarısız olan mükellef, hesap kilitlenmesin diye şifre güncellenene kadar gece
 *   denenmez; personel elle "Yeniden dene" ile tek deneme yapabilir.
 * - Tebliğ tarihi belgenin açılmasına değil ulaşma tarihine bağlıdır (ulaşmayı izleyen 5. gün).
 */
import type { TebligatKurum } from "../types/domain"

export interface GibKimlik {
  kullaniciKodu: string
  /** Yalnızca backend'de çözülür */
  sifre: string
}

export interface GibGirisSonucu {
  gecerli: boolean
  hataMesaji?: string
}

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
  | { gecerli: false; hataMesaji: string }

export interface GibTebligatAdapter {
  girisDogrula(kimlik: GibKimlik): Promise<GibGirisSonucu>
  /** `sonrasi` anından sonra ulaşan belgeler, eskiden yeniye */
  yeniBelgeler(
    kimlik: GibKimlik,
    sonrasi: string | undefined
  ): Promise<GibTaramaSonucu>
}
