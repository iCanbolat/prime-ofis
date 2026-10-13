import { isRouteErrorResponse, useRouteError } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  ArrowLeft01Icon,
  FileNotFoundIcon,
  LockKeyIcon,
} from "@hugeicons/core-free-icons"

import { ButtonLink } from "@/components/shared/button-link"
import { EmptyState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"

function HomeButton() {
  return (
    <ButtonLink variant="outline" to="/">
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        data-icon="inline-start"
        strokeWidth={2}
      />
      Ana sayfaya dön
    </ButtonLink>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={FileNotFoundIcon}
        title="Sayfa bulunamadı"
        description="Aradığınız sayfa taşınmış veya hiç var olmamış olabilir."
        action={<HomeButton />}
      />
    </div>
  )
}

export function ForbiddenPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={LockKeyIcon}
        title="Bu sayfaya erişim yetkiniz yok"
        description="Bu bölüm yalnızca yönetici rolündeki kullanıcılara açıktır."
        action={<HomeButton />}
      />
    </div>
  )
}

/** Router `errorElement`: loader/render hatalarını yakalar. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Bilinmeyen hata"

  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-6">
      <EmptyState
        icon={Alert02Icon}
        title="Beklenmeyen bir hata oluştu"
        description={message}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Sayfayı yenile
            </Button>
            <HomeButton />
          </div>
        }
      />
    </div>
  )
}
