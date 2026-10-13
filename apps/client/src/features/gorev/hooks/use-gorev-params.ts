import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

import { GOREV_TIP_SIRASI } from "@prime/shared/gorev/sabitler"
import type { GorevListParams } from "@prime/shared/types/api"
import type { GorevTip } from "@prime/shared/types/domain"

type Patch = Partial<{
  atanan: string[] | string | null
  mukellef: string | null
  tip: GorevTip[] | null
  donem: string | null
  geciken: boolean | null
  q: string | null
  gorev: string | null
  sayfa: number | null
}>

/** Değişince liste başa döner; `gorev` (detay) ve `sayfa` sayfayı korur */
const SAYFAYI_KORUYAN = new Set(["gorev", "sayfa"])

/**
 * /gorevler?atanan=benim&mukellef=m_1&tip=KDV&tip=GECICI_VERGI&donem=2026-08&geciken=1&q=...&gorev=o_1
 * `atanan` tekrarlanabilir (herhangi birine atanmış görevler). `atanan=benim` oturumdaki kullanıcıya
 * çözülür (paylaşılan linkte herkes kendi görevini görür).
 * `sayfa` yalnızca liste görünümünde, istemci taraflı sayfalama için kullanılır.
 */
export function useGorevParams(kullaniciId: string | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    return {
      atanan: searchParams.getAll("atanan").filter(Boolean),
      mukellef: searchParams.get("mukellef") ?? "",
      tip: searchParams
        .getAll("tip")
        .filter((t): t is GorevTip => GOREV_TIP_SIRASI.includes(t as GorevTip)),
      donem: searchParams.get("donem") ?? "",
      geciken: searchParams.get("geciken") === "1",
      q: searchParams.get("q") ?? "",
      gorev: searchParams.get("gorev") ?? undefined,
      sayfa: Math.max(Number(searchParams.get("sayfa")) || 1, 1),
    }
  }, [searchParams])

  const sorgu = useMemo<GorevListParams>(
    () => ({
      atanan: params.atanan.length
        ? params.atanan.flatMap((a) =>
            a === "benim" ? (kullaniciId ? [kullaniciId] : []) : [a]
          )
        : undefined,
      mukellefId: params.mukellef || undefined,
      tip: params.tip.length ? params.tip : undefined,
      donem: params.donem || undefined,
      geciken: params.geciken || undefined,
      q: params.q || undefined,
    }),
    [params, kullaniciId]
  )

  const update = useCallback(
    (patch: Patch) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (Object.keys(patch).some((k) => !SAYFAYI_KORUYAN.has(k)))
            next.delete("sayfa")
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
            else if (value === true) next.set(key, "1")
            else if (typeof value === "number") {
              if (value > 1) next.set(key, String(value))
            } else if (value) next.set(key, value)
          }
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  const filtreVar = Boolean(
    params.atanan.length ||
    params.mukellef ||
    params.tip.length ||
    params.donem ||
    params.geciken ||
    params.q
  )

  return { params, sorgu, update, filtreVar }
}
