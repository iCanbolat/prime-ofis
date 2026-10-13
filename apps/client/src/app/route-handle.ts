import type { ReactNode } from "react"
import type { Params, UIMatch } from "react-router"

/**
 * Route `handle` sözleşmesi: breadcrumb buradan okunur.
 * Dinamik başlıklar için fonksiyon verilebilir (ör. mükellef adı).
 */
export interface RouteHandle {
  crumb?: string | ((params: Params) => ReactNode)
}

export function getCrumbs(
  matches: UIMatch[]
): { label: ReactNode; to: string }[] {
  return matches.flatMap((match) => {
    const crumb = (match.handle as RouteHandle | undefined)?.crumb
    if (!crumb) return []
    const label = typeof crumb === "function" ? crumb(match.params) : crumb
    return [{ label, to: match.pathname }]
  })
}
