import type { BordroSatiri } from "@prime/shared/types/api"

/** "3 iş günü kaldı" / "2 iş günü geçti" / "Beyan verildi" */
export function kalanMetin(s: BordroSatiri) {
  if (s.durum === "BEYAN_VERILDI") return "Beyan verildi"
  if (s.kalanIsGunu < 0) return `${-s.kalanIsGunu} iş günü geçti`
  if (s.kalanIsGunu === 0) return "Bugün"
  return `${s.kalanIsGunu} iş günü kaldı`
}
