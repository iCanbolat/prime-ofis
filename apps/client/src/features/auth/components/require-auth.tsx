import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"

import { hasRole, useAuthStore } from "@/features/auth/store"
import { ForbiddenPage } from "@/components/shared/status-pages"
import type { Rol } from "@prime/shared/types/domain"

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

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
