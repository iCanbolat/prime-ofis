import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Notification01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { BildirimPaneli } from "@/features/bildirim/components/bildirim-paneli"
import { useBildirimler } from "@/features/bildirim/queries"

/** Header'daki bildirim zili: okunmamış sayısı rozeti + bildirim paneli. */
export function BildirimZili() {
  const [acik, setAcik] = useState(false)
  // Rozet için hafif sorgu; panel kendi listesini çeker
  const sayac = useBildirimler({ sadeceOkunmamis: true, limit: 1 })
  const okunmamis = sayac.data?.okunmamis ?? 0

  return (
    <Popover open={acik} onOpenChange={setAcik}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={
              okunmamis > 0
                ? `Bildirimler, ${okunmamis} okunmamış`
                : "Bildirimler"
            }
          />
        }
      >
        <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} />
        {okunmamis > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 dark:bg-red-700 ring-background"
          >
            {okunmamis > 9 ? "9+" : okunmamis}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        {acik && <BildirimPaneli onKapat={() => setAcik(false)} />}
      </PopoverContent>
    </Popover>
  )
}
