import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HucreIkonu } from "@/features/kasa/components/kasa-kartlari"
import { HUCRE_ETIKET, type KasaSatiri } from "@prime/shared/kasa/matris"
import { SISTEMLER, SISTEM_SIRASI } from "@prime/shared/kasa/sistemler"
import { MukellefTurBadge } from "@/features/mukellef/components/mukellef-badges"
import { cn } from "@/lib/utils"
import type { Mukellef } from "@prime/shared/types/domain"

/** Kasa tamamlanma matrisinin tablo görünümü (geniş ekran) */
export function KasaTablosu({
  satirlar,
  onSec,
}: {
  satirlar: KasaSatiri[]
  onSec: (mukellef: Mukellef) => void
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border">
      <Table aria-label="Şifre kasası tamamlanma tablosu">
        <TableHeader>
          <TableRow>
            <TableHead>Mükellef</TableHead>
            {SISTEM_SIRASI.map((s) => (
              <TableHead key={s} className="text-center">
                {SISTEMLER[s].ad}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {satirlar.map(({ mukellef, hucreler }) => (
            <TableRow key={mukellef.id}>
              <TableCell className="max-w-72">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    to={`/mukellefler/${mukellef.id}/sifreler`}
                    className="truncate font-medium hover:underline"
                  >
                    {mukellef.unvan}
                  </Link>
                  <MukellefTurBadge tur={mukellef.tur} />
                </div>
              </TableCell>
              {SISTEM_SIRASI.map((s) => {
                const durum = hucreler[s]
                return (
                  <TableCell key={s} className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${mukellef.unvan} ${SISTEMLER[s].ad}: ${HUCRE_ETIKET[durum]}`}
                      onClick={() => onSec(mukellef)}
                      className={cn(
                        durum === "eksik" &&
                          "text-amber-800 dark:text-amber-300",
                        durum === "gerekmez" && "text-muted-foreground"
                      )}
                    >
                      <HucreIkonu durum={durum} />
                      <span
                        className={cn(
                          durum === "kayitli" && "sr-only sm:not-sr-only"
                        )}
                      >
                        {HUCRE_ETIKET[durum]}
                      </span>
                    </Button>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
