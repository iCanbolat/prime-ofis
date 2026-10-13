import { Link } from "react-router"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FisDurumBadge,
  FisSorunBadge,
} from "@/features/fis-aktarimi/components/fis-rozetleri"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import type { FisView } from "@prime/shared/types/api"

/** Fiş listesi; açıklamaya tıklanınca düzenleyici açılır */
export function FisTablosu({
  fisler,
  onAc,
  gosterMukellef = true,
  gosterDurum = false,
  ariaLabel = "Muhasebe fişleri",
}: {
  fisler: FisView[]
  onAc: (id: string) => void
  gosterMukellef?: boolean
  gosterDurum?: boolean
  ariaLabel?: string
}) {
  // Onaylı fişlerde sorun rozeti yok; durum da gösterilmiyorsa sütun boş kalır
  const durumSutunu = gosterDurum || fisler.some((f) => f.durum === "TASLAK")
  return (
    <div className="overflow-x-auto rounded-3xl border">
      <Table aria-label={ariaLabel}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Tarih</TableHead>
            {gosterMukellef && <TableHead>Mükellef</TableHead>}
            <TableHead>Fiş</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            {durumSutunu && (
              <TableHead className="hidden sm:table-cell">Durum</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fisler.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="tabular-nums">
                {formatDate(f.tarih)}
              </TableCell>
              {gosterMukellef && (
                <TableCell className="max-w-56">
                  <Link
                    to={`/mukellefler/${f.mukellefId}/fis-aktarimi`}
                    className="block truncate hover:underline"
                  >
                    {f.mukellefUnvan}
                  </Link>
                </TableCell>
              )}
              <TableCell className="max-w-80">
                <button
                  type="button"
                  className="block max-w-full truncate text-left font-medium hover:underline"
                  onClick={() => onAc(f.id)}
                >
                  {f.aciklama}
                  {f.parca && ` (${f.parca})`}
                </button>
                <span className="block truncate text-xs text-muted-foreground">
                  {f.satirlar.length} satır · {f.gelenAd}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatTRY(f.toplam)}
              </TableCell>
              {durumSutunu && (
                <TableCell className="hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {gosterDurum && <FisDurumBadge durum={f.durum} />}
                    {f.durum === "TASLAK" && (
                      <FisSorunBadge
                        hatalar={f.hatalar}
                        uyarilar={f.uyarilar}
                      />
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
