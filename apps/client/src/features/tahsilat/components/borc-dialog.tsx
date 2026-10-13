import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { DatePicker } from "@/components/shared/date-picker"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  KdvStopajAlanlari,
  UcretOzeti,
} from "@/features/tahsilat/components/ucret-alanlari"
import { useHareketEkle } from "@/features/tahsilat/queries"
import { formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { z } from "@prime/shared/lib/zod"
import type { Mukellef } from "@prime/shared/types/domain"

const borcSchema = z.object({
  aciklama: z.string().trim().min(1, "Hizmeti yazın").max(200),
  brut: z
    .number("Brüt tutarı girin")
    .positive("Tutar sıfırdan büyük olmalı")
    .max(10_000_000, "Tutar çok büyük"),
  kdvOrani: z.number(),
  stopajVar: z.boolean(),
  tarih: z
    .string()
    .min(1, "Tarih seçin")
    .refine((t) => t <= bugun(), "Gelecek tarihli kayıt girilemez"),
  makbuzNo: z.string().trim().max(40),
})

type BorcFormValues = z.infer<typeof borcSchema>

function BorcForm({
  mukellef,
  onClose,
}: {
  mukellef: Mukellef
  onClose: () => void
}) {
  const ekle = useHareketEkle()
  const { register, control, handleSubmit, formState } =
    useForm<BorcFormValues>({
      resolver: zodResolver(borcSchema),
      defaultValues: {
        aciklama: "",
        kdvOrani: mukellef.ucret?.kdvOrani ?? 20,
        stopajVar: mukellef.ucret?.stopajVar ?? true,
        tarih: bugun(),
        makbuzNo: "",
      },
    })
  const [brut, kdvOrani, stopajVar] = useWatch({
    control,
    name: ["brut", "kdvOrani", "stopajVar"],
  })
  const { errors } = formState

  const onSubmit = handleSubmit(async (v) => {
    try {
      const kayit = await ekle.mutateAsync({
        tip: "BORC",
        mukellefId: mukellef.id,
        ...v,
        makbuzNo: v.makbuzNo || undefined,
      })
      toast.success(`${formatTRY(kayit.tutar)} borç eklendi`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Ek hizmet borcu</DialogTitle>
        <DialogDescription>
          {mukellef.unvan} · aylık ücret dışındaki hizmetler (kuruluş, tadil,
          yıllık beyan…)
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.aciklama) || undefined}>
          <FieldLabel htmlFor="borc-aciklama">Hizmet</FieldLabel>
          <Input
            id="borc-aciklama"
            aria-invalid={Boolean(errors.aciklama) || undefined}
            {...register("aciklama")}
          />
          <FieldError>{errors.aciklama?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.brut) || undefined}>
            <FieldLabel htmlFor="borc-brut">Brüt ücret (TL)</FieldLabel>
            <Input
              id="borc-brut"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              aria-invalid={Boolean(errors.brut) || undefined}
              {...register("brut", { valueAsNumber: true })}
            />
            <FieldError>{errors.brut?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.tarih) || undefined}>
            <FieldLabel htmlFor="borc-tarih">Tarih</FieldLabel>
            <Controller
              control={control}
              name="tarih"
              render={({ field }) => (
                <DatePicker
                  id="borc-tarih"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={Boolean(errors.tarih) || undefined}
                />
              )}
            />
            <FieldError>{errors.tarih?.message}</FieldError>
          </Field>
        </div>
        <KdvStopajAlanlari control={control} idOnek="borc" />
        <Field>
          <FieldLabel htmlFor="borc-makbuz">
            Makbuz no (isteğe bağlı)
          </FieldLabel>
          <Input id="borc-makbuz" {...register("makbuzNo")} />
        </Field>
        <UcretOzeti brut={brut} kdvOrani={kdvOrani} stopajVar={stopajVar} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Kaydediliyor…" : "Borç ekle"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BorcDialog({
  mukellef,
  onClose,
}: {
  mukellef: Mukellef | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(mukellef)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {mukellef && <BorcForm mukellef={mukellef} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
