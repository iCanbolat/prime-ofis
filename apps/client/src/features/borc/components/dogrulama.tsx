import { useId, useState } from "react"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  useDogrulamaCoz,
  useDogrulamalar,
  useDogrulamaYenile,
} from "@/features/borc/queries"
import {
  KAMU_ADIM_ETIKET,
  KAMU_KURUM_ETIKET,
  KURUM_EKLI,
} from "@prime/shared/borc/sabitler"
import { ApiError } from "@/lib/http"
import { formatDateTime } from "@prime/shared/lib/format"
import type { KamuDogrulamaView } from "@prime/shared/types/api"

/**
 * GİB / SGK girişinde çıkan doğrulama ekranı. Kod otomatik çözülmez: personel görseldeki kodu
 * girer, bekleyen sorgular aynı oturumla devam eder. Görselin süresi dolduysa önce yenisi istenir.
 */
export function DogrulamaFormu({
  d,
  onCozuldu,
}: {
  d: KamuDogrulamaView
  onCozuldu?: () => void
}) {
  const id = useId()
  const [kod, setKod] = useState("")
  const [hata, setHata] = useState<string>()
  const coz = useDogrulamaCoz()
  const yenile = useDogrulamaYenile()
  const kurum = KAMU_KURUM_ETIKET[d.kurum]

  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!kod.trim()) {
      setHata("Görseldeki kodu girin")
      return
    }
    coz.mutate(
      { id: d.id, kod },
      {
        onSuccess: (r) => {
          toast.success(r.ozet.join(" · ") || `${kurum} girişi doğrulandı`)
          onCozuldu?.()
        },
        onError: (error) => {
          setKod("")
          setHata(error.message)
          if (!(error instanceof ApiError) || error.status !== 422)
            toast.error(error.message)
        },
      }
    )
  }

  return (
    <form
      onSubmit={gonder}
      noValidate
      className="grid gap-3 rounded-2xl border p-4"
      aria-label={`${d.mukellefUnvan} ${kurum} doğrulaması`}
    >
      <div className="grid gap-0.5 text-sm">
        <span className="font-medium">
          {d.mukellefUnvan} · {kurum}
        </span>
        <span className="text-xs text-muted-foreground">
          Bekleyen:{" "}
          {d.bekleyenAdimlar.map((a) => KAMU_ADIM_ETIKET[a]).join(", ")}
        </span>
      </div>
      {d.suresiDoldu ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Görselin süresi doldu. {KURUM_EKLI[d.kurum].den} yeni görsel
            isteyin.
          </span>
          <Button
            type="button"
            size="sm"
            disabled={yenile.isPending}
            onClick={() =>
              yenile.mutate(d.id, {
                onError: (error) => toast.error(error.message),
              })
            }
          >
            {yenile.isPending ? "İsteniyor…" : "Yeni görsel iste"}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <img
              src={d.gorselDataUrl}
              alt={`${kurum} doğrulama görseli`}
              width={220}
              height={80}
              className="rounded-lg border bg-white"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={yenile.isPending}
              onClick={() => {
                setHata(undefined)
                yenile.mutate(d.id, {
                  onError: (error) => toast.error(error.message),
                })
              }}
            >
              Yeni görsel
            </Button>
          </div>
          <Field data-invalid={Boolean(hata) || undefined}>
            <FieldLabel htmlFor={id}>Görseldeki kod</FieldLabel>
            <div className="flex gap-2">
              <Input
                id={id}
                value={kod}
                onChange={(e) => {
                  setKod(e.target.value)
                  setHata(undefined)
                }}
                autoComplete="off"
                inputMode="numeric"
                aria-invalid={Boolean(hata) || undefined}
                className="max-w-40"
              />
              <Button type="submit" disabled={coz.isPending}>
                {coz.isPending ? "Doğrulanıyor…" : "Doğrula"}
              </Button>
            </div>
            <FieldDescription>
              Son geçerlilik {formatDateTime(d.sonGecerlilik)}
            </FieldDescription>
            <FieldError>{hata}</FieldError>
          </Field>
        </>
      )}
    </form>
  )
}

/** Sorgu sonrası doğrulama çıktıysa hemen açılan pencere */
export function DogrulamaDialog({
  dogrulama,
  onClose,
}: {
  dogrulama: KamuDogrulamaView | null
  onClose: () => void
}) {
  // Yenilenen görseli göstermek için kayıt listeden güncel okunur
  const liste = useDogrulamalar(
    { mukellefId: dogrulama?.mukellefId },
    Boolean(dogrulama)
  )
  const guncel =
    liste.data?.find((d) => d.id === dogrulama?.id) ?? dogrulama ?? null
  return (
    <Dialog open={Boolean(dogrulama)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Doğrulama kodu gerekiyor</DialogTitle>
          <DialogDescription>
            {guncel ? KAMU_KURUM_ETIKET[guncel.kurum] : ""} girişinde doğrulama
            ekranı çıktı. Görseldeki kodu girince sorgu kaldığı yerden devam
            eder. Kapatırsanız kayıt "Doğrulama bekleyenler" listesinde kalır.
          </DialogDescription>
        </DialogHeader>
        {guncel && <DogrulamaFormu d={guncel} onCozuldu={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** Gece sorgusunda ya da personel sorgusunda doğrulamaya takılan tüm girişler */
export function DogrulamaSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const liste = useDogrulamalar({}, open)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>Doğrulama bekleyen girişler</SheetTitle>
          <SheetDescription>
            GİB ve SGK bazı girişlerde doğrulama kodu ister. Kodlar otomatik
            çözülmez; girilene kadar bu mükelleflerin sorguları bekler.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-6">
          {liste.isError ? (
            <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
          ) : !liste.data ? (
            <LoadingState />
          ) : liste.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Doğrulama bekleyen giriş yok.
            </p>
          ) : (
            liste.data.map((d) => <DogrulamaFormu key={d.id} d={d} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
