import { useState } from "react"
import { Link } from "react-router"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { LucaDogrulamaDialog } from "@/features/e-belge/components/luca-dogrulama"
import {
  lucaDogrulamaBekliyor,
  useBaglantiKaydet,
  useLucaFirmalar,
} from "@/features/e-belge/queries"
import type { EntegratorBaglantiView } from "@prime/shared/types/api"

/**
 * Mükellef, büronun Luca hesabındaki firmalardan birine eşlenir. Önce aynı VKN/TCKN'li, yoksa
 * aynı unvanlı firma önerilir; başka mükellefe eşlenmiş firmalar seçilemez.
 */
function LucaFirmaFormu({
  baglanti,
  onClose,
}: {
  baglanti: EntegratorBaglantiView
  onClose: () => void
}) {
  const firmalar = useLucaFirmalar()
  const kaydet = useBaglantiKaydet()
  const [dogrulama, setDogrulama] = useState(false)
  const [secim, setSecim] = useState<string | null>(null)
  const [hata, setHata] = useState<string>()

  const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
  const bos = firmalar.data?.filter((f) => !f.mukellefId) ?? []
  const oneri =
    baglanti.lucaFirmaId ??
    bos.find((f) => f.eslesenMukellefId === baglanti.mukellefId)?.firmaId ??
    bos.find((f) => kucuk(f.unvan) === kucuk(baglanti.mukellefUnvan))
      ?.firmaId ??
    null
  const firmaId = secim ?? oneri
  const secenekler = Object.fromEntries(
    (firmalar.data ?? []).map((f) => [
      f.firmaId,
      f.vknTckn ? `${f.unvan} (${f.vknTckn})` : f.unvan,
    ])
  )
  const yenileme = baglanti.durum !== "BAGLI_DEGIL"

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firmaId) {
      setHata("Luca firması seçin")
      return
    }
    try {
      await kaydet.mutateAsync({
        mukellefId: baglanti.mukellefId,
        lucaFirmaId: firmaId,
      })
      toast.success(`${baglanti.mukellefUnvan} Luca firmasına eşlendi`)
      onClose()
    } catch (error) {
      if (lucaDogrulamaBekliyor(error)) setDogrulama(true)
      else setHata(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  }

  let govde: React.ReactNode
  if (firmalar.isError) {
    const dogrulamaGerekli = lucaDogrulamaBekliyor(firmalar.error)
    govde = (
      <div className="grid gap-2 text-sm">
        <p className="text-muted-foreground">
          {dogrulamaGerekli
            ? "Luca firma listesi için doğrulama kodu gerekiyor."
            : firmalar.error.message}
        </p>
        <div>
          {dogrulamaGerekli ? (
            <Button type="button" size="sm" onClick={() => setDogrulama(true)}>
              Kodu gir
            </Button>
          ) : (
            <Link
              to="/ayarlar/luca-hesap"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Luca hesabına git
            </Link>
          )}
        </div>
      </div>
    )
  } else if (!firmalar.data) {
    govde = <p className="text-sm text-muted-foreground">Firmalar alınıyor…</p>
  } else {
    govde = (
      <Field data-invalid={Boolean(hata) || undefined}>
        <FieldLabel htmlFor="luca-firma">Luca firması</FieldLabel>
        <Select
          items={secenekler}
          value={firmaId}
          onValueChange={(v) => {
            setSecim(v as string | null)
            setHata(undefined)
          }}
        >
          <SelectTrigger id="luca-firma" className="w-full">
            <SelectValue placeholder="Firma seçin" />
          </SelectTrigger>
          <SelectContent>
            {firmalar.data.map((f) => (
              <SelectItem
                key={f.firmaId}
                value={f.firmaId}
                disabled={Boolean(
                  f.mukellefId && f.mukellefId !== baglanti.mukellefId
                )}
              >
                {secenekler[f.firmaId]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Büronun Luca hesabında görünen firmalar. Faturalar ve beratlar bu
          firmadan okunur; ticari kabul / red Luca'da verilir.
        </FieldDescription>
        <FieldError>{hata}</FieldError>
      </Field>
    )
  }

  // Doğrulama penceresi formun dışında: portal olayları React ağacında dış forma kabarcıklanır
  return (
    <>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>
            {yenileme ? "Luca eşlemesini değiştir" : "Luca firmasına eşle"}
          </DialogTitle>
          <DialogDescription>{baglanti.mukellefUnvan}</DialogDescription>
        </DialogHeader>
        <FieldGroup>{govde}</FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={kaydet.isPending || !firmalar.data}>
            {kaydet.isPending ? "Doğrulanıyor…" : "Eşle"}
          </Button>
        </DialogFooter>
      </form>
      <LucaDogrulamaDialog
        open={dogrulama}
        onClose={() => setDogrulama(false)}
        onCozuldu={() => void firmalar.refetch()}
      />
    </>
  )
}

export function BaglantiDialog({
  baglanti,
  onClose,
}: {
  baglanti: EntegratorBaglantiView | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={Boolean(baglanti)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        {baglanti && <LucaFirmaFormu baglanti={baglanti} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
