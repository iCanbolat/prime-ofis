import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MUKELLEF_TUR_ETIKET, type MukellefTur } from "@prime/shared/types/domain"

const TUR_CLASS: Record<MukellefTur, string> = {
  SAHIS: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  LTD: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  AS: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
}

export function MukellefTurBadge({
  tur,
  className,
}: {
  tur: MukellefTur
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(TUR_CLASS[tur], className)}>
      {MUKELLEF_TUR_ETIKET[tur]}
    </Badge>
  )
}

export function AktifBadge({ aktif }: { aktif: boolean }) {
  return aktif ? (
    <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300">
      Aktif
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Pasif
    </Badge>
  )
}
