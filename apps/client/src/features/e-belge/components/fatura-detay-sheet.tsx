import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  FolderLibraryIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"

import { ButtonLink } from "@/components/shared/button-link"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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
  OnizlemeDialog,
  type OnizlenecekDosya,
} from "@/features/arsiv/components/onizleme-dialog"
import { usePersonelList } from "@/features/auth/queries"
import {
  GibDurumBadge,
  YanitBadge,
} from "@/features/e-belge/components/ebelge-rozetleri"
import {
  formatTutar,
  yanitlanabilirMi,
  yanitSonTarihi,
} from "@prime/shared/e-belge/kurallar"
import { useArsiveKaydet, useFatura } from "@/features/e-belge/queries"
import {
  EBELGE_TUR_ETIKET,
  EBELGE_YON_ETIKET,
  FATURA_TIPI_ETIKET,
  SENARYO_ETIKET,
} from "@prime/shared/e-belge/sabitler"
import { formatDate, formatDateTime } from "@prime/shared/lib/format"
import type { EBelgeDetay } from "@prime/shared/types/api"

function Bilgi({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiket}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  )
}

function Icerik({ fatura }: { fatura: EBelgeDetay }) {
  const personel = usePersonelList()
  const arsiveKaydet = useArsiveKaydet()
  const [onizle, setOnizle] = useState<OnizlenecekDosya | null>(null)

  const yanitlayan = personel.data?.find((p) => p.id === fatura.yanitlayanId)
  const yanitlanabilir = yanitlanabilirMi(fatura)

  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setOnizle({
              id: fatura.id,
              ad: `${fatura.belgeNo}.pdf`,
              mimeType: "application/pdf",
              aciklama: `${fatura.karsiTaraf.unvan} · ${formatDate(fatura.duzenlemeTarihi)}`,
              kaynak: "ebelge",
            })
          }
        >
          <HugeiconsIcon
            icon={ViewIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Görüntüle
        </Button>
        {fatura.arsivDosyaId ? (
          <ButtonLink
            size="sm"
            variant="outline"
            to={`/arsiv?mukellef=${fatura.mukellefId}&kategori=FATURA`}
          >
            <HugeiconsIcon
              icon={FolderLibraryIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Arşivde
          </ButtonLink>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={arsiveKaydet.isPending}
            onClick={() =>
              arsiveKaydet.mutate(fatura.id, {
                onSuccess: () =>
                  toast.success("Fatura mükellefin arşivine kaydedildi"),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <HugeiconsIcon
              icon={Archive02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Arşive kaydet
          </Button>
        )}
      </div>

      {yanitlanabilir && (
        <Alert>
          <AlertTitle>Ticari fatura yanıtı bekleniyor</AlertTitle>
          <AlertDescription className="grid gap-3">
            <span>
              Son gün{" "}
              {formatDateTime(
                yanitSonTarihi(fatura.alinmaTarihi).toISOString()
              )}
              . Süre içinde yanıt verilmezse fatura kabul edilmiş sayılır.
            </span>
            <span>
              Kabul veya red yanıtını Luca'da verin; yanıt bir sonraki senkronda
              buraya yansır.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-4">
        <Bilgi etiket="Mükellef">
          <Link
            to={`/mukellefler/${fatura.mukellefId}/e-belge`}
            className="text-link hover:underline"
          >
            {fatura.mukellefUnvan}
          </Link>
        </Bilgi>
        <Bilgi etiket={fatura.yon === "GELEN" ? "Satıcı" : "Alıcı"}>
          {fatura.karsiTaraf.unvan}
          <span className="block font-mono text-xs text-muted-foreground tabular-nums">
            {fatura.karsiTaraf.vknTckn}
          </span>
        </Bilgi>
        <Bilgi etiket="Düzenleme tarihi">
          {formatDate(fatura.duzenlemeTarihi)}
        </Bilgi>
        <Bilgi etiket={fatura.yon === "GELEN" ? "Alınma" : "Gönderim"}>
          {formatDateTime(fatura.alinmaTarihi)}
        </Bilgi>
        <Bilgi etiket="Senaryo / tip">
          {SENARYO_ETIKET[fatura.senaryo]} ·{" "}
          {FATURA_TIPI_ETIKET[fatura.faturaTipi]}
        </Bilgi>
        <Bilgi etiket="GİB durumu">
          <GibDurumBadge durum={fatura.gibDurumu} />
        </Bilgi>
        {fatura.yanit && (
          <Bilgi etiket="Yanıt">
            <span className="grid gap-1">
              <YanitBadge
                yanit={fatura.yanit}
                kalanGun={fatura.yanitKalanGun}
                className="w-fit"
              />
              {yanitlayan && fatura.yanitTarihi && (
                <span className="text-xs text-muted-foreground">
                  {yanitlayan.ad} {yanitlayan.soyad} ·{" "}
                  {formatDateTime(fatura.yanitTarihi)}
                </span>
              )}
            </span>
          </Bilgi>
        )}
        <div className="col-span-2">
          <Bilgi etiket="ETTN">
            <span className="font-mono text-xs">{fatura.ettn}</span>
          </Bilgi>
        </div>
        {fatura.redNedeni && (
          <div className="col-span-2 rounded-xl bg-destructive/5 p-3">
            <Bilgi etiket="Red nedeni">{fatura.redNedeni}</Bilgi>
          </div>
        )}
      </dl>

      <Separator />

      <section aria-label="Fatura kalemleri" className="grid gap-3">
        <h3 className="text-sm font-medium">Kalemler</h3>
        <div className="overflow-x-auto rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mal / hizmet</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                <TableHead className="text-right">KDV</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fatura.kalemler.map((k) => (
                <TableRow key={k.sira}>
                  <TableCell className="whitespace-normal">
                    {k.ad}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      Birim fiyat {formatTutar(k.birimFiyat, fatura.paraBirimi)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k.miktar} {k.birim}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    %{k.kdvOrani}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTutar(k.tutar, fatura.paraBirimi)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
          <dt className="text-muted-foreground">Matrah</dt>
          <dd className="text-right">
            {formatTutar(fatura.matrah, fatura.paraBirimi)}
          </dd>
          <dt className="text-muted-foreground">
            {fatura.faturaTipi === "TEVKIFAT"
              ? "KDV (tevkifat sonrası)"
              : "KDV"}
          </dt>
          <dd className="text-right">
            {formatTutar(fatura.kdv, fatura.paraBirimi)}
          </dd>
          <dt className="font-medium">Ödenecek</dt>
          <dd className="text-right font-semibold">
            {formatTutar(fatura.toplam, fatura.paraBirimi)}
          </dd>
        </dl>
      </section>

      <OnizlemeDialog dosya={onizle} onClose={() => setOnizle(null)} />
    </div>
  )
}

export function FaturaDetaySheet({
  faturaId,
  onClose,
}: {
  faturaId: string | undefined
  onClose: () => void
}) {
  const detay = useFatura(faturaId)
  const f = detay.data
  return (
    <Sheet open={Boolean(faturaId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-mono">
            {f?.belgeNo ?? "Fatura"}
          </SheetTitle>
          <SheetDescription
            render={<div />}
            className="flex flex-wrap items-center gap-2"
          >
            {f && (
              <>
                <Badge variant="outline">{EBELGE_TUR_ETIKET[f.tur]}</Badge>
                <Badge variant="outline">{EBELGE_YON_ETIKET[f.yon]}</Badge>
                <span className="font-medium text-foreground tabular-nums">
                  {formatTutar(f.toplam, f.paraBirimi)}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        {detay.isError ? (
          <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
        ) : f ? (
          <Icerik fatura={f} />
        ) : (
          <LoadingState />
        )}
      </SheetContent>
    </Sheet>
  )
}
