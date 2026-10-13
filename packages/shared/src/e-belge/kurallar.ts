/**
 * e-Belge kuralları — saf fonksiyonlar (UI ve mock sunucu ortak kullanır).
 */
import { addDays, differenceInCalendarDays, parseISO } from "date-fns"

import type { EBelge, EFaturaYanit } from "../types/domain"

/** Ticari faturada alıcının kabul / red için yasal süresi (gün) */
export const YANIT_SURESI_GUN = 8
/** Bu kadar gün (veya daha az) kalınca "süresi yaklaşıyor" sayılır */
export const YANIT_UYARI_GUN = 2

/** Saklanan kayıt veya zaten türetilmiş görünüm (EBelgeView) kabul edilir */
type YanitAlanlari = Pick<EBelge, "yon" | "senaryo" | "alinmaTarihi"> & {
  yanit?: EFaturaYanit
}

export function yanitSonTarihi(alinmaTarihi: string): Date {
  return addDays(parseISO(alinmaTarihi), YANIT_SURESI_GUN)
}

/** Yanıt süresinin bitmesine kalan takvim günü (0 = bugün son gün, negatif = doldu) */
export function yanitKalanGun(
  alinmaTarihi: string,
  simdi = new Date()
): number {
  return differenceInCalendarDays(yanitSonTarihi(alinmaTarihi), simdi)
}

/** Saklanan yanıttan görünen durumu türetir; süresi geçmiş BEKLIYOR → SURESI_DOLDU. */
export function yanitDurumu(
  e: YanitAlanlari,
  simdi = new Date()
): EFaturaYanit | undefined {
  if (!e.yanit) return undefined
  if (e.yanit === "BEKLIYOR" && simdi > yanitSonTarihi(e.alinmaTarihi))
    return "SURESI_DOLDU"
  return e.yanit
}

/** Yalnızca süresi dolmamış, yanıt bekleyen gelen ticari fatura yanıtlanabilir. */
export function yanitlanabilirMi(e: YanitAlanlari, simdi = new Date()) {
  return (
    e.yon === "GELEN" &&
    e.senaryo === "TICARI" &&
    yanitDurumu(e, simdi) === "BEKLIYOR"
  )
}

/** "2026-06" → takvimdeki e-Defter berat olay id'si */
export const beratTakvimId = (mukellefId: string, donem: string) =>
  `${mukellefId}:E_DEFTER_BERAT:${donem}`

/** Para birimiyle tutar: 1.234,50 ₺ / 1.234,50 $ */
export function formatTutar(tutar: number, paraBirimi: string = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: paraBirimi,
  }).format(tutar)
}
