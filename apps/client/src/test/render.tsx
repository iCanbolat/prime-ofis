import type { ReactElement } from "react"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router"

import { AppProviders } from "@/app/providers"
import { routes } from "@/app/routes"
import { useAuthStore } from "@/features/auth/store"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { createQueryClient } from "@/lib/query-client"
import type { Personel } from "@prime/shared/types/domain"

/** Fixture kullanıcıları: p_1 yönetici, p_2..p_4 personel. */
export const TEST_USERS = {
  yonetici: PERSONEL[0],
  personel: PERSONEL[1],
} satisfies Record<string, Personel>

interface RenderRouteOptions {
  /** Oturum açmış kullanıcı; verilmezse oturum kapalı başlar. */
  as?: Personel
}

/** Uygulamanın gerçek rota ağacını bellek router'ı ile, belirtilen adreste render eder. */
export function renderRoute(path: string, { as }: RenderRouteOptions = {}) {
  if (as) useAuthStore.setState({ user: as })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = render(
    <AppProviders queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>
  )
  return { ...result, router, user: userEvent.setup() }
}

/** Tek bir bileşeni provider'larla render eder (router gerekmiyorsa). */
export function renderWithProviders(ui: ReactElement) {
  const result = render(
    <AppProviders queryClient={createQueryClient()}>{ui}</AppProviders>
  )
  return { ...result, user: userEvent.setup() }
}
