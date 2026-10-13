import { Link } from "react-router"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { BorcKalemleri } from "@/features/borc/components/borc-kalemleri"
import { KamuErisimBadge } from "@/features/borc/components/borc-rozetleri"
import {
  DogrulamaDialog,
  DogrulamaFormu,
} from "@/features/borc/components/dogrulama"
import { useKamuIslem } from "@/features/borc/hooks"
import { useBorcDetay, useBorcSorgula } from "@/features/borc/queries"
import {
  BORC_KURUM_BASLIK,
  KAMU_KURUM_ETIKET,
  KURUM_EKLI,
} from "@prime/shared/borc/sabitler"
import { formatDate, formatDateTime, formatTRY } from "@prime/shared/lib/format"
import type { BorcDetay } from "@prime/shared/types/api"
import type { KamuKurum } from "@prime/shared/types/domain"

/** Erişim yoksa / hatalıysa nereden düzeltileceği */
function ErisimUyarisi({ detay }: { detay: BorcDetay }) {
  const { satir } = detay
  if (satir.erisimDurumu !== "TANIMSIZ" && satir.erisimDurumu !== "HATA")
    return null
  const yol =
    satir.kurum === "GIB"
      ? `/mukellefler/${satir.mukellefId}/tebligat`
      : `/mukellefler/${satir.mukellefId}/borc`
  return (
    <Alert variant={satir.erisimDurumu === "HATA" ? "destructive" : "default"}>
      <AlertTitle>
        {satir.erisimDurumu === "HATA"
          ? `${KAMU_KURUM_ETIKET[satir.kurum]} girişi başarısız`
          : `${KAMU_KURUM_ETIKET[satir.kurum]} erişimi tanımlı değil`}
      </AlertTitle>
      <AlertDescription>
        {satir.kurum === "GIB"
          ? "Vergi borcu, e-Tebligat için tanımlanan İnteraktif VD erişimiyle sorgulanır. "
          : "Prim borcu için SGK İşveren Sistemi erişimi gerekir. "}
        <Link to={yol} className="underline">
          Erişimi düzenle
        </Link>
      </AlertDescription>
    </Alert>
  )
}

export function BorcOzetSatiri({ detay }: { detay: BorcDetay }) {
  const s = detay.satir.sorgu
  if (!s)
    return <p className="text-sm text-muted-foreground">Henüz sorgulanmadı.</p>
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted-foreground">Toplam borç</dt>
        <dd className="font-heading text-lg font-semibold tabular-nums">
          {formatTRY(s.toplam)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Vadesi geçmiş</dt>
        <dd
          className={
            s.vadesiGecmis > 0
              ? "font-heading text-lg font-semibold text-destructive tabular-nums"
              : "font-heading text-lg font-semibold tabular-nums"
          }
        >
          {formatTRY(s.vadesiGecmis)}
        </dd>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <dt className="text-xs text-muted-foreground">Son sorgu</dt>
        <dd className="tabular-nums">
          {formatDateTime(s.sorguTarihi)}
          {s.enEskiVade && (
            <span className="block text-xs text-muted-foreground">
              En eski vade {formatDate(s.enEskiVade)}
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
}

/** Mükellefin bir kurumdaki borç dökümü; detay panelinde ve mükellef kartında ortak */
export function BorcBolumu({
  mukellefId,
  kurum,
  detay,
}: {
  mukellefId: string
  kurum: KamuKurum
  detay: BorcDetay
}) {
  const sorgula = useBorcSorgula()
  const islem = useKamuIslem()
  const sorgulanabilir =
    detay.satir.erisimDurumu === "AKTIF" ||
    detay.satir.erisimDurumu === "DOGRULAMA"

  return (
    <div className="grid gap-4">
      <ErisimUyarisi detay={detay} />
      {detay.dogrulama && <DogrulamaFormu d={detay.dogrulama} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <BorcOzetSatiri detay={detay} />
        {sorgulanabilir && !detay.dogrulama && (
          <Button
            size="sm"
            variant="outline"
            disabled={sorgula.isPending}
            onClick={() =>
              sorgula.mutate(
                { mukellefId, kurum },
                {
                  onSuccess: (r) =>
                    islem.sonuc(r, `${BORC_KURUM_BASLIK[kurum]} sorgulandı`),
                  onError: (error) => toast.error(error.message),
                }
              )
            }
          >
            {sorgula.isPending ? "Sorgulanıyor…" : "Şimdi sorgula"}
          </Button>
        )}
      </div>
      {detay.kalemler.length > 0 ? (
        <BorcKalemleri
          kalemler={detay.kalemler}
          baslik={`${BORC_KURUM_BASLIK[kurum]} kalemleri`}
        />
      ) : (
        detay.satir.sorgu && (
          <p className="text-sm text-muted-foreground">
            {KURUM_EKLI[kurum].de} ödenmemiş borç görünmüyor.
          </p>
        )
      )}
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </div>
  )
}

export function BorcDetaySheet({
  hedef,
  onClose,
}: {
  hedef: { mukellefId: string; kurum: KamuKurum } | null
  onClose: () => void
}) {
  const detay = useBorcDetay(hedef)
  return (
    <Sheet open={Boolean(hedef)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="pr-12">
          <SheetTitle>
            {detay.data?.satir.mukellefUnvan ??
              (hedef ? BORC_KURUM_BASLIK[hedef.kurum] : "")}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {hedef && BORC_KURUM_BASLIK[hedef.kurum]}
            {detay.data && (
              <KamuErisimBadge durum={detay.data.satir.erisimDurumu} />
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-6">
          {detay.isError ? (
            <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
          ) : !detay.data || !hedef ? (
            <LoadingState />
          ) : (
            <>
              <BorcBolumu
                mukellefId={hedef.mukellefId}
                kurum={hedef.kurum}
                detay={detay.data}
              />
              <Link
                to={`/mukellefler/${hedef.mukellefId}/borc`}
                className="text-sm underline"
              >
                Mükellef kartında aç
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
