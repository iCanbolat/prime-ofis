import { FaturaListesi } from "@/features/e-belge/components/fatura-listesi"

export function EFaturaPage() {
  return <FaturaListesi tur="E_FATURA" />
}

export function EArsivPage() {
  return <FaturaListesi tur="E_ARSIV" />
}
