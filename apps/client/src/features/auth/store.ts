import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { setActorIdProvider } from "@/lib/http"
import type { Personel, Rol } from "@prime/shared/types/domain"

interface AuthState {
  user: Personel | null
  setUser: (user: Personel) => void
  clear: () => void
}

export const AUTH_STORAGE_KEY = "prime-ofis:session"

/**
 * Oturum açan personel. Asıl oturum sunucuda (httpOnly cookie); burada saklanan kopya sayfa
 * yenilenince arayüzün beklemeden açılması içindir ve `useOturum` ile doğrulanır.
 */

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clear: () => set({ user: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
)

export const hasRole = (user: Personel | null, roles: Rol[]) =>
  user !== null && roles.includes(user.rol)

// Yalnızca mock API (MSW) kullanır; gerçek API'ye başlık gönderilmez (`lib/http.ts`)
setActorIdProvider(() => useAuthStore.getState().user?.id)
