import { Badge } from "@/components/ui/badge"
import {
  BORCU_YOKTUR_ETIKET,
  ERISIM_DURUM_ETIKET,
} from "@prime/shared/borc/sabitler"
import { formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type {
  BorcSatiri,
  BorcuYokturGorunum,
  KamuErisimDurumu,
} from "@prime/shared/types/api"

const MAVI = "bg-sky-500/15 text-sky-800 dark:text-sky-300"
const YESIL = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
const SARI = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
const KIRMIZI = "bg-destructive/10 text-destructive"
const GRI = "bg-muted text-muted-foreground"

const ERISIM_RENK: Record<KamuErisimDurumu, string> = {
  AKTIF: YESIL,
  HATA: KIRMIZI,
  TANIMSIZ: GRI,
  DOGRULAMA: SARI,
}

export function KamuErisimBadge({
  durum,
  className,
}: {
  durum: KamuErisimDurumu
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(ERISIM_RENK[durum], className)}>
      {ERISIM_DURUM_ETIKET[durum]}
    </Badge>
  )
}

const YAZI_RENK: Record<BorcuYokturGorunum, string> = {
  DOGRULAMA_BEKLIYOR: SARI,
  TALEP_EDILDI: MAVI,
  HAZIR: YESIL,
  BORCU_VAR: KIRMIZI,
  HATA: KIRMIZI,
  SURESI_DOLDU: GRI,
}

export function BorcuYokturBadge({
  gorunum,
  className,
}: {
  gorunum: BorcuYokturGorunum
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(YAZI_RENK[gorunum], className)}>
      {BORCU_YOKTUR_ETIKET[gorunum]}
    </Badge>
  )
}

/** Listede borç hücresi: toplam ve varsa vadesi geçmiş kısım */
export function BorcTutari({ sorgu }: { sorgu: BorcSatiri["sorgu"] }) {
  if (!sorgu) return <span className="text-muted-foreground">Sorgulanmadı</span>
  if (sorgu.toplam === 0)
    return <span className="text-muted-foreground">Borç yok</span>
  return (
    <span className="grid">
      <span className="font-medium tabular-nums">
        {formatTRY(sorgu.toplam)}
      </span>
      {sorgu.vadesiGecmis > 0 && (
        <span className="text-xs text-destructive tabular-nums">
          {formatTRY(sorgu.vadesiGecmis)} vadesi geçmiş
        </span>
      )}
    </span>
  )
}
