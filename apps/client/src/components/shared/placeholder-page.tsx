import { Wrench01Icon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/query-states"

interface PlaceholderPageProps {
  title: string
  description?: string
  /** Hangi fazda geliştirileceği, ör. "Faz 1 · B1.1" */
  phase: string
  /** Sekme içinde kullanımda sayfa başlığı gösterilmez */
  compact?: boolean
}

/** Henüz geliştirilmemiş rotalar için geçici sayfa. İlgili fazda gerçek sayfayla değiştirilir. */
export function PlaceholderPage({
  title,
  description,
  phase,
  compact,
}: PlaceholderPageProps) {
  return (
    <>
      {!compact && <PageHeader title={title} description={description} />}
      <EmptyState
        icon={Wrench01Icon}
        title={
          compact ? `${title} yapım aşamasında` : "Bu sayfa yapım aşamasında"
        }
        description={`Planlanan geliştirme: ${phase}`}
      />
    </>
  )
}
