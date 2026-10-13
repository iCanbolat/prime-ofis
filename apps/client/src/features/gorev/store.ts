import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type GorevGorunum = "kanban" | "liste"

interface GorevTercihleri {
  gorunum: GorevGorunum
  setGorunum: (gorunum: GorevGorunum) => void
}

export const GOREV_TERCIH_KEY = "prime-ofis:gorev-tercihleri"

/** Görünüm tercihi kullanıcı tarayıcısında saklanır; filtreler URL'dedir. */
export const useGorevTercihleri = create<GorevTercihleri>()(
  persist(
    (set) => ({
      gorunum: "kanban",
      setGorunum: (gorunum) => set({ gorunum }),
    }),
    {
      name: GOREV_TERCIH_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ gorunum: s.gorunum }),
      // v0'da "ozet" görünümü vardı; kaldırıldı
      version: 1,
      migrate: (kayit) => {
        const { gorunum } = (kayit ?? {}) as { gorunum?: string }
        return { gorunum: gorunum === "liste" ? "liste" : "kanban" }
      },
    }
  )
)
