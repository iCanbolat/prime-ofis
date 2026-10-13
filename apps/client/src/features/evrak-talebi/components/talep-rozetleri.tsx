import { Badge } from "@/components/ui/badge"
import { TALEP_DURUM_ETIKET } from "@prime/shared/evrak-talebi/sabitler"
import { cn } from "@/lib/utils"
import type { GelenEvrakDurum, TalepDurumu } from "@prime/shared/types/domain"

const TALEP_RENK: Record<TalepDurumu, string> = {
  AKTIF: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  TAMAMLANDI: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  SURESI_DOLDU: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  IPTAL: "bg-muted text-muted-foreground",
}

export function TalepDurumBadge({
  durum,
  className,
}: {
  durum: TalepDurumu
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(TALEP_RENK[durum], className)}>
      {TALEP_DURUM_ETIKET[durum]}
    </Badge>
  )
}

const GELEN_ETIKET: Record<GelenEvrakDurum, string> = {
  BEKLIYOR: "İnceleme bekliyor",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
}

const GELEN_RENK: Record<GelenEvrakDurum, string> = {
  BEKLIYOR: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ONAYLANDI: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  REDDEDILDI: "bg-destructive/10 text-destructive",
}

export function GelenDurumBadge({
  durum,
  className,
}: {
  durum: GelenEvrakDurum
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(GELEN_RENK[durum], className)}>
      {GELEN_ETIKET[durum]}
    </Badge>
  )
}
