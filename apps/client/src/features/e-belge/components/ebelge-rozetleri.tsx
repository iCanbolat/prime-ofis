import { Badge } from "@/components/ui/badge"
import {
  BAGLANTI_DURUM_ETIKET,
  BERAT_DURUM_ETIKET,
  GIB_DURUM_ETIKET,
  YANIT_ETIKET,
} from "@prime/shared/e-belge/sabitler"
import { cn } from "@/lib/utils"
import type { EBelgeView } from "@prime/shared/types/api"
import type {
  BeratDurumu,
  EFaturaYanit,
  GibDurumu,
  EntegratorBaglantiDurumu,
} from "@prime/shared/types/domain"

const MAVI = "bg-sky-500/15 text-sky-700 dark:text-sky-300"
const YESIL = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
const SARI = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
const KIRMIZI = "bg-destructive/10 text-destructive"
const GRI = "bg-muted text-muted-foreground"

const GIB_RENK: Record<GibDurumu, string> = {
  BASARILI: YESIL,
  ISLENIYOR: MAVI,
  HATA: KIRMIZI,
  IPTAL: GRI,
}

export function GibDurumBadge({
  durum,
  className,
}: {
  durum: GibDurumu
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(GIB_RENK[durum], className)}>
      {GIB_DURUM_ETIKET[durum]}
    </Badge>
  )
}

const YANIT_RENK: Record<EFaturaYanit, string> = {
  BEKLIYOR: MAVI,
  KABUL: YESIL,
  RED: KIRMIZI,
  SURESI_DOLDU: GRI,
}

/** Bekleyen yanıtta kalan gün gösterilir; son 2 gün uyarı rengindedir. */
export function YanitBadge({
  yanit,
  kalanGun,
  className,
}: {
  yanit: EFaturaYanit
  kalanGun?: number
  className?: string
}) {
  const bekliyor = yanit === "BEKLIYOR" && kalanGun !== undefined
  const acil = bekliyor && kalanGun <= 2
  return (
    <Badge
      variant="secondary"
      className={cn(acil ? SARI : YANIT_RENK[yanit], className)}
    >
      {bekliyor
        ? kalanGun === 0
          ? "Yanıt için son gün"
          : `Yanıt bekliyor · ${kalanGun} gün`
        : YANIT_ETIKET[yanit]}
    </Badge>
  )
}

const BERAT_RENK: Record<BeratDurumu, string> = {
  YUKLENMEDI: GRI,
  YUKLENDI: MAVI,
  ONAYLANDI: YESIL,
  HATA: KIRMIZI,
}

export function BeratDurumBadge({
  durum,
  gecikti,
  className,
}: {
  durum: BeratDurumu
  gecikti?: boolean
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(gecikti ? KIRMIZI : BERAT_RENK[durum], className)}
    >
      {gecikti && durum === "YUKLENMEDI"
        ? "Gecikti"
        : BERAT_DURUM_ETIKET[durum]}
    </Badge>
  )
}

const BAGLANTI_RENK: Record<EntegratorBaglantiDurumu, string> = {
  BAGLI: YESIL,
  HATA: KIRMIZI,
  BAGLI_DEGIL: GRI,
}

export function BaglantiDurumBadge({
  durum,
  className,
}: {
  durum: EntegratorBaglantiDurumu
  className?: string
}) {
  return (
    <Badge variant="secondary" className={cn(BAGLANTI_RENK[durum], className)}>
      {BAGLANTI_DURUM_ETIKET[durum]}
    </Badge>
  )
}

/** Fatura satırı/kartı için birleşik durum rozetleri (GİB, yanıt, arşiv) */
export function FaturaDurumRozetleri({ f }: { f: EBelgeView }) {
  return (
    <div className="flex flex-wrap gap-1">
      {f.gibDurumu !== "BASARILI" && <GibDurumBadge durum={f.gibDurumu} />}
      {f.yanit && <YanitBadge yanit={f.yanit} kalanGun={f.yanitKalanGun} />}
      {f.gibDurumu === "BASARILI" && !f.yanit && (
        <GibDurumBadge durum="BASARILI" />
      )}
      {f.arsivDosyaId && <Badge variant="outline">Arşivde</Badge>}
    </div>
  )
}
