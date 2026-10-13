import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FaturaDurumRozetleri } from "@/features/e-belge/components/ebelge-rozetleri"
import { formatTutar } from "@prime/shared/e-belge/kurallar"
import {
  EBELGE_YON_ETIKET,
  FATURA_TIPI_ETIKET,
} from "@prime/shared/e-belge/sabitler"
import { formatDate } from "@prime/shared/lib/format"
import type { EBelgeView } from "@prime/shared/types/api"

const IZGARA = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"

/** Fatura listesinin ızgara görünümü; kart tıklanınca detay paneli açılır. */
export function FaturaKartlari({
  data,
  isLoading,
  onAc,
  mukellefGoster = true,
  yonGoster = true,
}: {
  data: EBelgeView[]
  isLoading: boolean
  onAc: (id: string) => void
  mukellefGoster?: boolean
  yonGoster?: boolean
}) {
  if (isLoading && data.length === 0)
    return (
      <div className={IZGARA} aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-3xl" />
        ))}
      </div>
    )

  return (
    <ul className={IZGARA} role="list" aria-label="Faturalar">
      {data.map((f) => (
        <li
          key={f.id}
          className="relative flex flex-col gap-3 rounded-3xl border bg-card p-4 transition-colors has-[button:hover]:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <button
                type="button"
                onClick={() => onAc(f.id)}
                aria-label={`${f.belgeNo} faturasını aç`}
                className="w-fit text-left font-mono text-xs font-medium tabular-nums after:absolute after:inset-0 after:rounded-3xl hover:underline"
              >
                {f.belgeNo}
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(f.duzenlemeTarihi)}
              </span>
            </div>
            <span className="shrink-0 text-right font-medium tabular-nums">
              {formatTutar(f.toplam, f.paraBirimi)}
            </span>
          </div>

          <div className="grid min-w-0 gap-0.5 text-sm">
            <span className="truncate">{f.karsiTaraf.unvan}</span>
            {mukellefGoster && (
              <Link
                to={`/mukellefler/${f.mukellefId}/e-belge`}
                className="relative z-10 w-fit truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {f.mukellefUnvan}
              </Link>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-1">
            {yonGoster && (
              <Badge variant="outline">{EBELGE_YON_ETIKET[f.yon]}</Badge>
            )}
            {f.faturaTipi !== "SATIS" && (
              <Badge variant="outline">
                {FATURA_TIPI_ETIKET[f.faturaTipi]}
              </Badge>
            )}
            <FaturaDurumRozetleri f={f} />
          </div>
        </li>
      ))}
    </ul>
  )
}
