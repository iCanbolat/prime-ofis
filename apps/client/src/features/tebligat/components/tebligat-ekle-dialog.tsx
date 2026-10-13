import { Controller, useForm } from "react-hook-form"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { useTebligatEkle } from "@/features/tebligat/queries"
import { TEBLIGAT_TUR_ETIKET } from "@prime/shared/tebligat/sabitler"
import { bugun } from "@prime/shared/lib/tarih"
import { z } from "@prime/shared/lib/zod"
import type { TebligatView } from "@prime/shared/types/api"
import type { TebligatTur } from "@prime/shared/types/domain"

const TURLER = Object.keys(TEBLIGAT_TUR_ETIKET) as TebligatTur[]

const ekleSchema = z.object({
  mukellefId: z.string().min(1, "Mükellef seçin"),
  kurum: z.enum(["GIB", "SGK"]),
  tur: z.enum(TURLER as [TebligatTur, ...TebligatTur[]]),
  konu: z.string().trim().min(1, "Konu yazın").max(200),
  belgeNo: z.string().trim().max(60),
  ulasmaGunu: z
    .string()
    .min(1, "Tarih seçin")
    .refine((t) => t <= bugun(), "Gelecek tarih girilemez"),
})

type EkleFormValues = z.infer<typeof ekleSchema>

function EkleForm({
  mukellefId,
  onClose,
  onEklendi,
}: {
  mukellefId?: string
  onClose: () => void
  onEklendi?: (t: TebligatView) => void
}) {
  const ekle = useTebligatEkle()
  const { register, control, handleSubmit, formState } =
    useForm<EkleFormValues>({
      resolver: zodResolver(ekleSchema),
      defaultValues: {
        mukellefId: mukellefId ?? "",
        kurum: "GIB",
        tur: "ODEME_EMRI",
        konu: "",
        belgeNo: "",
        ulasmaGunu: bugun(),
      },
    })
  const { errors } = formState

  const onSubmit = handleSubmit(async (v) => {
    try {
      const t = await ekle.mutateAsync({
        ...v,
        belgeNo: v.belgeNo || undefined,
      })
      toast.success("e-Tebligat kaydedildi")
      onClose()
      onEklendi?.(t)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>e-Tebligat ekle</DialogTitle>
        <DialogDescription>
          Gece taramasına girmeyen tebligatı (SGK, kâğıt tebligat ya da GİB
          erişimi tanımlı olmayan mükellef) elle kaydedin.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {!mukellefId && (
          <Field data-invalid={Boolean(errors.mukellefId) || undefined}>
            <FieldLabel htmlFor="tebligat-ekle-mukellef">Mükellef</FieldLabel>
            <Controller
              control={control}
              name="mukellefId"
              render={({ field }) => (
                <MukellefSelect
                  id="tebligat-ekle-mukellef"
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-invalid={Boolean(errors.mukellefId) || undefined}
                />
              )}
            />
            <FieldError>{errors.mukellefId?.message}</FieldError>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="tebligat-ekle-tur">Tür</FieldLabel>
            <Controller
              control={control}
              name="tur"
              render={({ field }) => (
                <Select
                  items={TEBLIGAT_TUR_ETIKET}
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger id="tebligat-ekle-tur" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TURLER.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TEBLIGAT_TUR_ETIKET[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="tebligat-ekle-kurum">Kurum</FieldLabel>
            <Controller
              control={control}
              name="kurum"
              render={({ field }) => (
                <Select
                  items={{ GIB: "GİB", SGK: "SGK" }}
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger id="tebligat-ekle-kurum" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GIB">GİB</SelectItem>
                    <SelectItem value="SGK">SGK</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.konu) || undefined}>
          <FieldLabel htmlFor="tebligat-ekle-konu">Konu</FieldLabel>
          <Input
            id="tebligat-ekle-konu"
            aria-invalid={Boolean(errors.konu) || undefined}
            {...register("konu")}
          />
          <FieldError>{errors.konu?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.ulasmaGunu) || undefined}>
            <FieldLabel htmlFor="tebligat-ekle-tarih">
              Adrese ulaştığı gün
            </FieldLabel>
            <Controller
              control={control}
              name="ulasmaGunu"
              render={({ field }) => (
                <DatePicker
                  id="tebligat-ekle-tarih"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={Boolean(errors.ulasmaGunu) || undefined}
                />
              )}
            />
            <FieldError>{errors.ulasmaGunu?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="tebligat-ekle-belge">
              Belge no (isteğe bağlı)
            </FieldLabel>
            <Input id="tebligat-ekle-belge" {...register("belgeNo")} />
          </Field>
        </div>
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

export function TebligatEkleDialog({
  open,
  mukellefId,
  onClose,
  onEklendi,
}: {
  open: boolean
  mukellefId?: string
  onClose: () => void
  onEklendi?: (t: TebligatView) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <EkleForm
            mukellefId={mukellefId}
            onClose={onClose}
            onEklendi={onEklendi}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
