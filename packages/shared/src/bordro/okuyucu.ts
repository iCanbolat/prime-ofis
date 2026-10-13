/**
 * Bordro özeti okuyucu sözleşmesi — **backend** tarafından uygulanır.
 *
 * PDF biçimindeki bordro dökümü (Luca, Zirve, Logo… çıktısı ya da taranmış bordro) Claude'a (görsel
 * + PDF girdisi) verilir ve aşağıdaki `BordroOzeti` şemasıyla yapılandırılmış çıktı istenir. Excel
 * / CSV dosyaları modele gönderilmez; istemci `bordro-oku.ts` ile tabloyu kendisi toplar.
 *
 * Kurallar:
 * - Dosyalar yalnızca backend'den gönderilir; istemci model API'sine erişmez (KVKK: bordro
 *   çalışanların maaş bilgisini içerir; yurt dışı işleyiciye aktarım aydınlatma metninde belirtilmeli).
 * - Model yalnızca dönem toplamlarını döndürür; çalışan adı, TCKN, IBAN ve satır bazlı tutarlar
 *   yanıta da loglara da yazılmaz.
 * - Emin olmadığı alanı 0 bırakır ve `guven` düşük döner; tahmin ettiği tutarı yazmaz.
 * - Tutarlar TL, nokta ondalıklı sayı. Okuma sonucu personel onayından geçmeden saklanmaz.
 */
import type { BordroOzeti } from "../types/domain"

export interface BordroOkunacakDosya {
  ad: string
  mimeType: string
  /** Backend'de dosya deposundaki anahtar; mock'ta data URL */
  icerik: string
}

export interface BordroOkumaSonucu {
  ozet: BordroOzeti
  /** 0–1 */
  guven: number
}

export class BordroOkuyucuHatasi extends Error {}

export interface BordroOkuyucu {
  /** Okunamayan (bulanık, bordro olmayan, desteklenmeyen) belgede `BordroOkuyucuHatasi` fırlatır. */
  oku(dosya: BordroOkunacakDosya): Promise<BordroOkumaSonucu>
}
