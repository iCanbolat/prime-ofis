import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

import { KATEGORI_SIRASI } from "@prime/shared/arsiv/kurallar"
import { BORDRO_DONEM_RE } from "@prime/shared/bordro/kurallar"
import { useIsDar } from "@/hooks/use-mobile"
import type { ArsivListParams, ArsivSiralama, SiralamaYonu } from "@prime/shared/types/api"
import type { ArsivKategori } from "@prime/shared/types/domain"

export type ArsivGorunum = "grid" | "liste"
export type ArsivGecerlilikFiltresi = NonNullable<ArsivListParams["gecerlilik"]>

export const GECERLILIK_FILTRE_ETIKET: Record<ArsivGecerlilikFiltresi, string> =
  {
    DOLDU: "Süresi dolmuş",
    YAKINDA: "30 gün içinde dolacak",
  }

/** URL'de küçük harfle: ?gecerlilik=doldu | yakinda */
const GECERLILIK_URL: Record<string, ArsivGecerlilikFiltresi> = {
  doldu: "DOLDU",
  yakinda: "YAKINDA",
}

const SIRALAMALAR: ArsivSiralama[] = [
  "ad",
  "yuklemeTarihi",
  "boyut",
  "gecerlilikTarihi",
]

export interface ArsivParams {
  mukellef?: string
  kategori?: ArsivKategori
  q: string
  sirala: ArsivSiralama
  yon: SiralamaYonu
  gorunum: ArsivGorunum
  cop: boolean
  gecerlilik?: ArsivGecerlilikFiltresi
  /** Mükellef seçili değilken tüm mükelleflerin eksik zorunlu evrakları gösterilir */
  eksik: boolean
  /** "2026-08": yalnızca bu döneme bağlı belgeler (bordro sayfasından gelinir) */
  donem?: string
  /** 1 tabanlı */
  sayfa: number
}

/** Izgara 2/3/4 sütuna tam bölünsün */
export const ARSIV_SAYFA_BOYUTU = 24

type ArsivParamPatch = Partial<{
  mukellef: string | null
  kategori: ArsivKategori | null
  q: string | null
  sirala: ArsivSiralama | null
  yon: SiralamaYonu | null
  gorunum: ArsivGorunum | null
  cop: boolean | null
  gecerlilik: ArsivGecerlilikFiltresi | null
  eksik: boolean | null
  donem: string | null
  sayfa: number | null
}>

/**
 * Arşiv gezgini durumu URL'de: /arsiv?mukellef=m_001&kategori=VERGI_LEVHASI&q=...&gorunum=liste&cop=1&sayfa=2
 * &gecerlilik=doldu|yakinda&eksik=1&donem=2026-08
 * Varsayılanlar (ad ↑, ızgara) URL'e yazılmaz.
 */
export function useArsivParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dar = useIsDar()

  const params = useMemo<ArsivParams>(() => {
    const kategori = searchParams.get("kategori") as ArsivKategori | null
    const sirala = searchParams.get("sirala") as ArsivSiralama | null
    const sayfa = Number(searchParams.get("sayfa"))
    const donem = searchParams.get("donem")
    return {
      mukellef: searchParams.get("mukellef") ?? undefined,
      kategori:
        kategori && KATEGORI_SIRASI.includes(kategori) ? kategori : undefined,
      q: searchParams.get("q") ?? "",
      sirala: sirala && SIRALAMALAR.includes(sirala) ? sirala : "ad",
      yon: searchParams.get("yon") === "desc" ? "desc" : "asc",
      // Tablet ve altında tablo sığmaz: ızgara zorunlu
      gorunum:
        !dar && searchParams.get("gorunum") === "liste" ? "liste" : "grid",
      cop: searchParams.get("cop") === "1",
      gecerlilik: GECERLILIK_URL[searchParams.get("gecerlilik") ?? ""],
      eksik: searchParams.get("eksik") === "1",
      donem: donem && BORDRO_DONEM_RE.test(donem) ? donem : undefined,
      sayfa: Number.isInteger(sayfa) && sayfa > 0 ? sayfa : 1,
    }
  }, [searchParams, dar])

  const update = useCallback(
    (patch: ArsivParamPatch) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (value === true) next.set(key, "1")
            else if (key === "gecerlilik" && value)
              next.set(key, String(value).toLowerCase())
            else if (value) next.set(key, String(value))
          }
          // Başka klasöre geçilince dönem filtresi bırakılır
          if (
            !("donem" in patch) &&
            ("mukellef" in patch || "kategori" in patch || "cop" in patch)
          )
            next.delete("donem")
          // Filtre/klasör/sıralama değişince ilk sayfaya dönülür (görünüm hariç)
          const yalnizGorunum = Object.keys(patch).every((k) => k === "gorunum")
          if (!("sayfa" in patch) && !yalnizGorunum) next.delete("sayfa")
          if (next.get("sayfa") === "1") next.delete("sayfa")
          if (next.get("sirala") === "ad") next.delete("sirala")
          if (next.get("yon") === "asc") next.delete("yon")
          if (next.get("gorunum") === "grid") next.delete("gorunum")
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  return { params, update }
}
