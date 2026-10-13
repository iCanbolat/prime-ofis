import type {
  BorcKapsam,
  BorcuYokturGorunum,
  KamuErisimDurumu,
} from "../types/api"
import type { KamuAdim, KamuKurum } from "../types/domain"

export const BORC_SAYFA_BOYUTU = 20

/**
 * Levhanın GİB'de oluştuğu varsayılan gün (MM-dd). Yıllık beyanlar Mart / Nisan'da verilir;
 * bu günden sonra geçen yılın levhası beklenir. **Mevzuata göre doğrulanmalı.**
 */
export const LEVHA_YAYIN_GUNU = "05-31"

/**
 * Borcu yoktur yazısının geçerlilik süresi (gün). Kurum ve kullanım yerine göre değişebilir;
 * **mevzuata göre doğrulanmalı**, değişirse yalnızca burası güncellenir.
 */
export const BORCU_YOKTUR_GECERLILIK_GUN = 30

/** Doğrulama görselinin geçerlilik süresi (dakika); dolunca yeni görsel istenir */
export const DOGRULAMA_GECERLILIK_DK = 5

export const KAMU_KURUM_ETIKET: Record<KamuKurum, string> = {
  GIB: "GİB",
  SGK: "SGK",
}

/** Kurum adının ayrılma / bulunma ekli hali ("SGK'dan", "GİB'de") */
export const KURUM_EKLI: Record<KamuKurum, { den: string; de: string }> = {
  GIB: { den: "GİB'den", de: "GİB'de" },
  SGK: { den: "SGK'dan", de: "SGK'da" },
}

export const BORC_KURUM_BASLIK: Record<KamuKurum, string> = {
  GIB: "Vergi borcu",
  SGK: "SGK prim borcu",
}

export const ERISIM_DURUM_ETIKET: Record<KamuErisimDurumu, string> = {
  AKTIF: "Erişim tanımlı",
  HATA: "Giriş başarısız",
  TANIMSIZ: "Erişim yok",
  DOGRULAMA: "Doğrulama bekliyor",
}

export const BORC_KAPSAM_ETIKET: Record<BorcKapsam, string> = {
  vadesiGecmis: "Vadesi geçmiş",
  borclu: "Borcu olan",
  sorgulanmadi: "Sorgulanmamış",
}

export const BORCU_YOKTUR_ETIKET: Record<BorcuYokturGorunum, string> = {
  DOGRULAMA_BEKLIYOR: "Doğrulama bekliyor",
  TALEP_EDILDI: "Hazırlanıyor",
  HAZIR: "Hazır",
  BORCU_VAR: "Borcu var",
  HATA: "Hata",
  SURESI_DOLDU: "Süresi doldu",
}

export const KAMU_ADIM_ETIKET: Record<KamuAdim, string> = {
  VERGI_LEVHASI: "Vergi levhası",
  BORC: "Borç sorgusu",
  BORCU_YOKTUR: "Borcu yoktur yazısı",
}

/** SGK sorgularının şifre kasasındaki karşılığı: SGK İşveren Sistemi (sistem + işyeri şifresi) */
export const SGK_KASA_SISTEMI = "SGK" as const

export const levhaArsivYolu = (mukellefId: string) =>
  `/arsiv?mukellef=${mukellefId}&kategori=VERGI_LEVHASI`
