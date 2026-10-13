/**
 * Belge okuyucu sözleşmesi — **backend** tarafından uygulanır.
 *
 * Gerçek uygulama Claude (görsel + PDF girdisi) ile çalışır: fiş / fatura fotoğrafı ya da ekstre
 * PDF'i, aşağıdaki tiplerin JSON şemasıyla birlikte gönderilir ve yapılandırılmış çıktı istenir.
 * Excel / CSV ekstreler modele gönderilmez; backend tabloyu doğrudan okur.
 *
 * Frontend okuyucuyu doğrudan çağırmaz: gelen evrak onaylanınca backend okumayı kuyruğa alır,
 * sonucu `BelgeOkuma` olarak yazar ve fiş taslağını üretir (`kurallar.ts`). Geliştirmede MSW
 * handler'ları `mocks/okuyucu/mock-okuyucu.ts` ile aynı sözleşmeyi taklit eder.
 *
 * Kurallar:
 * - Dosyalar yalnızca backend'den gönderilir; istemci model API'sine erişmez (KVKK: mükellef
 *   belgeleri yurt dışı işleyiciye aktarım aydınlatma metninde belirtilmeli).
 * - Model emin olmadığı alanı boş bırakır ve `guven` düşük döner; tahmin ettiği tutarı yazmaz.
 * - Tutarlar TL, nokta ondalıklı sayı; tarihler yyyy-MM-dd.
 * - Okuma sonucu doğrulanmadan muhasebeleşmez: taslak her zaman personel onayından geçer.
 */
import type { EkstreOkumasi, FisOkumasi, OkumaTur } from "../types/domain"

export interface OkunacakDosya {
  ad: string
  mimeType: string
  /** Backend'de dosya deposundaki anahtar; mock'ta data URL */
  icerik: string
}

export type OkumaSonucu =
  { tur: "FIS"; fis: FisOkumasi } | { tur: "EKSTRE"; ekstre: EkstreOkumasi }

export class OkumaHatasi extends Error {}

export interface BelgeOkuyucu {
  /** Okunamayan (bulanık, eksik, desteklenmeyen) belgede `OkumaHatasi` fırlatır. */
  oku(dosya: OkunacakDosya, tur: OkumaTur): Promise<OkumaSonucu>
}
