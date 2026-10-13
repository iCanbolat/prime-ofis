import { Link } from "react-router"
import { format } from "date-fns"
import { tr } from "date-fns/locale"

import { Skeleton } from "@/components/ui/skeleton"
import { fromYmd } from "@prime/shared/lib/tarih"
import { cn } from "@/lib/utils"
import type { TakvimOzetResponse } from "@prime/shared/types/api"

/** Önümüzdeki 14 günün son gün yoğunluğu (açık yükümlülük sayısı); Yapılacaklar kartının başlığında. */
export function YogunlukSeridi({
  ozet,
  sorumlu,
}: {
  ozet: TakvimOzetResponse | undefined
  sorumlu?: string
}) {
  if (!ozet) return <Skeleton className="h-16 w-full" />
  const enFazla = Math.max(1, ...ozet.yogunluk.map((g) => g.adet))

  return (
    <ol
      aria-label="Günlük yoğunluk"
      className="grid grid-cols-14 gap-0.5 sm:gap-1"
    >
      {ozet.yogunluk.map(({ tarih, adet }) => {
        const gun = fromYmd(tarih)
        const haftaSonu = gun.getDay() === 0 || gun.getDay() === 6
        const bugun = tarih === ozet.bugun
        const etiket = `${format(gun, "d MMMM EEEE", { locale: tr })}: ${adet} yükümlülük`
        return (
          <li key={tarih}>
            <Link
              to={`/takvim?ay=${tarih.slice(0, 7)}${sorumlu ? `&sorumlu=${sorumlu}` : ""}`}
              aria-label={etiket}
              title={etiket}
              className={cn(
                "group flex h-16 flex-col items-center gap-1 rounded-lg px-0.5 pt-1 pb-1 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                // Hafta sonu: metni soluklaştırmak kontrastı düşürür; zeminle ayrılır
                haftaSonu && "bg-muted/30",
                bugun && "ring-1 ring-primary/40"
              )}
            >
              <span className="flex w-full flex-1 items-end justify-center">
                <span
                  className={cn(
                    "w-3/5 max-w-5 rounded-sm bg-primary/70 transition-colors group-hover:bg-primary",
                    adet === 0 && "bg-border group-hover:bg-border"
                  )}
                  style={{
                    height: adet
                      ? `${Math.max(12, (adet / enFazla) * 100)}%`
                      : 2,
                  }}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] leading-none tabular-nums",
                  bugun ? "font-semibold text-link" : "text-muted-foreground"
                )}
              >
                {format(gun, "d")}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
