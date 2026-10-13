import { Link } from "react-router"
import type { RowSelectionState } from "@tanstack/react-table"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AktifBadge,
  MukellefTurBadge,
} from "@/features/mukellef/components/mukellef-badges"
import { maskTaxId } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { Mukellef, Personel } from "@prime/shared/types/domain"

const KART_IZGARASI = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"

/** Mükellef listesinin ızgara görünümü; seçim durumu tabloyla ortaktır. */
export function MukellefKartlari({
  data,
  personelById,
  rowSelection,
  onRowSelectionChange,
  isLoading,
}: {
  data: Mukellef[]
  personelById: Map<string, Personel>
  rowSelection: RowSelectionState
  onRowSelectionChange: (next: RowSelectionState) => void
  isLoading: boolean
}) {
  if (isLoading && data.length === 0)
    return (
      <div className={KART_IZGARASI} aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>
    )

  const sec = (id: string, secili: boolean) => {
    const next = { ...rowSelection }
    if (secili) next[id] = true
    else delete next[id]
    onRowSelectionChange(next)
  }

  return (
    <ul className={KART_IZGARASI} role="list" aria-label="Mükellefler">
      {data.map((m) => {
        const sorumlu = personelById.get(m.sorumluPersonelId)
        const secili = Boolean(rowSelection[m.id])
        return (
          <li
            key={m.id}
            data-state={secili ? "selected" : undefined}
            className={cn(
              "relative flex flex-col gap-3 rounded-3xl border bg-card p-4 transition-colors has-[a:hover]:bg-muted/40",
              secili && "border-primary/40 bg-primary/5"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <Link
                  to={`/mukellefler/${m.id}`}
                  className="line-clamp-2 font-medium after:absolute after:inset-0 after:rounded-3xl hover:underline"
                >
                  {m.unvan}
                </Link>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {maskTaxId(m.vkn ?? m.tckn)} · {m.vergiDairesi}
                </span>
              </div>
              {/* Kart linkinin üstünde kalsın */}
              <Checkbox
                className="relative z-10 mt-0.5"
                aria-label={`${m.unvan} seç`}
                checked={secili}
                onCheckedChange={(checked) => sec(m.id, checked)}
              />
            </div>
            <div className="mt-auto flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <MukellefTurBadge tur={m.tur} />
                <AktifBadge aktif={m.aktif} />
              </div>
              {sorumlu && (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <PersonelAvatar personel={sorumlu} size="sm" />
                  <span className="truncate">
                    {sorumlu.ad} {sorumlu.soyad}
                  </span>
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
