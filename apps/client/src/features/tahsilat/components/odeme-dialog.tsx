import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { DatePicker } from "@/components/shared/date-picker"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fifoKapat, yuvarla } from "@prime/shared/tahsilat/kurallar"
import { useCariEkstre, useHareketEkle } from "@/features/tahsilat/queries"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { z } from "@prime/shared/lib/zod"
import type { AcikBorcView, CariEkstreResponse } from "@prime/shared/types/api"

const odemeSchema = z
  .object({
    kalem: z.enum(["ODEME", "DUZELTME"]),
    tarih: z
      .string()
      .min(1, "Tarih seçin")
      .refine((t) => t <= bugun(), "Gelecek tarihli kayıt girilemez"),
    tutar: z
      .number("Tutarı girin")
      .positive("Tutar sıfırdan büyük olmalı")
      .max(10_000_000, "Tutar çok büyük"),
    aciklama: z.string().trim().max(200),
    makbuzNo: z.string().trim().max(40),
  })
  .refine((v) => v.kalem === "ODEME" || v.aciklama.length > 0, {
    path: ["aciklama"],
    message: "Düzeltme için açıklama yazın",
  })

type OdemeFormValues = z.infer<typeof odemeSchema>

function borcEtiketi(b: AcikBorcView) {
  return b.aciklama ?? formatDate(b.tarih)
}

function OdemeForm({
  ekstre,
  onClose,
}: {
  ekstre: CariEkstreResponse
  onClose: () => void
}) {
  const ekle = useHareketEkle()
  const acik = ekstre.acikBorclar
  const [elle, setElle] = useState(false)
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set(acik.map((b) => b.id))
  )
  const { register, control, handleSubmit, formState } =
    useForm<OdemeFormValues>({
      resolver: zodResolver(odemeSchema),
      defaultValues: {
        kalem: "ODEME",
        tarih: bugun(),
        tutar: ekstre.durum.acikBorc > 0 ? ekstre.durum.acikBorc : undefined,
        aciklama: "",
        makbuzNo: "",
      },
    })
  const [tutar, kalem] = useWatch({ control, name: ["tutar", "kalem"] })
  const gecerliTutar = Number.isFinite(tutar) && tutar > 0 ? tutar : 0
  const hedefler = elle ? acik.filter((b) => secili.has(b.id)) : acik
  const dagitim = useMemo(
    () => fifoKapat(gecerliTutar, hedefler),
    [gecerliTutar, hedefler]
  )
  const dagitilan = dagitim.reduce((t, k) => t + k.tutar, 0)
  const avans = yuvarla(gecerliTutar - dagitilan)
  const { errors } = formState

  const onSubmit = handleSubmit(async (v) => {
    try {
      await ekle.mutateAsync({
        tip: "ODEME",
        mukellefId: ekstre.mukellefId,
        kalem: v.kalem,
        tarih: v.tarih,
        tutar: v.tutar,
        aciklama: v.aciklama || undefined,
        makbuzNo: v.makbuzNo || undefined,
        kapatmalar: elle ? dagitim : undefined,
      })
      toast.success(
        v.kalem === "ODEME"
          ? `${formatTRY(v.tutar)} tahsilat kaydedildi`
          : `${formatTRY(v.tutar)} alacak düzeltmesi kaydedildi`
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  const dagitimMap = new Map(dagitim.map((k) => [k.borcId, k.tutar]))

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>
          {kalem === "ODEME" ? "Ödeme al" : "Alacak düzeltmesi"}
        </DialogTitle>
        <DialogDescription>
          {ekstre.mukellefUnvan} · açık borç {formatTRY(ekstre.durum.acikBorc)}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Controller
          control={control}
          name="kalem"
          render={({ field }) => (
            <Select
              items={{ ODEME: "Ödeme", DUZELTME: "İndirim / düzeltme" }}
              value={field.value}
              onValueChange={(v) => v && field.onChange(v)}
            >
              <SelectTrigger aria-label="Kayıt türü" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ODEME">Ödeme</SelectItem>
                <SelectItem value="DUZELTME">İndirim / düzeltme</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.tutar) || undefined}>
            <FieldLabel htmlFor="odeme-tutar">Tutar (TL)</FieldLabel>
            <Input
              id="odeme-tutar"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              aria-invalid={Boolean(errors.tutar) || undefined}
              {...register("tutar", { valueAsNumber: true })}
            />
            <FieldError>{errors.tutar?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.tarih) || undefined}>
            <FieldLabel htmlFor="odeme-tarih">Tarih</FieldLabel>
            <Controller
              control={control}
              name="tarih"
              render={({ field }) => (
                <DatePicker
                  id="odeme-tarih"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={Boolean(errors.tarih) || undefined}
                />
              )}
            />
            <FieldError>{errors.tarih?.message}</FieldError>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.aciklama) || undefined}>
            <FieldLabel htmlFor="odeme-aciklama">
              Açıklama{kalem === "ODEME" && " (isteğe bağlı)"}
            </FieldLabel>
            <Input
              id="odeme-aciklama"
              placeholder={kalem === "ODEME" ? "Havale, EFT, nakit…" : ""}
              aria-invalid={Boolean(errors.aciklama) || undefined}
              {...register("aciklama")}
            />
            <FieldError>{errors.aciklama?.message}</FieldError>
          </Field>
          {kalem === "ODEME" && (
            <Field>
              <FieldLabel htmlFor="odeme-makbuz">
                Makbuz no (isteğe bağlı)
              </FieldLabel>
              <Input id="odeme-makbuz" {...register("makbuzNo")} />
            </Field>
          )}
        </div>

        {acik.length > 0 && (
          <FieldSet>
            <FieldLegend variant="label">Kapatılacak borçlar</FieldLegend>
            <Field orientation="horizontal">
              <Checkbox
                id="odeme-elle"
                checked={elle}
                onCheckedChange={(c) => setElle(Boolean(c))}
              />
              <FieldLabel htmlFor="odeme-elle">Borçları elle seç</FieldLabel>
            </Field>
            <FieldDescription>
              {elle
                ? "Tutar seçili borçlara en eskiden başlayarak dağıtılır."
                : "Tutar en eski borçtan başlayarak dağıtılır."}
            </FieldDescription>
            <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-2xl border p-2">
              {acik.map((b) => {
                const pay = dagitimMap.get(b.id)
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {elle && (
                        <Checkbox
                          aria-label={borcEtiketi(b)}
                          checked={secili.has(b.id)}
                          onCheckedChange={(c) =>
                            setSecili((s) => {
                              const yeni = new Set(s)
                              if (c) yeni.add(b.id)
                              else yeni.delete(b.id)
                              return yeni
                            })
                          }
                        />
                      )}
                      <span className="truncate">{borcEtiketi(b)}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="text-muted-foreground">
                        {formatTRY(b.kalan)}
                      </span>
                      {pay !== undefined && (
                        <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          {pay >= b.kalan ? "Kapanır" : `− ${formatTRY(pay)}`}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {avans > 0 && (
              <FieldDescription>
                {formatTRY(avans)} hiçbir borca dağıtılmaz; avans olarak kalır
                ve sonraki borçlara otomatik uygulanır.
              </FieldDescription>
            )}
          </FieldSet>
        )}
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

function Icerik({
  mukellefId,
  onClose,
}: {
  mukellefId: string
  onClose: () => void
}) {
  const ekstre = useCariEkstre(mukellefId)
  if (ekstre.isError)
    return <ErrorState error={ekstre.error} onRetry={() => ekstre.refetch()} />
  if (!ekstre.data) return <LoadingState />
  return <OdemeForm ekstre={ekstre.data} onClose={onClose} />
}

/** `mukellefId` verildiğinde açılır */
export function OdemeDialog({
  mukellefId,
  onClose,
}: {
  mukellefId: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(mukellefId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {mukellefId && <Icerik mukellefId={mukellefId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
