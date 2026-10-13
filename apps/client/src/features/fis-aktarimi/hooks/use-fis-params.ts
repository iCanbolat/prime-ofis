import { useCallback } from "react"
import { useSearchParams } from "react-router"

const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type Patch = Partial<{
  mukellef: string | null
  donem: string | null
  fis: string | null
  gelen: string | null
}>

/** Fiş aktarımı filtreleri ve açık fiş URL'de tutulur (paylaşılabilir bağlantı) */
export function useFisParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const donem = searchParams.get("donem") ?? ""

  const set = useCallback(
    (patch: Patch) =>
      setSearchParams(
        (onceki) => {
          const yeni = new URLSearchParams(onceki)
          for (const [k, v] of Object.entries(patch)) {
            if (v) yeni.set(k, v)
            else yeni.delete(k)
          }
          return yeni
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  return {
    mukellef: searchParams.get("mukellef") ?? "",
    donem: DONEM_RE.test(donem) ? donem : "",
    fis: searchParams.get("fis"),
    /** Gelen evrak incelemesinden gelinirse o belgenin fişi açılır */
    gelen: searchParams.get("gelen"),
    set,
  }
}
