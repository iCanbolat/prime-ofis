import { UserGroupIcon } from "@hugeicons/core-free-icons"

import { EmptyState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BordroDurumBadge,
  BordroUyariBadge,
} from "@/features/bordro/components/bordro-rozetleri"
import { kalanMetin } from "@/features/bordro/gorunum"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import type { BordroSatiri } from "@prime/shared/types/api"

/**
 * Mükellef × dönem bordro satırları. `gosterMukellef` kapalıysa (mükellef sekmesi) ilk sütun
 * dönemi gösterir.
 */
export function BordroListesi({
  satirlar,
  gosterMukellef = true,
  onSec,
  onPuantajIste,
}: {
  satirlar: BordroSatiri[]
  gosterMukellef?: boolean
  onSec: (satir: BordroSatiri) => void
  onPuantajIste?: (satir: BordroSatiri) => void
}) {
  if (satirlar.length === 0)
    return (
      <EmptyState
        icon={UserGroupIcon}
        title="Bordro kaydı yok"
        description="Çalışanı veya SGK işyeri kaydı olan mükellefler burada listelenir."
      />
    )

  return (
    <div className="overflow-x-auto rounded-2xl border">
      <Table aria-label="Bordro takibi">
        <TableHeader>
          <TableRow>
            <TableHead>{gosterMukellef ? "Mükellef" : "Dönem"}</TableHead>
            <TableHead className="hidden md:table-cell">Çalışan</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="hidden lg:table-cell">
              MUHSGK son gün
            </TableHead>
            <TableHead className="hidden text-right xl:table-cell">
              Brüt toplam
            </TableHead>
            {onPuantajIste && (
              <TableHead className="text-right">
                <span className="sr-only">İşlemler</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {satirlar.map((s) => {
            const baslik = gosterMukellef
              ? s.mukellefUnvan
              : formatDonem(s.donem)
            return (
              <TableRow
                key={`${s.mukellefId}:${s.donem}`}
                aria-label={`${s.mukellefUnvan} ${formatDonem(s.donem)} bordro`}
                className="cursor-pointer"
                onClick={() => onSec(s)}
              >
                <TableCell className="max-w-0 min-w-32 sm:min-w-48">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSec(s)
                    }}
                    className="grid w-full min-w-0 text-left leading-snug"
                  >
                    <span className="truncate font-medium">{baslik}</span>
                    {gosterMukellef && (
                      <span className="truncate text-xs text-muted-foreground">
                        {formatDonem(s.donem)}
                      </span>
                    )}
                  </button>
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {s.ozet?.calisanSayisi ?? s.calisanSayisi}
                </TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <BordroDurumBadge durum={s.durum} />
                    <BordroUyariBadge uyari={s.uyari} />
                  </span>
                  {s.degisiklikYok && (
                    <span className="block text-xs text-muted-foreground">
                      Değişiklik yok
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  <span className="tabular-nums">{formatDate(s.sonTarih)}</span>
                  <span className="block text-xs">{kalanMetin(s)}</span>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums xl:table-cell">
                  {s.ozet ? formatTRY(s.ozet.brutToplam) : "—"}
                </TableCell>
                {onPuantajIste && (
                  <TableCell className="text-right">
                    {s.durum === "BEKLENIYOR" && !s.girdiTalepId && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          onPuantajIste(s)
                        }}
                      >
                        Puantaj iste
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
