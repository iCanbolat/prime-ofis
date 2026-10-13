/**
 * e-Belge istek doğrulamaları — mock handler ve api aynı mesajları döner. Hata metni ya da null.
 */
import type {
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  EntegratorOrtam,
  GibDurumu,
} from "../types/domain"

export const EBELGE_TURLERI: EBelgeTur[] = ["E_FATURA", "E_ARSIV"]
export const EBELGE_YONLERI: EBelgeYon[] = ["GELEN", "GIDEN"]
export const GIB_DURUMLARI: GibDurumu[] = ["BASARILI", "ISLENIYOR", "HATA", "IPTAL"]
export const YANIT_DURUMLARI: EFaturaYanit[] = ["BEKLIYOR", "KABUL", "RED", "SURESI_DOLDU"]
export const ENTEGRATOR_ORTAMLARI: EntegratorOrtam[] = ["TEST", "CANLI"]
export const EBELGE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/
export const EBELGE_DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const nesne = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>

/** `PUT /e-belge/baglantilar/:mukellefId` */
export function baglantiHatasi(body: unknown): string | null {
  const b = nesne(body)
  const anahtar = typeof b.apiAnahtari === "string" ? b.apiAnahtari.trim() : ""
  if (!anahtar) return "Web servis anahtarı zorunludur"
  if (!ENTEGRATOR_ORTAMLARI.includes(b.ortam as EntegratorOrtam)) return "Geçersiz ortam"
  return null
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

/** `POST /e-belge/faturalar/:id/yanit` gövdesi (fatura kontrollerinden sonra) */
export function yanitHatasi(body: unknown): string | null {
  const b = nesne(body)
  if (b.karar !== "KABUL" && b.karar !== "RED") return "Geçersiz karar"
  const neden = typeof b.neden === "string" ? b.neden.trim() : ""
  if (b.karar === "RED" && !neden) return "Red nedeni zorunludur"
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
