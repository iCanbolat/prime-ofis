import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { FileExportIcon } from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fisAktarimiApi } from "@/features/fis-aktarimi/api"
import { useLucaIndir } from "@/features/fis-aktarimi/hooks/use-luca-indir"
import {
  useLucaAktarimlari,
  useLucaGeriAl,
} from "@/features/fis-aktarimi/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { LucaAktarimView } from "@prime/shared/types/api"

/** Geçmiş Luca dosyaları: yeniden indirilebilir; Luca reddettiyse geri alınıp fişler düzeltilir */
export function AktarimlarPage({ mukellefId }: { mukellefId?: string }) {
  const aktarimlar = useLucaAktarimlari({ mukellefId })
  const geriAl = useLucaGeriAl()
  const indir = useLucaIndir()
  const [geriAlinacak, setGeriAlinacak] = useState<LucaAktarimView | null>(null)

  const yenidenIndir = async (a: LucaAktarimView) => {
    try {
      await indir(await fisAktarimiApi.aktarim(a.id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (aktarimlar.isPending) return <LoadingState />
  if (aktarimlar.isError)
    return (
      <ErrorState
        error={aktarimlar.error}
        onRetry={() => aktarimlar.refetch()}
      />
    )
  if (aktarimlar.data.length === 0)
    return (
      <EmptyState
        icon={FileExportIcon}
        title="Henüz Luca aktarımı yapılmadı"
        description="Aktarıma hazır fişlerden indirdiğiniz Luca Excel dosyaları burada listelenir."
      />
    )

  return (
    <>
      <div className="overflow-x-auto rounded-3xl border">
        <Table aria-label="Luca aktarımları">
          <TableHeader>
            <TableRow>
              <TableHead>Dosya</TableHead>
              {!mukellefId && <TableHead>Mükellef</TableHead>}
              <TableHead className="text-right">Fiş</TableHead>
              <TableHead className="hidden xl:table-cell">Oluşturan</TableHead>
              <TableHead>
                <span className="sr-only">İşlemler</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aktarimlar.data.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="max-w-72">
                  <span className="block truncate font-medium">
                    {a.dosyaAdi}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(a.tarih)}
                    {a.geriAlindi && (
                      <Badge variant="outline">Geri alındı</Badge>
                    )}
                  </span>
                </TableCell>
                {!mukellefId && (
                  <TableCell className="max-w-56">
                    <Link
                      to={`/mukellefler/${a.mukellefId}/fis-aktarimi`}
                      className="block truncate hover:underline"
                    >
                      {a.mukellefUnvan}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {a.fisIdleri.length}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {a.olusturan}
                </TableCell>
                <TableCell>
                  {!a.geriAlindi && (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${a.dosyaAdi} dosyasını yeniden indir`}
                        onClick={() => yenidenIndir(a)}
                      >
                        İndir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${a.dosyaAdi} aktarımını geri al`}
                        onClick={() => setGeriAlinacak(a)}
                      >
                        Geri al
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={Boolean(geriAlinacak)}
        onOpenChange={(open) => !open && setGeriAlinacak(null)}
        title="Aktarım geri alınsın mı?"
        description="Dosyadaki fişler yeniden “Aktarıma hazır” olur; taslağa alıp düzeltebilirsiniz. Luca'ya yüklediyseniz fişleri Luca'dan da silin."
        confirmLabel="Geri al"
        destructive
        pending={geriAl.isPending}
        onConfirm={() =>
          geriAlinacak &&
          geriAl.mutate(geriAlinacak.id, {
            onSuccess: () => {
              toast.success("Aktarım geri alındı")
              setGeriAlinacak(null)
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  )
}
