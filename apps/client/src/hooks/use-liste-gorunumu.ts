import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { useIsDar } from "@/hooks/use-mobile"

export type ListeGorunum = "grid" | "liste"

interface GorunumTercihleri {
  /** sayfa anahtarı → geniş ekranda seçilen görünüm */
  secimler: Record<string, ListeGorunum>
  sec: (sayfa: string, gorunum: ListeGorunum) => void
}

export const LISTE_GORUNUM_KEY = "prime-ofis:liste-gorunumu"

export const useGorunumTercihleri = create<GorunumTercihleri>()(
  persist(
    (set) => ({
      secimler: {},
      sec: (sayfa, gorunum) =>
        set((s) => ({ secimler: { ...s.secimler, [sayfa]: gorunum } })),
    }),
    {
      name: LISTE_GORUNUM_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ secimler: s.secimler }),
      // v0: ekran sınıfı başına seçim ({ dar, genis }); yalnızca geniş ekran seçimi korunur
      version: 1,
      migrate: (kayit) => {
        const eski = ((kayit ?? {}) as { secimler?: unknown }).secimler ?? {}
        const secimler: Record<string, ListeGorunum> = {}
        for (const [sayfa, v] of Object.entries(eski)) {
          const genis = (v as { genis?: unknown } | null)?.genis
          if (genis === "grid" || genis === "liste") secimler[sayfa] = genis
        }
        return { secimler }
      },
    }
  )
)

/**
 * Liste/ızgara görünümü: tablet ve altında (< 1024px) her zaman ızgara; tablo dar ekrana sığmaz.
 * Geniş ekranda varsayılan liste, kullanıcının seçimi sayfa başına saklanır.
 */
export function useListeGorunumu(
  sayfa: string
): [ListeGorunum, (g: ListeGorunum) => void] {
  const dar = useIsDar()
  const secim = useGorunumTercihleri((s) => s.secimler[sayfa])
  const sec = useGorunumTercihleri((s) => s.sec)
  return [dar ? "grid" : (secim ?? "liste"), (g) => sec(sayfa, g)]
}
