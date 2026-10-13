import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import type { BorcKalemiView } from "@prime/shared/types/api"

/** Borç dökümü; tahakkukla eşleşen kalemde "tahakkuk var, ödenmemiş" notu */
export function BorcKalemleri({
  kalemler,
  baslik,
}: {
  kalemler: BorcKalemiView[]
  baslik: string
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <Table aria-label={baslik}>
        <TableHeader>
          <TableRow>
            <TableHead>Kalem</TableHead>
            <TableHead>Vade</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Asıl
            </TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Gecikme
            </TableHead>
            <TableHead className="text-right">Toplam</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kalemler.map((k, i) => (
            <TableRow key={`${k.tur}-${k.donem}-${k.vade}-${i}`}>
              <TableCell className="max-w-56 whitespace-normal">
                <span className="block font-medium">{k.tur}</span>
                <span className="block text-xs text-muted-foreground">
                  {k.donem ? donemEtiketi(k.donem) : "Dönemsiz"}
                  {k.yukumlulukTip &&
                    (k.tahakkukId
                      ? " · tahakkuk var, ödenmemiş"
                      : " · tahakkuku içe aktarılmamış")}
                </span>
              </TableCell>
              <TableCell className="tabular-nums">
                <span className="block">{formatDate(k.vade)}</span>
                {k.vadesiGecti && (
                  <Badge
                    variant="secondary"
                    className="bg-destructive/10 text-destructive"
                  >
                    Vadesi geçti
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {formatTRY(k.asil)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {formatTRY(k.gecikme)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatTRY(k.toplam)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
