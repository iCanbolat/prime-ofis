import { Badge } from "@/components/ui/badge"
import {
  ERISIM_DURUM_ETIKET,
  TEBLIGAT_DURUM_ETIKET,
} from "@prime/shared/tebligat/sabitler"
import { cn } from "@/lib/utils"
import type { TebligatErisimSatirDurumu, TebligatView } from "@prime/shared/types/api"
import type { TebligatDurum } from "@prime/shared/types/domain"

const MAVI = "bg-sky-500/15 text-sky-800 dark:text-sky-300"
const YESIL = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
const SARI = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
const KIRMIZI = "bg-destructive/10 text-destructive"
const GRI = "bg-muted text-muted-foreground"

const DURUM_RENK: Record<TebligatDurum, string> = {
  YENI: MAVI,
  INCELENDI: SARI,
  ISLEM_YAPILDI: YESIL,
  KAPANDI: GRI,
}

export function TebligatDurumBadge({
  durum,
  className,
}: {
  durum: TebligatDurum
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(DURUM_RENK[durum], className)}>
      {TEBLIGAT_DURUM_ETIKET[durum]}
    </Badge>
  )
}

/** Açık tebligatta son işlem gününe kalan süre; kapalıda gösterilmez */
export function SureBadge({
  t,
  className,
}: {
  t: Pick<TebligatView, "acik" | "gecikti" | "acil" | "kalanGun">
  className?: string
}) {
  if (!t.acik || t.kalanGun === undefined) return null
  if (t.gecikti)
    return (
      <Badge variant="secondary" className={cn(KIRMIZI, className)}>
        Süre {Math.abs(t.kalanGun)} gün geçti
      </Badge>
    )
  return (
    <Badge
      variant="secondary"
      className={cn(t.acil ? KIRMIZI : GRI, className)}
    >
      {t.kalanGun === 0 ? "Son gün bugün" : `${t.kalanGun} gün kaldı`}
    </Badge>
  )
}

const ERISIM_RENK: Record<TebligatErisimSatirDurumu, string> = {
  AKTIF: YESIL,
  HATA: KIRMIZI,
  TANIMSIZ: GRI,
}

export function ErisimDurumBadge({
  durum,
  className,
}: {
  durum: TebligatErisimSatirDurumu
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(ERISIM_RENK[durum], className)}>
      {ERISIM_DURUM_ETIKET[durum]}
    </Badge>
  )
}
