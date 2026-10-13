import { useCallback } from "react"

import { lucaExcelOlustur } from "@/features/fis-aktarimi/luca-excel"
import { dosyaIndir } from "@/lib/dosya"
import type { LucaAktarimDetay } from "@prime/shared/types/api"

/** Aktarım kaydındaki fişlerden Luca Excel'ini üretip indirir */
export function useLucaIndir() {
  return useCallback(async (detay: LucaAktarimDetay) => {
    const blob = await lucaExcelOlustur(detay.fisler, detay.sablon)
    dosyaIndir(blob, detay.aktarim.dosyaAdi)
  }, [])
}
