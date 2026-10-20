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
  useLucaDogrula,
  useLucaDogrulama,
  useLucaDogrulamaYenile,
} from "@/features/e-belge/queries"
import { ApiError } from "@/lib/http"
import { formatDateTime } from "@prime/shared/lib/format"

/**
 * Luca girişinde çıkan doğrulama ekranı. Kod otomatik çözülmez: personel görseldeki kodu girer,
 * oturum açılınca `onCozuldu` ile bekleyen işlem (senkron, firma listesi) yeniden denenir.
 * Yanlış kodda Luca yeni görsel verir; süresi dolan görsel için yenisi istenir.
 */
function LucaDogrulamaFormu({ onCozuldu }: { onCozuldu: () => void }) {
  const id = useId()
  const [kod, setKod] = useState("")
  const [hata, setHata] = useState<string>()
  const dogrulama = useLucaDogrulama(true)
  const dogrula = useLucaDogrula()
  const yenile = useLucaDogrulamaYenile()

  const yeniGorsel = () => {
    setHata(undefined)
    yenile.mutate(undefined, {
      onError: (error) => toast.error(error.message),
    })
  }

  if (dogrulama.isError)
    return (
      <ErrorState error={dogrulama.error} onRetry={() => dogrulama.refetch()} />
    )
  if (!dogrulama.data) return <LoadingState />
  const d = dogrulama.data
  const suresiDoldu = d.sonGecerlilik < new Date().toISOString()

  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    // Pencere bir formun içinden açılabilir: submit dış forma kabarcıklanmasın
    e.stopPropagation()
    if (!kod.trim()) {
      setHata("Görseldeki kodu girin")
      return
    }
    dogrula.mutate(kod, {
      onSuccess: () => {
        toast.success("Luca girişi doğrulandı")
        onCozuldu()
      },
      onError: (error) => {
        setKod("")
        setHata(error.message)
        // Yanlış kod: Luca yeni görsel verdi; süresi dolmuşsa yenisi istenir
        if (error instanceof ApiError && error.status === 410) yeniGorsel()
        else void dogrulama.refetch()
        if (!(error instanceof ApiError) || ![410, 422].includes(error.status))
          toast.error(error.message)
      },
    })
  }

  if (suresiDoldu)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Görselin süresi doldu. Luca'dan yeni görsel isteyin.
        </span>
        <Button size="sm" disabled={yenile.isPending} onClick={yeniGorsel}>
          {yenile.isPending ? "İsteniyor…" : "Yeni görsel iste"}
        </Button>
      </div>
    )

  return (
    <form onSubmit={gonder} noValidate className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <img
          src={d.gorselDataUrl}
          alt="Luca doğrulama görseli"
          width={220}
          height={80}
          className="rounded-lg border bg-white"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={yenile.isPending}
          onClick={yeniGorsel}
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
            aria-invalid={Boolean(hata) || undefined}
            className="max-w-40"
          />
          <Button type="submit" disabled={dogrula.isPending}>
            {dogrula.isPending ? "Doğrulanıyor…" : "Doğrula"}
          </Button>
        </div>
        <FieldDescription>
          Son geçerlilik {formatDateTime(d.sonGecerlilik)}
        </FieldDescription>
        <FieldError>{hata}</FieldError>
      </Field>
    </form>
  )
}

export function LucaDogrulamaDialog({
  open,
  onClose,
  onCozuldu,
}: {
  open: boolean
  onClose: () => void
  /** Kod kabul edildi; bekleyen işlem yeniden denenebilir */
  onCozuldu?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Luca doğrulama kodu</DialogTitle>
          <DialogDescription>
            Luca girişinde doğrulama ekranı çıktı. Görseldeki kodu girince işlem
            kaldığı yerden devam eder.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <LucaDogrulamaFormu
            onCozuldu={() => {
              onClose()
              onCozuldu?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
