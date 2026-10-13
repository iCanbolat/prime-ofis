import { ErrorState, LoadingState } from "@/components/shared/query-states"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  KontrolBadge,
  MizanSonucBadge,
} from "@/features/ice-aktarim/components/mizan-rozetleri"
import { bakiye } from "@prime/shared/ice-aktarim/mizan"
import { useMizan } from "@/features/ice-aktarim/queries"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { MizanKontrol, MizanKontrolDurumu } from "@prime/shared/types/domain"

const SIRA: Record<MizanKontrolDurumu, number> = { HATA: 0, UYARI: 1, GECTI: 2 }

export function KontrolListesi({ kontroller }: { kontroller: MizanKontrol[] }) {
  return (
    <ul aria-label="Mizan kontrolleri" className="grid gap-2">
      {[...kontroller]
        .sort((a, b) => SIRA[a.durum] - SIRA[b.durum])
        .map((k) => (
          <li
            key={k.kod}
            className="flex items-start justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2"
          >
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">{k.baslik}</span>
              {k.aciklama && (
                <span className="text-xs text-muted-foreground">
                  {k.aciklama}
                </span>
              )}
            </div>
            <KontrolBadge durum={k.durum} />
          </li>
        ))}
    </ul>
  )
}

function Icerik({ id }: { id: string }) {
  const mizan = useMizan(id)
  if (mizan.isPending) return <LoadingState />
  if (mizan.isError)
    return <ErrorState error={mizan.error} onRetry={() => mizan.refetch()} />
  const z = mizan.data
  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          ["Toplam borç", formatTRY(z.ozet.toplamBorc)],
          ["Toplam alacak", formatTRY(z.ozet.toplamAlacak)],
          [
            z.ozet.donemSonucu >= 0 ? "Dönem kârı" : "Dönem zararı",
            formatTRY(Math.abs(z.ozet.donemSonucu)),
          ],
        ].map(([etiket, deger]) => (
          <div
            key={etiket}
            className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2"
          >
            <dt className="text-xs text-muted-foreground">{etiket}</dt>
            <dd className="font-medium tabular-nums">{deger}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">Kontroller</h3>
        <KontrolListesi kontroller={z.kontroller} />
      </section>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">
          Ana hesaplar ({z.hesaplar.length})
        </h3>
        <div className="overflow-x-auto rounded-2xl border">
          <Table aria-label="Mizan hesapları">
            <TableHeader>
              <TableRow>
                <TableHead>Hesap</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Borç
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Alacak
                </TableHead>
                <TableHead className="text-right">Bakiye</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {z.hesaplar.map((h) => {
                const b = bakiye(h)
                return (
                  <TableRow key={h.kod}>
                    <TableCell className="max-w-56 whitespace-normal">
                      <span className="font-mono tabular-nums">{h.kod}</span>{" "}
                      <span className="text-muted-foreground">{h.ad}</span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatTRY(h.borc)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatTRY(h.alacak)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        b < 0 && "text-muted-foreground"
                      )}
                    >
                      {formatTRY(Math.abs(b))} {b > 0 ? "B" : b < 0 ? "A" : ""}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}

export function MizanDetaySheet({
  mizan,
  onClose,
}: {
  mizan: {
    id: string
    mukellefUnvan: string
    donem: string
    kontroller: MizanKontrol[]
  } | null
  onClose: () => void
}) {
  return (
    <Sheet open={Boolean(mizan)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        {mizan && (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle>
                {mizan.mukellefUnvan} · {formatDonem(mizan.donem)} mizanı
              </SheetTitle>
              <SheetDescription render={<div />}>
                <MizanSonucBadge kontroller={mizan.kontroller} />
              </SheetDescription>
            </SheetHeader>
            <Icerik id={mizan.id} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
