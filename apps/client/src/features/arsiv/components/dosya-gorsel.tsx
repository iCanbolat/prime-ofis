import { HugeiconsIcon } from "@hugeicons/react"
import { File01Icon, Image01Icon, Pdf01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { gecerlilikDurumu, kalanGun } from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_BELGE_ETIKET,
  BORDRO_BELGE_KISA,
} from "@prime/shared/bordro/sabitler"
import { formatDate, formatDonem } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { cn } from "@/lib/utils"
import type { ArsivDosya } from "@prime/shared/types/domain"

export function DosyaIkonu({
  mimeType,
  className,
}: {
  mimeType: string
  className?: string
}) {
  const pdf = mimeType === "application/pdf"
  const gorsel = mimeType.startsWith("image/")
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl",
        pdf
          ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
          : gorsel
            ? "bg-sky-500/12 text-sky-700 dark:text-sky-300"
            : "bg-muted text-muted-foreground",
        className
      )}
    >
      <HugeiconsIcon
        icon={pdf ? Pdf01Icon : gorsel ? Image01Icon : File01Icon}
        strokeWidth={2}
        className="size-1/2"
      />
    </span>
  )
}

/** Süreli belgeler için "Süresi doldu" / "N gün kaldı" rozeti; geçerliyse (detayli değilse) hiçbir şey. */
export function GecerlilikBadge({
  tarih,
  detayli = false,
  className,
}: {
  tarih: string | undefined
  /** Geçerli belgelerde de son geçerlilik tarihini göster */
  detayli?: boolean
  className?: string
}) {
  if (!tarih) return null
  const bugunYmd = bugun()
  const durum = gecerlilikDurumu(tarih, bugunYmd)
  const kalan = kalanGun(tarih, bugunYmd)

  if (durum === "DOLDU")
    return (
      <Badge
        variant="destructive"
        title={`Son geçerlilik: ${formatDate(tarih)}`}
        className={className}
      >
        Süresi doldu
      </Badge>
    )
  if (durum === "YAKINDA")
    return (
      <Badge
        variant="secondary"
        title={`Son geçerlilik: ${formatDate(tarih)}`}
        className={cn(
          "bg-amber-500/15 text-amber-800 dark:text-amber-300",
          className
        )}
      >
        {kalan === 0 ? "Bugün doluyor" : `${kalan} gün kaldı`}
      </Badge>
    )
  if (!detayli) return null
  return (
    <Badge variant="outline" className={cn("text-muted-foreground", className)}>
      {formatDate(tarih)}'e kadar
    </Badge>
  )
}

/** Döneme bağlı belgede "Ağustos 2026 · Ücret hesap pusulaları" rozeti */
export function DonemBadge({
  dosya,
  className,
}: {
  dosya: Pick<ArsivDosya, "donem" | "bordroBelge">
  className?: string
}) {
  if (!dosya.donem) return null
  return (
    <Badge
      variant="outline"
      className={cn("max-w-full truncate", className)}
      title={
        dosya.bordroBelge ? BORDRO_BELGE_ETIKET[dosya.bordroBelge] : undefined
      }
    >
      {formatDonem(dosya.donem)}
      {dosya.bordroBelge && ` · ${BORDRO_BELGE_KISA[dosya.bordroBelge]}`}
    </Badge>
  )
}
