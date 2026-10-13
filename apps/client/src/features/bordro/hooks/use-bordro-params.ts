import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

import { BORDRO_DONEM_RE, guncelBordroDonemi } from "@prime/shared/bordro/kurallar"
import { BORDRO_SAYFA_BOYUTU } from "@prime/shared/bordro/sabitler"
import { bugun } from "@prime/shared/lib/tarih"
import type { BordroListParams } from "@prime/shared/types/api"
import type { BordroDurum } from "@prime/shared/types/domain"

const DURUMLAR: BordroDurum[] = [
  "BEKLENIYOR",
  "GIRDI_GELDI",
  "HAZIRLANDI",
  "MUKELLEFE_GITTI",
  "BEYAN_VERILDI",
]
export type BordroSekme = "donemler" | "hareket"

export const UYARILAR = ["YAKLASIYOR", "GECIKTI"] as const
export type BordroUyariFiltresi = (typeof UYARILAR)[number]

type Patch = Partial<{
  donem: string | null
  durum: BordroDurum | null
  uyari: BordroUyariFiltresi | null
  q: string | null
  bordro: string | null
  sekme: BordroSekme | null
  sayfa: number | null
}>

/**
 * /bordro?donem=2026-08&durum=BEKLENIYOR&uyari=GECIKTI&q=...&sayfa=2&bordro=m_ltd:2026-08
 * (bordro: açık detay paneli, `mukellefId:donem`). Filtre değişince ilk sayfaya dönülür.
 */
export function useBordroParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    const donem = searchParams.get("donem")
    const durum = searchParams.get("durum") as BordroDurum | null
    const uyari = searchParams.get("uyari") as BordroUyariFiltresi | null
    const sayfa = Number(searchParams.get("sayfa"))
    const [mukellefId, panelDonem] = (searchParams.get("bordro") ?? "").split(
      ":"
    )
    return {
      sekme: (searchParams.get("sekme") === "hareket"
        ? "hareket"
        : "donemler") as BordroSekme,
      donem:
        donem && BORDRO_DONEM_RE.test(donem)
          ? donem
          : guncelBordroDonemi(bugun()),
      durum: durum && DURUMLAR.includes(durum) ? durum : undefined,
      uyari: uyari && UYARILAR.includes(uyari) ? uyari : undefined,
      q: searchParams.get("q") ?? "",
      sayfa: Number.isInteger(sayfa) && sayfa > 0 ? sayfa : 1,
      panel:
        mukellefId && panelDonem && BORDRO_DONEM_RE.test(panelDonem)
          ? { mukellefId, donem: panelDonem }
          : undefined,
    }
  }, [searchParams])

  const update = useCallback(
    (patch: Patch) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (value) next.set(key, String(value))
          }
          // Panel açıp kapamak sayfayı korur; diğer değişiklikler ilk sayfaya döner
          const sayfaKorunur = Object.keys(patch).every(
            (k) => k === "sayfa" || k === "bordro"
          )
          if (!sayfaKorunur) next.delete("sayfa")
          if (next.get("sayfa") === "1") next.delete("sayfa")
          if (next.get("sekme") === "donemler") next.delete("sekme")
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  const listeParams: BordroListParams = {
    donem: params.donem,
    durum: params.durum,
    uyari: params.uyari,
    q: params.q || undefined,
    sayfa: params.sayfa,
    sayfaBoyutu: BORDRO_SAYFA_BOYUTU,
  }

  return { params, listeParams, update }
}
