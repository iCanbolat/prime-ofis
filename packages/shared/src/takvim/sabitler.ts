import type { TakvimDurumFiltre } from "../types/api"
import type { BeyanDurumu } from "../types/domain"

export const BEYAN_DURUM_ETIKET: Record<BeyanDurumu, string> = {
  BEKLIYOR: "Bekliyor",
  HAZIRLANDI: "Hazırlandı",
  ONAYLANDI: "Onaylandı",
}

export const BEYAN_DURUM_SIRASI: BeyanDurumu[] = [
  "BEKLIYOR",
  "HAZIRLANDI",
  "ONAYLANDI",
]

export const TAKVIM_DURUM_FILTRE_ETIKET: Record<
  TakvimDurumFiltre | "tumu",
  string
> = {
  tumu: "Tüm durumlar",
  bekliyor: "Bekliyor",
  hazirlandi: "Hazırlandı",
  onaylandi: "Onaylandı",
  gecikti: "Gecikti",
}
