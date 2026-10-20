/**
 * e-Belge entegratör sözleşmesi — **backend** tarafından uygulanır.
 *
 * Tek uygulama **Luca portalı**: büro kontörü Luca'dan alır, mükelleflerin e-Fatura / e-Arşiv /
 * e-Defter işleri Luca'da yürür. Uygulama büronun tek Luca kullanıcısıyla portal oturumu açar
 * (`luca-portal.ts`) ve her mükellefi bu hesaptaki bir firmaya eşler (`lucaFirmaId`). Salt
 * okunur: ticari kabul / red ve fatura kesme Luca'da yapılır.
 *
 * Frontend entegratörü doğrudan çağırmaz: yalnızca `/api/e-belge/*` ve `/api/luca-hesap` uçlarını
 * bilir. Backend yanıtları aşağıdaki normalize tiplere çevirir ve kendi veritabanına senkronize
 * eder. Geliştirmede MSW handler'ları aynı davranışı mock portalla taklit eder.
 */
import type {
  BeratDurumu,
  EBelge,
  EBelgeTur,
  EBelgeYon,
} from "../types/domain"
import type { EBelgeKalem } from "../types/api"

export interface EntegratorKimlik {
  mukellefId: string
  /** Büro Luca hesabındaki firma */
  lucaFirmaId?: string
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
  /** e-Defter berat durumları */
  beratDurumlari(
    kimlik: EntegratorKimlik,
    yil: string
  ): Promise<EntegratorBerat[]>
}
