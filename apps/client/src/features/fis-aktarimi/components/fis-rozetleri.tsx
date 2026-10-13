import { Badge } from "@/components/ui/badge"
import {
  FIS_DURUM_ETIKET,
  OKUMA_DURUM_ETIKET,
} from "@prime/shared/fis-aktarimi/sabitler"
import type { FisDurum, OkumaDurum } from "@prime/shared/types/domain"

export function FisDurumBadge({ durum }: { durum: FisDurum }) {
  const variant =
    durum === "TASLAK"
      ? "outline"
      : durum === "ONAYLANDI"
        ? "default"
        : "secondary"
  return <Badge variant={variant}>{FIS_DURUM_ETIKET[durum]}</Badge>
}

export function OkumaDurumBadge({ durum }: { durum: OkumaDurum }) {
  return (
    <Badge variant={durum === "HATA" ? "destructive" : "secondary"}>
      {OKUMA_DURUM_ETIKET[durum]}
    </Badge>
  )
}

/** Uyarı ve hata sayısını tek rozette gösterir */
export function FisSorunBadge({
  hatalar,
  uyarilar,
}: {
  hatalar: string[]
  uyarilar: string[]
}) {
  if (hatalar.length)
    return (
      <Badge variant="destructive" title={hatalar.join("\n")}>
        {hatalar.length} hata
      </Badge>
    )
  if (uyarilar.length)
    return (
      <Badge variant="outline" title={uyarilar.join("\n")}>
        {uyarilar.length} uyarı
      </Badge>
    )
  return null
}
