import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

import { SAYFA_BOYUTU } from "@/features/mukellef/constants"
import type {
  MukellefDurumFiltre,
  MukellefListParams,
  MukellefSiralama,
  SiralamaYonu,
} from "@prime/shared/types/api"
import type { MukellefTur } from "@prime/shared/types/domain"

const TURLER: MukellefTur[] = ["SAHIS", "LTD", "AS"]
const DURUMLAR: MukellefDurumFiltre[] = ["aktif", "pasif", "tumu"]

export const VARSAYILAN_DURUM: MukellefDurumFiltre = "aktif"

/**
 * Mükellef listesi filtreleri URL query'de tutulur (paylaşılabilir link, geri tuşu uyumu).
 * Örnek: /mukellefler?tur=LTD&tur=AS&sorumlu=p_2&q=çınar&sayfa=2
 * Varsayılan değerler URL'e yazılmaz.
 */
export function useMukellefListParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    const durum = searchParams.get("durum") as MukellefDurumFiltre | null
    const sayfa = Number(searchParams.get("sayfa"))
    return {
      q: searchParams.get("q") ?? undefined,
      tur: searchParams
        .getAll("tur")
        .filter((t): t is MukellefTur => TURLER.includes(t as MukellefTur)),
      sorumlu: searchParams.get("sorumlu") ?? undefined,
      durum: (durum && DURUMLAR.includes(durum)
        ? durum
        : VARSAYILAN_DURUM) as MukellefDurumFiltre,
      sirala: (searchParams.get("sirala") === "olusturmaTarihi"
        ? "olusturmaTarihi"
        : "unvan") as MukellefSiralama,
      yon: (searchParams.get("yon") === "desc"
        ? "desc"
        : "asc") as SiralamaYonu,
      sayfa: Number.isInteger(sayfa) && sayfa > 0 ? sayfa : 1,
      sayfaBoyutu: SAYFA_BOYUTU,
    }
  }, [searchParams])

  /** Filtre değişince sayfa 1'e döner (sayfa değişikliği hariç). */
  const update = useCallback(
    (patch: Partial<MukellefListParams>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            const values = Array.isArray(value) ? value : [value]
            for (const v of values) {
              if (v === undefined || v === null || v === "") continue
              next.append(key, String(v))
            }
          }
          if (!("sayfa" in patch)) next.delete("sayfa")
          if (next.get("sayfa") === "1") next.delete("sayfa")
          if (next.get("durum") === VARSAYILAN_DURUM) next.delete("durum")
          if (next.get("sirala") === "unvan") next.delete("sirala")
          if (next.get("yon") === "asc") next.delete("yon")
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const reset = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams]
  )

  const hasFilters = Boolean(
    params.q ||
    params.tur?.length ||
    params.sorumlu ||
    params.durum !== VARSAYILAN_DURUM
  )

  return { params, update, reset, hasFilters }
}
