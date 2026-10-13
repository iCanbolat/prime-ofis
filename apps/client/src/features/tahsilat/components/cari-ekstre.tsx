import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, Invoice02Icon } from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
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
import { hasRole, useAuthStore } from "@/features/auth/store"
import { KALEM_ETIKET } from "@prime/shared/tahsilat/sabitler"
import { useHareketSil } from "@/features/tahsilat/queries"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { CariEkstreResponse, CariHareketView } from "@prime/shared/types/api"

/** Borç / alacak ekstresi, yeniden eskiye; yürüyen bakiyeyle */
export function CariEkstre({ ekstre }: { ekstre: CariEkstreResponse }) {
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])
  const sil = useHareketSil()
  const [silinecek, setSilinecek] = useState<CariHareketView | null>(null)
  const satirlar = [...ekstre.hareketler].reverse()

  if (satirlar.length === 0)
    return (
      <EmptyState
        icon={Invoice02Icon}
        title="Cari hareket yok"
        description="Aylık ücret tanımlanınca her ay otomatik borç oluşur."
      />
    )

  return (
    <>
      <div className="overflow-x-auto rounded-3xl border">
        <Table aria-label="Cari hesap ekstresi">
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Açıklama</TableHead>
              <TableHead className="text-right">Borç</TableHead>
              <TableHead className="text-right">Alacak</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Bakiye
              </TableHead>
              {yonetici && (
                <TableHead className="w-10">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {satirlar.map((h) => {
              const borc = h.tip === "BORC"
              const kismi =
                borc &&
                h.kalan !== undefined &&
                h.kalan > 0 &&
                h.kalan < h.tutar
              return (
                <TableRow key={h.id}>
                  <TableCell className="align-top text-muted-foreground tabular-nums">
                    {formatDate(h.tarih)}
                  </TableCell>
                  <TableCell className="max-w-72 align-top whitespace-normal">
                    <span className="block font-medium">
                      {h.aciklama ?? KALEM_ETIKET[h.kalem]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {KALEM_ETIKET[h.kalem]}
                      {borc &&
                        h.stopaj > 0 &&
                        ` · brüt ${formatTRY(h.brut)}, stopaj ${formatTRY(h.stopaj)}`}
                      {h.makbuzNo && ` · makbuz ${h.makbuzNo}`}
                      {` · ${h.olusturanAd}`}
                    </span>
                    {kismi && (
                      <span className="block text-xs text-amber-800 dark:text-amber-300">
                        Kalan {formatTRY(h.kalan!)}
                      </span>
                    )}
                    {!borc && !!h.dagitilmamis && h.dagitilmamis > 0 && (
                      <span className="block text-xs text-sky-700 dark:text-sky-300">
                        {formatTRY(h.dagitilmamis)} avans
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {borc ? formatTRY(h.tutar) : ""}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {borc ? "" : formatTRY(h.tutar)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "hidden text-right align-top font-medium tabular-nums sm:table-cell",
                      h.bakiyeSonrasi < 0 && "text-sky-700 dark:text-sky-300"
                    )}
                  >
                    {formatTRY(h.bakiyeSonrasi)}
                  </TableCell>
                  {yonetici && (
                    <TableCell className="align-top">
                      {h.kalem !== "AYLIK_UCRET" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${h.aciklama ?? KALEM_ETIKET[h.kalem]} kaydını sil`}
                          onClick={() => setSilinecek(h)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
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
      <ConfirmDialog
        open={Boolean(silinecek)}
        onOpenChange={(o) => !o && setSilinecek(null)}
        title="Cari hareket silinsin mi?"
        description={
          silinecek?.tip === "BORC"
            ? "Borç silinir; bu borcu kapatan ödemeler avansa döner ve diğer açık borçlara dağıtılır."
            : "Ödeme silinir; kapattığı borçlar yeniden açık görünür."
        }
        confirmLabel="Sil"
        destructive
        pending={sil.isPending}
        onConfirm={async () => {
          if (!silinecek) return
          try {
            await sil.mutateAsync(silinecek.id)
            toast.success("Hareket silindi")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Silinemedi")
          }
          setSilinecek(null)
        }}
      />
    </>
  )
}
