/**
 * e-Belge istek doğrulamaları — mock handler ve api aynı mesajları döner. Hata metni ya da null.
 */
import type {
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  GibDurumu,
} from "../types/domain"

export const EBELGE_TURLERI: EBelgeTur[] = ["E_FATURA", "E_ARSIV"]
export const EBELGE_YONLERI: EBelgeYon[] = ["GELEN", "GIDEN"]
export const GIB_DURUMLARI: GibDurumu[] = ["BASARILI", "ISLENIYOR", "HATA", "IPTAL"]
export const YANIT_DURUMLARI: EFaturaYanit[] = ["BEKLIYOR", "KABUL", "RED", "SURESI_DOLDU"]
export const EBELGE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/
export const EBELGE_DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const nesne = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>

/** `PUT /e-belge/baglantilar/:mukellefId` */
export function baglantiHatasi(body: unknown): string | null {
  const firma = nesne(body).lucaFirmaId
  return typeof firma === "string" && firma.trim() ? null : "Luca firması seçilmelidir"
}

/** `GET /e-belge/faturalar` filtreleri (boş değerler filtre değildir) */
export function faturaFiltreHatasi(p: {
  tur?: string | null
  yon?: string | null
  gibDurumu?: string | null
  yanit?: string | null
  baslangic?: string | null
  bitis?: string | null
}): string | null {
  if (p.tur && !EBELGE_TURLERI.includes(p.tur as EBelgeTur)) return "Geçersiz tür"
  if (p.yon && !EBELGE_YONLERI.includes(p.yon as EBelgeYon)) return "Geçersiz yön"
  if (p.gibDurumu && !GIB_DURUMLARI.includes(p.gibDurumu as GibDurumu))
    return "Geçersiz GİB durumu"
  if (p.yanit && !YANIT_DURUMLARI.includes(p.yanit as EFaturaYanit))
    return "Geçersiz yanıt durumu"
  if ((p.baslangic && !EBELGE_YMD_RE.test(p.baslangic)) || (p.bitis && !EBELGE_YMD_RE.test(p.bitis)))
    return "Geçersiz tarih"
  return null
}

/** `POST /e-belge/kontor/alimlar` */
export function kontorAlimHatasi(body: unknown, bugunYmd: string): string | null {
  const b = nesne(body)
  const tamSayi = (n: unknown, min: number) => Number.isInteger(n) && (n as number) >= min
  if (typeof b.tarih !== "string" || !EBELGE_YMD_RE.test(b.tarih) || b.tarih > bugunYmd)
    return "Geçersiz tarih"
  if (!tamSayi(b.paketAdet, 1) || !tamSayi(b.hediyeAdet, 0)) return "Kontör adedi geçersiz"
  if (typeof b.tutar !== "number" || !Number.isFinite(b.tutar) || !(b.tutar >= 0))
    return "Tutar geçersiz"
  if (b.not !== undefined && b.not !== null && typeof b.not !== "string") return "Not geçersiz"
  return null
}

export const LUCA_KULLANICI_SINIRI = 64
export const LUCA_SIFRE_SINIRI = 128

/** `PUT /luca-hesap`. `mevcutKullanici`: kayıtlı hesap varsa kullanıcı adı (şifre boş geçilebilir) */
export function lucaHesapHatasi(body: unknown, mevcutKullanici?: string): string | null {
  const b = nesne(body)
  const kullanici = typeof b.kullanici === "string" ? b.kullanici.trim() : ""
  const sifre = typeof b.sifre === "string" ? b.sifre : ""
  if (!kullanici) return "Luca kullanıcı adı zorunludur"
  if (kullanici.length > LUCA_KULLANICI_SINIRI) return "Luca kullanıcı adı çok uzun"
  if (sifre.length > LUCA_SIFRE_SINIRI) return "Luca şifresi çok uzun"
  if (!sifre && kullanici !== mevcutKullanici) return "Luca şifresi zorunludur"
  return null
}

/** `POST /luca-dogrulama` */
export function lucaDogrulamaHatasi(body: unknown): string | null {
  const kod = nesne(body).kod
  if (typeof kod !== "string" || !kod.trim()) return "Doğrulama kodu zorunludur"
  if (kod.trim().length > 16) return "Doğrulama kodu çok uzun"
  return null
}

/** `POST /luca-hesap/firmalar/aktar` */
export function lucaAktarimHatasi(body: unknown): string | null {
  const b = nesne(body)
  if (
    !Array.isArray(b.firmaIdler) ||
    b.firmaIdler.length === 0 ||
    !b.firmaIdler.every((f) => typeof f === "string" && f.trim())
  )
    return "Aktarılacak firma seçilmelidir"
  if (b.firmaIdler.length > 500) return "Tek seferde en çok 500 firma aktarılabilir"
  if (typeof b.sorumluPersonelId !== "string" || !b.sorumluPersonelId)
    return "Sorumlu personel seçilmelidir"
  return null
}
