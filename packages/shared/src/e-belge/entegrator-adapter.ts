/**
 * e-Belge entegratör sözleşmesi — **backend** tarafından uygulanır.
 *
 * Varsayılan ve tek gerçek uygulama **TÜRMOB-Luca e-Entegratör**: büro kontörü Luca'dan alır ve
 * mükelleflerin e-Fatura / e-Arşiv / e-Defter işlerini Luca üzerinden yürütür. Arayüz sağlayıcıdan
 * bağımsız tutulur; başka entegratörle çalışmak zorunda kalan istisna mükellef için ikinci bir
 * adaptör eklenebilir.
 *
 * Frontend entegratörü doğrudan çağırmaz: yalnızca `/api/e-belge/*` uçlarını bilir. Backend her
 * mükellef için bu arayüzün bir örneğini (şifreli saklanan web servis anahtarıyla) kurar,
 * yanıtları aşağıdaki normalize tiplere çevirir ve kendi veritabanına senkronize eder.
 * Geliştirmede MSW handler'ları (`mocks/handlers/e-belge.ts`) aynı arayüzün mock uygulamasını
 * (`mocks/entegrator/mock-adapter.ts`) kullanır; gerçek backend geldiğinde frontend değişmez.
 *
 * Kurallar:
 * - Anahtar yalnızca backend'de (KMS ile şifreli) tutulur; istemciye hiçbir yanıtta dönmez.
 * - Luca web servis dokümanı herkese açık değildir; uç noktalar ve alan adları Luca'dan alınan
 *   dokümana göre eşlenir. Buradaki tipler uygulamanın ihtiyaç duyduğu normalize görünümdür.
 */
import type {
  BeratDurumu,
  EBelge,
  EBelgeTur,
  EBelgeYon,
  EntegratorOrtam,
} from "../types/domain"
import type { EBelgeKalem } from "../types/api"

export interface EntegratorKimlik {
  mukellefId: string
  /** Yalnızca backend'de çözülür */
  apiAnahtari: string
  ortam: EntegratorOrtam
}

export interface BaglantiDogrulamaSonucu {
  gecerli: boolean
  hataMesaji?: string
  /** Hesapta açık servisler (GİB kayıtlı kullanıcı sorgusu) */
  eFatura: boolean
  eArsiv: boolean
  eDefter: boolean
  postaKutusu?: string
}

/** Entegratörden gelen fatura başlığı (uygulamanın id / arşiv alanları hariç). */
export type EntegratorFatura = Omit<
  EBelge,
  | "id"
  | "mukellefId"
  | "yanit"
  | "redNedeni"
  | "yanitlayanId"
  | "yanitTarihi"
  | "arsivDosyaId"
> & {
  /** Gelen ticari faturada alıcının yanıtı; Luca tarafında verilmişse */
  yanit?: "BEKLIYOR" | "KABUL" | "RED"
}

export interface FaturaSorgusu {
  tur: EBelgeTur
  yon: EBelgeYon
  /** Bu andan sonra oluşan / durumu değişen faturalar (artımlı senkron) */
  sonra?: string
}

export interface EntegratorBerat {
  /** "2026-06" */
  donem: string
  durum: BeratDurumu
  yuklemeTarihi?: string
  onayTarihi?: string
  hataMesaji?: string
}

export interface EntegratorAdapter {
  /** Anahtarı doğrular ve hesabın servis bilgilerini döner. */
  baglantiDogrula(kimlik: EntegratorKimlik): Promise<BaglantiDogrulamaSonucu>
  /** Artımlı fatura senkronu: yeni ve durumu değişen faturalar. */
  faturalariGetir(
    kimlik: EntegratorKimlik,
    sorgu: FaturaSorgusu
  ): Promise<EntegratorFatura[]>
  /** Fatura kalemleri (başlıkla birlikte saklanmaz, detayda istenir). */
  faturaKalemleri(
    kimlik: EntegratorKimlik,
    ettn: string
  ): Promise<EBelgeKalem[]>
  /** Fatura görüntüsü: PDF (base64 data URL) veya UBL XML */
  faturaIcerik(
    kimlik: EntegratorKimlik,
    ettn: string,
    format: "PDF" | "XML"
  ): Promise<string>
  /** Gelen ticari faturaya uygulama yanıtı (kabul / red). */
  ticariYanitGonder(
    kimlik: EntegratorKimlik,
    ettn: string,
    karar: "KABUL" | "RED",
    neden?: string
  ): Promise<void>
  /** e-Defter berat durumları */
  beratDurumlari(
    kimlik: EntegratorKimlik,
    yil: string
  ): Promise<EntegratorBerat[]>
}
