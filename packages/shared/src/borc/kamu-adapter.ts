/**
 * GİB / SGK sorgu sözleşmesi — **backend** tarafından uygulanır (zamanlanmış gece işi ve personelin
 * anlık sorguları). Frontend GİB'e / SGK'ya erişmez; yalnızca `/api/borc`, `/api/vergi-levhasi`,
 * `/api/borcu-yoktur`, `/api/sgk-erisim`, `/api/kamu-dogrulama` uçlarını bilir. Geliştirmede MSW
 * handler'ları bu arayüzün mock uygulamasını (`mocks/kamu/mock-adapter.ts`) kullanır.
 *
 * Kurallar:
 * - **Doğrulama ekranı (CAPTCHA) otomatik geçilmez.** Çözücü servis, görüntü tanıma ya da tarayıcı
 *   gizleme kullanılmaz. Giriş doğrulama isterse `DOGRULAMA` döner; backend görseli personele
 *   gösterir, personelin girdiği kodla `giris(kimlik, { oturumId, kod })` çağrılır.
 * - Salt okunur: tek istisna personelin tetiklediği borcu yoktur talebidir.
 * - GİB tarafı e-Tebligat ile aynı İVD oturumunu paylaşır (gece mükellef başına tek giriş:
 *   tebligat → levha → borç). İstekler mükellefler arasında yayılır.
 * - Girişi başarısız olan erişim, hesap kilitlenmesin diye şifre güncellenene kadar denenmez.
 * - Şifreler yalnızca backend'de (KMS ile şifreli) tutulur; doğrulama görseli kısa ömürlüdür ve
 *   loglanmaz.
 */
import type { BorcKalemi, KamuKurum } from "../types/domain"

export type KamuKimlik =
  | { kurum: "GIB"; kullaniciKodu: string; sifre: string }
  | {
      kurum: "SGK"
      kullaniciAdi: string
      isyeriKodu: string
      sistemSifre: string
      isyeriSifre: string
    }

/** Kurumdaki açık oturum (backend'de çerez / token); istemciye çıkmaz */
export interface KamuOturum {
  kurum: KamuKurum
  oturumId: string
}

export type KamuGirisSonucu =
  | { durum: "TAMAM"; oturum: KamuOturum }
  | { durum: "HATA"; hataMesaji: string }
  | {
      durum: "DOGRULAMA"
      /** Kurumun doğrulama oturumu; kodla birlikte geri verilir */
      oturumId: string
      gorselDataUrl: string
    }

export interface KamuLevha {
  yil: number
  vergiTuru: string
  matrah?: number
  onayKodu: string
  pdfDataUrl: string
}

export type BorcuYokturSonucu =
  | { durum: "BEKLIYOR" }
  | { durum: "HAZIR"; pdfDataUrl: string }
  | { durum: "BORCU_VAR"; aciklama: string }

export interface KamuSorguAdapter {
  giris(
    kimlik: KamuKimlik,
    dogrulama?: { oturumId: string; kod: string }
  ): Promise<KamuGirisSonucu>
  /** Yeni doğrulama görseli (öncekinin süresi dolunca) */
  dogrulamaYenile(
    kimlik: KamuKimlik
  ): Promise<{ oturumId: string; gorselDataUrl: string }>
  /** Yalnızca GİB; levha henüz oluşmadıysa null */
  vergiLevhasi(oturum: KamuOturum, yil: number): Promise<KamuLevha | null>
  /** Ödenmemiş borç kalemleri (GİB: vergi borcu, SGK: prim borcu) */
  borclar(oturum: KamuOturum): Promise<BorcKalemi[]>
  borcuYokturTalep(oturum: KamuOturum): Promise<{ talepNo: string }>
  borcuYokturSonuc(
    oturum: KamuOturum,
    talepNo: string
  ): Promise<BorcuYokturSonucu>
}
