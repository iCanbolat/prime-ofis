import type { ReactNode } from "react"
import { InboxUploadIcon } from "@hugeicons/core-free-icons"

import { EmptyState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TalepDurumBadge } from "@/features/evrak-talebi/components/talep-rozetleri"
import {
  ISTENEN_EVRAKLAR,
  KANAL_ETIKET,
} from "@prime/shared/evrak-talebi/sabitler"
import { formatDate, formatDonem } from "@prime/shared/lib/format"
import type { TalepView } from "@prime/shared/types/api"

export function TalepListesi({
  talepler,
  gosterMukellef = true,
  onSec,
  bosAksiyon,
}: {
  talepler: TalepView[]
  gosterMukellef?: boolean
  onSec: (id: string) => void
  bosAksiyon?: ReactNode
}) {
  if (talepler.length === 0)
    return (
      <EmptyState
        icon={InboxUploadIcon}
        title="Evrak talebi yok"
        action={bosAksiyon}
      />
    )

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table aria-label="Evrak talepleri">
        <TableHeader>
          <TableRow>
            <TableHead>{gosterMukellef ? "Mükellef" : "İstenenler"}</TableHead>
            {gosterMukellef && (
              <TableHead className="hidden lg:table-cell">İstenenler</TableHead>
            )}
            <TableHead className="hidden md:table-cell">Dönem</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="hidden sm:table-cell">Son gün</TableHead>
            <TableHead className="text-right">Yükleme</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {talepler.map((t) => {
            const istenenler = t.istenenler
              .map((i) => ISTENEN_EVRAKLAR[i].ad)
              .join(", ")
            return (
              <TableRow
                key={t.id}
                aria-label={`${t.mukellefUnvan} evrak talebi`}
                className="cursor-pointer"
                onClick={() => onSec(t.id)}
              >
                <TableCell className="max-w-0 min-w-32 sm:min-w-48">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSec(t.id)
                    }}
                    className="grid w-full min-w-0 text-left leading-snug"
                  >
                    <span className="truncate font-medium">
                      {gosterMukellef ? t.mukellefUnvan : istenenler}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {KANAL_ETIKET[t.kanal]} · {formatDate(t.olusturmaTarihi)}
                      {gosterMukellef && (
                        <span className="lg:hidden"> · {istenenler}</span>
                      )}
                    </span>
                  </button>
                </TableCell>
                {gosterMukellef && (
                  <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">
                    {istenenler}
                  </TableCell>
                )}
                <TableCell className="hidden md:table-cell">
                  {t.donem ? formatDonem(t.donem) : "—"}
                </TableCell>
                <TableCell>
                  <TalepDurumBadge durum={t.durum} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                  {formatDate(t.sonKullanma)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {t.bekleyenSayisi > 0 && (
                      <Badge
                        variant="secondary"
                        className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        title="İnceleme bekleyen"
                      >
                        {t.bekleyenSayisi} yeni
                      </Badge>
                    )}
                    {t.yuklemeSayisi}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
