import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

import type { TalepDurumu } from "@prime/shared/types/domain"

export type TalepSekme = "talepler" | "gelen"
const DURUMLAR: TalepDurumu[] = ["AKTIF", "TAMAMLANDI", "SURESI_DOLDU", "IPTAL"]

type Patch = Partial<{
  sekme: TalepSekme | null
  durum: TalepDurumu | null
  q: string | null
  talep: string | null
}>

/** /evrak-talepleri?sekme=gelen&durum=AKTIF&q=...&talep=e_001 (talep: açık detay paneli) */
export function useTalepParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    const durum = searchParams.get("durum") as TalepDurumu | null
    return {
      sekme: (searchParams.get("sekme") === "gelen"
        ? "gelen"
        : "talepler") as TalepSekme,
      durum: durum && DURUMLAR.includes(durum) ? durum : undefined,
      q: searchParams.get("q") ?? "",
      talep: searchParams.get("talep") ?? undefined,
    }
  }, [searchParams])

  const update = useCallback(
    (patch: Patch) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (value) next.set(key, value)
          }
          if (next.get("sekme") === "talepler") next.delete("sekme")
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  return { params, update }
}
