import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"
import { endOfMonth, format } from "date-fns"

import { SAYFA_BOYUTU } from "@prime/shared/e-belge/sabitler"
import type {
  EBelgeListParams,
  EBelgeSiralama,
  SiralamaYonu,
} from "@prime/shared/types/api"
import type {
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  GibDurumu,
} from "@prime/shared/types/domain"

const YONLER: EBelgeYon[] = ["GELEN", "GIDEN"]
const GIB: GibDurumu[] = ["BASARILI", "ISLENIYOR", "HATA", "IPTAL"]
const YANITLAR: EFaturaYanit[] = ["BEKLIYOR", "KABUL", "RED", "SURESI_DOLDU"]
const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type Patch = Partial<{
  yon: EBelgeYon | null
  gibDurumu: GibDurumu | null
  yanit: EFaturaYanit | null
  yanitSuresi: "yaklasan" | null
  mukellef: string | null
  q: string | null
  /** "2026-09" */
  donem: string | null
  sirala: EBelgeSiralama | null
  siralamaYonu: SiralamaYonu | null
  sayfa: number | null
  fatura: string | null
}>

/** "2026-09" → { baslangic: "2026-09-01", bitis: "2026-09-30" } */
export function donemAraligi(donem: string) {
  const ilk = new Date(`${donem}-01T00:00:00`)
  return {
    baslangic: format(ilk, "yyyy-MM-dd"),
    bitis: format(endOfMonth(ilk), "yyyy-MM-dd"),
  }
}

/**
 * Fatura listesi durumu URL'de:
 * /e-belge/e-fatura?yon=GELEN&yanit=BEKLIYOR&yanitSuresi=yaklasan&mukellef=m_001&donem=2026-09&q=…&sayfa=2&fatura=f_0012
 * Varsayılanlar (tarihe göre yeniden eskiye, sayfa 1) URL'e yazılmaz. `sabitMukellef` verilirse
 * (mükellef kartı) mükellef filtresi URL yerine ondan gelir.
 */
export function useFaturaParams(tur: EBelgeTur, sabitMukellef?: string) {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    const get = (k: string) => searchParams.get(k) ?? undefined
    const yon = get("yon") as EBelgeYon | undefined
    const gib = get("gibDurumu") as GibDurumu | undefined
    const yanit = get("yanit") as EFaturaYanit | undefined
    const donem = get("donem")
    const sayfa = Number(get("sayfa"))
    return {
      yon: yon && YONLER.includes(yon) ? yon : undefined,
      gibDurumu: gib && GIB.includes(gib) ? gib : undefined,
      yanit: yanit && YANITLAR.includes(yanit) ? yanit : undefined,
      yanitSuresi:
        get("yanitSuresi") === "yaklasan" ? ("yaklasan" as const) : undefined,
      mukellef: sabitMukellef ?? get("mukellef"),
      q: get("q") ?? "",
      donem: donem && DONEM_RE.test(donem) ? donem : undefined,
      sirala: (get("sirala") === "toplam"
        ? "toplam"
        : "tarih") as EBelgeSiralama,
      siralamaYonu: (get("siralamaYonu") === "asc"
        ? "asc"
        : "desc") as SiralamaYonu,
      sayfa: Number.isInteger(sayfa) && sayfa > 0 ? sayfa : 1,
      fatura: get("fatura"),
    }
  }, [searchParams, sabitMukellef])

  const sorgu = useMemo<EBelgeListParams>(
    () => ({
      tur,
      mukellefId: params.mukellef,
      yon: tur === "E_ARSIV" ? undefined : params.yon,
      gibDurumu: params.gibDurumu,
      yanit: params.yanit,
      yanitYaklasan:
        tur === "E_FATURA" && params.yanitSuresi === "yaklasan"
          ? true
          : undefined,
      q: params.q || undefined,
      ...(params.donem ? donemAraligi(params.donem) : {}),
      sirala: params.sirala,
      siralamaYonu: params.siralamaYonu,
      sayfa: params.sayfa,
      sayfaBoyutu: SAYFA_BOYUTU,
    }),
    [tur, params]
  )

  /** Filtre değişince sayfa 1'e döner (sayfa ve detay paneli değişiklikleri hariç). */
  const update = useCallback(
    (patch: Patch) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (value !== null && value !== undefined && value !== "")
              next.set(key, String(value))
          }
          if (!("sayfa" in patch) && !("fatura" in patch)) next.delete("sayfa")
          if (next.get("sayfa") === "1") next.delete("sayfa")
          if (next.get("sirala") === "tarih") next.delete("sirala")
          if (next.get("siralamaYonu") === "desc") next.delete("siralamaYonu")
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  const hasFilters = Boolean(
    params.yon ||
    params.gibDurumu ||
    params.yanit ||
    params.yanitSuresi ||
    (!sabitMukellef && params.mukellef) ||
    params.q ||
    params.donem
  )

  const reset = useCallback(
    () =>
      update({
        yon: null,
        gibDurumu: null,
        yanit: null,
        yanitSuresi: null,
        mukellef: null,
        q: null,
        donem: null,
      }),
    [update]
  )

  return { params, sorgu, update, reset, hasFilters }
}
