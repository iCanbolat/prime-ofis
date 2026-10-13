import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { DatePicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { hediyeKontor } from "@prime/shared/e-belge/kontor"
import { useKontorAlimEkle } from "@/features/e-belge/queries"
import { bugun } from "@prime/shared/lib/tarih"
import { z } from "@prime/shared/lib/zod"

const alimSchema = z.object({
  tarih: z
    .string()
    .min(1, "Tarih seçin")
    .refine((t) => t <= bugun(), "Gelecek tarihli alım girilemez"),
  paketAdet: z
    .number("Paket adedini girin")
    .int("Tam sayı olmalı")
    .min(1, "En az 1 kontör"),
  hediye: z.boolean(),
  tutar: z.number("Ödenen tutarı girin").min(0, "Tutar negatif olamaz"),
  not: z.string().trim().max(200).optional(),
})

type AlimFormValues = z.infer<typeof alimSchema>

function AlimForm({ onClose }: { onClose: () => void }) {
  const ekle = useKontorAlimEkle()
  const { register, control, handleSubmit, formState } =
    useForm<AlimFormValues>({
      resolver: zodResolver(alimSchema),
      defaultValues: { tarih: bugun(), hediye: true, not: "" },
    })
  const [paketAdet, hediye] = useWatch({
    control,
    name: ["paketAdet", "hediye"],
  })
  const paket = Number.isInteger(paketAdet) && paketAdet > 0 ? paketAdet : 0
  const hediyeAdet = hediye ? hediyeKontor(paket) : 0
  const { errors } = formState

  const onSubmit = handleSubmit(async ({ hediye: _, ...v }) => {
    try {
      const kayit = await ekle.mutateAsync({ ...v, hediyeAdet })
      toast.success(
        `${(kayit.paketAdet + kayit.hediyeAdet).toLocaleString("tr-TR")} kontör eklendi`
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Kontör alımı ekle</DialogTitle>
        <DialogDescription>
          Luca'dan satın alınan paketi kaydedin. Kalan bakiye ve mükellef başına
          maliyet bu kayıtlara göre hesaplanır.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.tarih) || undefined}>
          <FieldLabel htmlFor="kontor-tarih">Alım tarihi</FieldLabel>
          <Controller
            control={control}
            name="tarih"
            render={({ field }) => (
              <DatePicker
                id="kontor-tarih"
                value={field.value}
                onChange={field.onChange}
                aria-invalid={Boolean(errors.tarih) || undefined}
              />
            )}
          />
          <FieldError>{errors.tarih?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.paketAdet) || undefined}>
            <FieldLabel htmlFor="kontor-paket">Paket (kontör)</FieldLabel>
            <Input
              id="kontor-paket"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              aria-invalid={Boolean(errors.paketAdet) || undefined}
              {...register("paketAdet", { valueAsNumber: true })}
            />
            <FieldError>{errors.paketAdet?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.tutar) || undefined}>
            <FieldLabel htmlFor="kontor-tutar">
              Ödenen tutar (KDV dahil)
            </FieldLabel>
            <Input
              id="kontor-tutar"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              aria-invalid={Boolean(errors.tutar) || undefined}
              {...register("tutar", { valueAsNumber: true })}
            />
            <FieldError>{errors.tutar?.message}</FieldError>
          </Field>
        </div>
        <Controller
          control={control}
          name="hediye"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="kontor-hediye"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <div className="grid gap-1">
                <FieldLabel htmlFor="kontor-hediye">
                  Luca Net / Koza hediyesi (%20)
                </FieldLabel>
                <FieldDescription>
                  {paket > 0
                    ? `${paket.toLocaleString("tr-TR")} + ${hediyeAdet.toLocaleString("tr-TR")} hediye = ${(paket + hediyeAdet).toLocaleString("tr-TR")} kontör`
                    : "Luca kullanıcılarına alımda %20 hediye kontör verilir."}
                </FieldDescription>
              </div>
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="kontor-not">Not (isteğe bağlı)</FieldLabel>
          <Textarea id="kontor-not" rows={2} {...register("not")} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function KontorAlimDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && <AlimForm onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
