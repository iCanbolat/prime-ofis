import type { ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Call02Icon,
  CancelCircleIcon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate, formatPhone } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { PortalResponse } from "@prime/shared/types/api"

export type DurumEkraniTip =
  "GECERSIZ" | "SURESI_DOLDU" | "IPTAL" | "TAMAMLANDI" | "BASARI"

const TANIM: Record<
  DurumEkraniTip,
  { icon: IconSvgElement; ton: string; baslik: string }
> = {
  GECERSIZ: {
    icon: Link01Icon,
    ton: "bg-muted text-muted-foreground",
    baslik: "Bağlantı geçersiz",
  },
  SURESI_DOLDU: {
    icon: Clock01Icon,
    ton: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    baslik: "Bağlantının süresi dolmuş",
  },
  IPTAL: {
    icon: CancelCircleIcon,
    ton: "bg-muted text-muted-foreground",
    baslik: "Bu talep iptal edildi",
  },
  TAMAMLANDI: {
    icon: CheckmarkBadge01Icon,
    ton: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    baslik: "Evraklarınız alındı",
  },
  BASARI: {
    icon: CheckmarkBadge01Icon,
    ton: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    baslik: "Teşekkürler!",
  },
}

export function DurumEkrani({
  tip,
  portal,
  yuklenenSayisi,
}: {
  tip: DurumEkraniTip
  portal?: PortalResponse
  yuklenenSayisi?: number
}) {
  const t = TANIM[tip]
  const buro = portal?.buro.ad ?? "Büronuz"
  let aciklama: ReactNode
  switch (tip) {
    case "GECERSIZ":
      aciklama =
        "Bağlantı eksik kopyalanmış veya kaldırılmış olabilir. Büronuzdan yeni bir bağlantı isteyin."
      break
    case "SURESI_DOLDU":
      aciklama = `Son yükleme günü ${formatDate(portal!.sonKullanma)} idi. ${buro} ile iletişime geçerek yeni bağlantı isteyebilirsiniz.`
      break
    case "IPTAL":
      aciklama = `${buro} bu evrak talebini iptal etti. Bir yanlışlık olduğunu düşünüyorsanız büronuzu arayın.`
      break
    case "TAMAMLANDI":
      aciklama = `${buro} evraklarınızı inceleyecek; eksik veya hatalı bir şey olursa sizinle iletişime geçecek.`
      break
    case "BASARI":
      aciklama = yuklenenSayisi
        ? `${yuklenenSayisi} dosya ${buro} ekibine iletildi. Bu sayfayı kapatabilirsiniz.`
        : `Bildiriminiz ${buro} ekibine iletildi. Bu sayfayı kapatabilirsiniz.`
      break
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            t.ton
          )}
        >
          <HugeiconsIcon icon={t.icon} strokeWidth={2} className="size-7" />
        </span>
        <div className="grid gap-1.5">
          <h1 className="font-heading text-xl font-semibold">{t.baslik}</h1>
          <p className="text-sm text-muted-foreground">{aciklama}</p>
        </div>
        {portal?.buro.telefon && tip !== "BASARI" && tip !== "TAMAMLANDI" && (
          <a
            href={`tel:${portal.buro.telefon}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <HugeiconsIcon
              icon={Call02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {formatPhone(portal.buro.telefon)}
          </a>
        )}
      </CardContent>
    </Card>
  )
}
