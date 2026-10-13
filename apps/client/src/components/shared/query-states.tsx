import type { ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Alert02Icon, Refresh01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/http"

interface EmptyStateProps {
  icon: IconSvgElement
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const message =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : "Beklenmeyen bir hata oluştu"
  return (
    <EmptyState
      icon={Alert02Icon}
      title="Veriler yüklenemedi"
      description={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <HugeiconsIcon
              icon={Refresh01Icon}
              data-icon="inline-start"
              strokeWidth={2}
            />
            Tekrar dene
          </Button>
        )
      }
    />
  )
}

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
    >
      <Spinner aria-hidden="true" role={undefined} />
      {label}
    </div>
  )
}
