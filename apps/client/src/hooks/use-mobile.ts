import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Tailwind `lg` kırılımı: bunun altı tablet ve telefon sayılır */
const TABLET_BREAKPOINT = 1024

/** Bir media query'nin eşleşip eşleşmediğini izler. */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}

/** Tablet ve altı (< 1024px) */
export function useIsDar() {
  return useMediaQuery(`(max-width: ${TABLET_BREAKPOINT - 1}px)`)
}
