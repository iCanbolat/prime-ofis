import { useEffect, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Navigate, useLocation } from "react-router"

import { useOturum } from "@/features/auth/queries"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { useVaultStore } from "@/features/kasa/store"
import { ForbiddenPage } from "@/components/shared/status-pages"
import { setYetkisizIsleyici } from "@/lib/http"
import type { Rol } from "@prime/shared/types/domain"

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const queryClient = useQueryClient()
  // Yerel kopya varken arayüz hemen açılır; sunucu oturumu arka planda doğrulanır
  useOturum(user !== null)

  useEffect(() => {
    // Oturum süresi dolduysa / başka yerden kapatıldıysa herhangi bir istek 401 döner
    setYetkisizIsleyici(() => {
      if (!useAuthStore.getState().user) return
      useVaultStore.getState().lock()
      useAuthStore.getState().clear()
      queryClient.removeQueries()
    })
    return () => setYetkisizIsleyici(null)
  }, [queryClient])

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return children
}

export function RequireRole({
  roles,
  children,
}: {
  roles: Rol[]
  children: ReactNode
}) {
  const user = useAuthStore((s) => s.user)
  if (!hasRole(user, roles)) return <ForbiddenPage />
  return children
}
