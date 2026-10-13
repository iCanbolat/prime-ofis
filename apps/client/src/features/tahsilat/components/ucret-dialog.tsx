import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { MonthPicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
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
import {
  KdvStopajAlanlari,
  UcretOzeti,
} from "@/features/tahsilat/components/ucret-alanlari"
import { useUcretKaydet } from "@/features/tahsilat/queries"
import { formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { z } from "@prime/shared/lib/zod"
import type { Mukellef } from "@prime/shared/types/domain"

const ucretSchema = z.object({
  aylikBrut: z
    .number("Aylık brüt ücreti girin")
    .positive("Ücret sıfırdan büyük olmalı")
    .max(10_000_000, "Tutar çok büyük"),
  kdvOrani: z.number(),
  stopajVar: z.boolean(),
  baslangicDonem: z.string().regex(/^\d{4}-\d{2}$/, "Başlangıç ayını seçin"),
})

type UcretFormValues = z.infer<typeof ucretSchema>

function UcretForm({
  mukellef,
  onClose,
}: {
  mukellef: Mukellef
  onClose: () => void
}) {
  const kaydet = useUcretKaydet()
  const mevcut = mukellef.ucret
  const { register, control, handleSubmit, formState } =
    useForm<UcretFormValues>({
      resolver: zodResolver(ucretSchema),
      defaultValues: mevcut ?? {
        kdvOrani: 20,
        stopajVar: true,
        baslangicDonem: bugun().slice(0, 7),
      },
    })
  const [aylikBrut, kdvOrani, stopajVar] = useWatch({
    control,
    name: ["aylikBrut", "kdvOrani", "stopajVar"],
  })
  const { errors } = formState

  const gonder = async (ucret: UcretFormValues | null) => {
    try {
      await kaydet.mutateAsync({ mukellefId: mukellef.id, ucret })
      toast.success(
        ucret
          ? `Aylık ücret ${formatTRY(ucret.aylikBrut)} + KDV olarak kaydedildi`
          : "Aylık ücret kaldırıldı"
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  }

  return (
    <form
      onSubmit={handleSubmit((v) => gonder(v))}
      noValidate
      className="grid gap-6"
    >
      <DialogHeader>
        <DialogTitle>Aylık ücret</DialogTitle>
        <DialogDescription>
          {mukellef.unvan} her ayın ilk günü bu tutarla otomatik borçlandırılır.
          Değişiklik geçmiş ayların borçlarını etkilemez.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.aylikBrut) || undefined}>
            <FieldLabel htmlFor="ucret-brut">Aylık brüt (TL)</FieldLabel>
            <Input
              id="ucret-brut"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              aria-invalid={Boolean(errors.aylikBrut) || undefined}
              {...register("aylikBrut", { valueAsNumber: true })}
            />
            <FieldError>{errors.aylikBrut?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.baslangicDonem) || undefined}>
            <FieldLabel htmlFor="ucret-baslangic">Başlangıç ayı</FieldLabel>
            <Controller
              control={control}
              name="baslangicDonem"
              render={({ field }) => (
                <MonthPicker
                  id="ucret-baslangic"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={Boolean(errors.baslangicDonem) || undefined}
                />
              )}
            />
            <FieldDescription>
              Bu aydan bugüne eksik aylar da borçlandırılır.
            </FieldDescription>
            <FieldError>{errors.baslangicDonem?.message}</FieldError>
          </Field>
        </div>
        <KdvStopajAlanlari control={control} idOnek="ucret" />
        <UcretOzeti
          brut={aylikBrut}
          kdvOrani={kdvOrani}
          stopajVar={stopajVar}
        />
      </FieldGroup>
      <DialogFooter className="sm:justify-between">
        {mevcut ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={formState.isSubmitting || kaydet.isPending}
            onClick={() => gonder(null)}
          >
            Ücreti kaldır
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2 max-sm:flex-col-reverse">
          <Button type="button" variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

export function UcretDialog({
  mukellef,
  onClose,
}: {
  mukellef: Mukellef | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(mukellef)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {mukellef && <UcretForm mukellef={mukellef} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
