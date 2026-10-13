import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MizanKontrol, MizanKontrolDurumu } from "@prime/shared/types/domain"

const RENK: Record<MizanKontrolDurumu, string> = {
  GECTI: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  UYARI: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  HATA: "bg-destructive/10 text-destructive",
}

const KONTROL_ETIKET: Record<MizanKontrolDurumu, string> = {
  GECTI: "Geçti",
  UYARI: "Uyarı",
  HATA: "Hata",
}

export function KontrolBadge({ durum }: { durum: MizanKontrolDurumu }) {
  return (
    <Badge variant="secondary" className={RENK[durum]}>
      {KONTROL_ETIKET[durum]}
    </Badge>
  )
}

/** Mizanın genel sonucu: hata varsa hata sayısı, yoksa uyarı sayısı, ikisi de yoksa "Sorunsuz" */
export function MizanSonucBadge({
  kontroller,
  className,
}: {
  kontroller: MizanKontrol[]
  className?: string
}) {
  const hata = kontroller.filter((k) => k.durum === "HATA").length
  const uyari = kontroller.filter((k) => k.durum === "UYARI").length
  const [durum, metin]: [MizanKontrolDurumu, string] = hata
    ? ["HATA", `${hata} hata${uyari ? `, ${uyari} uyarı` : ""}`]
    : uyari
      ? ["UYARI", `${uyari} uyarı`]
      : ["GECTI", "Sorunsuz"]
  return (
    <Badge variant="secondary" className={cn(RENK[durum], className)}>
      {metin}
    </Badge>
  )
}
