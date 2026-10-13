import type { EvrakTalebi, TalepDurumu } from "../types/domain"

/** Aktif ama son kullanma tarihi geçmiş talepler "Süresi doldu" sayılır. */
export function talepDurumu(
  talep: Pick<EvrakTalebi, "durum" | "sonKullanma">,
  simdi: Date = new Date()
): TalepDurumu {
  if (talep.durum === "AKTIF" && new Date(talep.sonKullanma) < simdi)
    return "SURESI_DOLDU"
  return talep.durum
}
