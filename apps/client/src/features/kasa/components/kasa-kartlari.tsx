import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import {
  HUCRE_ETIKET,
  type HucreDurumu,
  type KasaSatiri,
} from "@prime/shared/kasa/matris"
import { SISTEMLER, SISTEM_SIRASI } from "@prime/shared/kasa/sistemler"
import { MukellefTurBadge } from "@/features/mukellef/components/mukellef-badges"
import { cn } from "@/lib/utils"
import type { Mukellef } from "@prime/shared/types/domain"

export function HucreIkonu({ durum }: { durum: HucreDurumu }) {
  if (durum === "kayitli")
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={2}
        className="text-emerald-600 dark:text-emerald-400"
      />
    )
  if (durum === "eksik")
    return <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
  return null
}

/** Kasa tamamlanma matrisinin ızgara görünümü: mükellef başına bir kart */
export function KasaKartlari({
  satirlar,
  onSec,
}: {
  satirlar: KasaSatiri[]
  onSec: (mukellef: Mukellef) => void
}) {
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      role="list"
      aria-label="Şifre kasası mükellefleri"
    >
      {satirlar.map(({ mukellef, hucreler, eksikSayisi }) => (
        <li
          key={mukellef.id}
          className="flex flex-col gap-3 rounded-3xl border bg-card p-4"
        >
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-1">
              <Link
                to={`/mukellefler/${mukellef.id}/sifreler`}
                className="line-clamp-2 font-medium hover:underline"
              >
                {mukellef.unvan}
              </Link>
              <MukellefTurBadge tur={mukellef.tur} />
            </div>
            {eksikSayisi > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 text-amber-800 dark:text-amber-300"
              >
                {eksikSayisi} eksik
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {SISTEM_SIRASI.map((s) => {
              const durum = hucreler[s]
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`${mukellef.unvan} ${SISTEMLER[s].ad}: ${HUCRE_ETIKET[durum]}`}
                  onClick={() => onSec(mukellef)}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
                    durum === "eksik" && "text-amber-800 dark:text-amber-300",
                    durum === "gerekmez" && "text-muted-foreground"
                  )}
                >
                  <HucreIkonu durum={durum} />
                  <span className="truncate">{SISTEMLER[s].ad}</span>
                  {durum === "gerekmez" && (
                    <span className="ml-auto text-xs">—</span>
                  )}
                </button>
              )
            })}
          </div>
        </li>
      ))}
    </ul>
  )
}
