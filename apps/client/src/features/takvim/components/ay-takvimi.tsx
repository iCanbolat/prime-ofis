import { useMemo } from "react"
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { tr } from "date-fns/locale"

import {
  YUKUMLULUK_SIRASI,
  YUKUMLULUK_TANIMLARI,
} from "@prime/shared/takvim/kurallar"
import { TATIL_HARITASI } from "@prime/shared/takvim/tatiller"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { cn } from "@/lib/utils"
import type { TakvimOlayi } from "@prime/shared/types/api"
import type { YukumlulukTip } from "@prime/shared/types/domain"

const GUN_ADLARI = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
const HAFTA = { weekStartsOn: 1 } as const
const MAKS_CIP = 3

interface AyTakvimiProps {
  /** "2026-09" */
  ay: string
  bugun: string
  olaylar: TakvimOlayi[]
  onGunSec: (tarih: string) => void
}

export function AyTakvimi({ ay, bugun, olaylar, onGunSec }: AyTakvimiProps) {
  const gunler = useMemo(() => {
    const ayBas = fromYmd(`${ay}-01`)
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(ayBas), HAFTA),
      end: endOfWeek(endOfMonth(ayBas), HAFTA),
    }).map(toYmd)
  }, [ay])

  const gunlukOlaylar = useMemo(() => {
    const map = new Map<string, TakvimOlayi[]>()
    for (const o of olaylar)
      map.set(o.sonTarih, [...(map.get(o.sonTarih) ?? []), o])
    return map
  }, [olaylar])

  return (
    <div
      className="overflow-hidden rounded-3xl border"
      role="group"
      aria-label="Aylık takvim"
    >
      <div className="grid grid-cols-7 border-b bg-muted/40" aria-hidden="true">
        {GUN_ADLARI.map((g) => (
          <div
            key={g}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {g}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {gunler.map((tarih) => {
          const gunOlaylari = gunlukOlaylar.get(tarih) ?? []
          const ayDisi = !tarih.startsWith(ay)
          const tatil = TATIL_HARITASI.get(tarih)
          const geciken = gunOlaylari.filter((o) => o.gecikti).length
          const acik = gunOlaylari.filter((o) => o.durum !== "ONAYLANDI").length

          const tipSayilari = new Map<YukumlulukTip, number>()
          for (const o of gunOlaylari)
            tipSayilari.set(o.tip, (tipSayilari.get(o.tip) ?? 0) + 1)
          const tipler = YUKUMLULUK_SIRASI.filter((t) => tipSayilari.has(t))

          const etiket = [
            format(fromYmd(tarih), "d MMMM EEEE", { locale: tr }),
            tatil,
            gunOlaylari.length > 0
              ? `${gunOlaylari.length} yükümlülük`
              : "yükümlülük yok",
            geciken > 0 ? `${geciken} gecikmiş` : null,
          ]
            .filter(Boolean)
            .join(", ")

          return (
            <button
              key={tarih}
              type="button"
              aria-label={etiket}
              aria-current={tarih === bugun ? "date" : undefined}
              disabled={gunOlaylari.length === 0}
              onClick={() => onGunSec(tarih)}
              className={cn(
                "flex min-h-20 flex-col gap-1 border-r border-b p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset sm:min-h-28 sm:p-2 [&:nth-child(7n)]:border-r-0",
                ayDisi && "bg-muted/30 text-muted-foreground",
                gunOlaylari.length > 0 && "hover:bg-muted/60",
                (tatil || isWeekend(fromYmd(tarih))) && !ayDisi && "bg-muted/20"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                    tarih === bugun && "bg-primary text-primary-foreground"
                  )}
                >
                  {Number(tarih.slice(8))}
                </span>
                {acik > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold tabular-nums sm:hidden",
                      geciken > 0
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted"
                    )}
                  >
                    {acik}
                  </span>
                )}
              </div>
              {tatil && (
                <span className="line-clamp-1 text-[10px] text-muted-foreground">
                  {tatil}
                </span>
              )}
              <div className="hidden flex-col gap-0.5 sm:flex">
                {tipler.slice(0, MAKS_CIP).map((tip) => (
                  <span
                    key={tip}
                    className={cn(
                      "truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      YUKUMLULUK_TANIMLARI[tip].renk
                    )}
                  >
                    {YUKUMLULUK_TANIMLARI[tip].kisaAd} · {tipSayilari.get(tip)}
                  </span>
                ))}
                {tipler.length > MAKS_CIP && (
                  <span className="text-[11px] text-muted-foreground">
                    +{tipler.length - MAKS_CIP} tür daha
                  </span>
                )}
                {geciken > 0 && (
                  <span className="text-[11px] font-medium text-destructive">
                    {geciken} gecikmiş
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
