import { Badge } from "@/components/ui/badge"
import type { BordroUyari } from "@prime/shared/bordro/kurallar"
import {
  BORDRO_DURUM_ETIKET,
  BORDRO_UYARI_ETIKET,
} from "@prime/shared/bordro/sabitler"
import { cn } from "@/lib/utils"
import type { BordroDurum } from "@prime/shared/types/domain"

const DURUM_RENK: Record<BordroDurum, string> = {
  BEKLENIYOR: "bg-muted text-muted-foreground",
  GIRDI_GELDI: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  HAZIRLANDI: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  MUKELLEFE_GITTI: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  BEYAN_VERILDI: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}

const UYARI_RENK: Record<Exclude<BordroUyari, "YOK">, string> = {
  YAKLASIYOR: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  GECIKTI: "bg-destructive/10 text-destructive",
}

export function BordroDurumBadge({
  durum,
  className,
}: {
  durum: BordroDurum
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(DURUM_RENK[durum], className)}>
      {BORDRO_DURUM_ETIKET[durum]}
    </Badge>
  )
}

/** Uyarı yoksa hiçbir şey çizmez */
export function BordroUyariBadge({
  uyari,
  className,
}: {
  uyari: BordroUyari
  className?: string
}) {
  if (uyari === "YOK") return null
  return (
    <Badge variant="secondary" className={cn(UYARI_RENK[uyari], className)}>
      {BORDRO_UYARI_ETIKET[uyari]}
    </Badge>
  )
}
