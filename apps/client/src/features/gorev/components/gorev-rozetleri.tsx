import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import {
  GOREV_DURUM_ETIKET,
  GOREV_ONCELIK_ETIKET,
  GOREV_TIP_ETIKET,
  GOREV_TIP_RENK,
} from "@prime/shared/gorev/sabitler"
import { formatDate } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { GorevDurum, GorevOncelik, GorevTip } from "@prime/shared/types/domain"

export function GorevTipBadge({ tip }: { tip: GorevTip }) {
  return (
    <Badge variant="secondary" className={GOREV_TIP_RENK[tip]}>
      {GOREV_TIP_ETIKET[tip]}
    </Badge>
  )
}

const DURUM_RENK: Record<GorevDurum, string> = {
  YAPILACAK: "bg-muted text-muted-foreground",
  DEVAM: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  KONTROL: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  TAMAM: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}

export function GorevDurumBadge({ durum }: { durum: GorevDurum }) {
  return (
    <Badge variant="secondary" className={DURUM_RENK[durum]}>
      {GOREV_DURUM_ETIKET[durum]}
    </Badge>
  )
}

/** Yalnızca yüksek ve düşük öncelik işaretlenir; normal öncelik sade kalır. */
export function OncelikIsareti({ oncelik }: { oncelik: GorevOncelik }) {
  if (oncelik === "NORMAL") return null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        oncelik === "YUKSEK"
          ? "text-rose-700 dark:text-rose-300"
          : "text-muted-foreground"
      )}
      title={`${GOREV_ONCELIK_ETIKET[oncelik]} öncelik`}
    >
      <HugeiconsIcon
        icon={oncelik === "YUKSEK" ? ArrowUp01Icon : ArrowDown01Icon}
        strokeWidth={2}
        className="size-3.5"
      />
      {GOREV_ONCELIK_ETIKET[oncelik]}
    </span>
  )
}

export function SonTarih({
  sonTarih,
  gecikti,
}: {
  sonTarih: string
  gecikti: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        gecikti ? "font-medium text-destructive" : "text-muted-foreground"
      )}
    >
      <HugeiconsIcon
        icon={Calendar03Icon}
        strokeWidth={2}
        className="size-3.5"
      />
      {formatDate(sonTarih)}
      {gecikti && <span>· gecikti</span>}
    </span>
  )
}
