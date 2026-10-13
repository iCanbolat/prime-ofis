import { Badge } from "@/components/ui/badge"
import { KESINTI_DURUM_ETIKET } from "@prime/shared/tahsilat/sabitler"
import type { KesintiDurum } from "@prime/shared/tahsilat/kurallar"
import { cn } from "@/lib/utils"
import type { CariDurum } from "@prime/shared/tahsilat/kurallar"

const YESIL = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
const SARI = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
const KIRMIZI = "bg-destructive/10 text-destructive"
const MAVI = "bg-sky-500/15 text-sky-800 dark:text-sky-300"
const GRI = "bg-muted text-muted-foreground"

/** Cari durumu: borçsuz, açık (vadesi gelmemiş), gecikmiş (gün) ya da avans */
export function CariDurumBadge({
  durum,
  className,
}: {
  durum: Pick<CariDurum, "acikBorc" | "bakiye" | "geciken" | "gecikmeGun">
  className?: string
}) {
  if (durum.geciken)
    return (
      <Badge variant="secondary" className={cn(KIRMIZI, className)}>
        {durum.gecikmeGun} gün gecikmiş
      </Badge>
    )
  if (durum.acikBorc > 0)
    return (
      <Badge variant="secondary" className={cn(SARI, className)}>
        Açık
      </Badge>
    )
  if (durum.bakiye < 0)
    return (
      <Badge variant="secondary" className={cn(MAVI, className)}>
        Avans
      </Badge>
    )
  return (
    <Badge variant="secondary" className={cn(YESIL, className)}>
      Borcu yok
    </Badge>
  )
}

const KESINTI_RENK: Record<KesintiDurum, string> = {
  ESLESTI: YESIL,
  EKSIK: KIRMIZI,
  FAZLA: SARI,
  BILDIRILMEMIS: KIRMIZI,
  KAYITSIZ: GRI,
}

export function KesintiDurumBadge({
  durum,
  className,
}: {
  durum: KesintiDurum
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(KESINTI_RENK[durum], className)}>
      {KESINTI_DURUM_ETIKET[durum]}
    </Badge>
  )
}
