import { useForm, Controller } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

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
import { useBaglantiKaydet } from "@/features/e-belge/queries"
import { ORTAM_ETIKET } from "@prime/shared/e-belge/sabitler"
import { ApiError } from "@/lib/http"
import { z } from "@prime/shared/lib/zod"
import type { EntegratorBaglantiView } from "@prime/shared/types/api"
import type { EntegratorOrtam } from "@prime/shared/types/domain"

const baglantiSchema = z.object({
  apiAnahtari: z.string().trim().min(16, "Anahtar en az 16 karakter olmalı"),
  ortam: z.enum(["TEST", "CANLI"]),
})

type BaglantiFormValues = z.infer<typeof baglantiSchema>

/**
 * Anahtar yalnızca bu formun (bellekteki) durumunda yaşar: backend'e bir kez gönderilir,
 * pencere kapanınca form yok olur. Yanıtta anahtarın yalnızca son 4 karakteri döner.
 */
function BaglantiForm({
  baglanti,
  onClose,
}: {
  baglanti: EntegratorBaglantiView
  onClose: () => void
}) {
  const kaydet = useBaglantiKaydet()
  const { register, handleSubmit, control, setError, formState } =
    useForm<BaglantiFormValues>({
      resolver: zodResolver(baglantiSchema),
      defaultValues: { apiAnahtari: "", ortam: baglanti.ortam },
    })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await kaydet.mutateAsync({ mukellefId: baglanti.mukellefId, ...values })
      toast.success(`${baglanti.mukellefUnvan} Luca'ya bağlandı`)
      onClose()
    } catch (error) {
      // 422: Luca anahtarı reddetti → alana yaz
      if (error instanceof ApiError && error.status === 422)
        setError("apiAnahtari", { message: error.message })
      else toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  const hata = formState.errors.apiAnahtari?.message
  const yenileme = baglanti.durum !== "BAGLI_DEGIL"

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {yenileme ? "Luca bağlantısını yenile" : "Luca'ya bağla"}
        </DialogTitle>
        <DialogDescription>{baglanti.mukellefUnvan}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(hata) || undefined}>
          <FieldLabel htmlFor="entegrator-anahtar">
            Web servis anahtarı
          </FieldLabel>
          <Input
            id="entegrator-anahtar"
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(hata) || undefined}
            {...register("apiAnahtari")}
          />
          <FieldDescription>
            Luca e-Entegratör portalında mükellef için tanımlanan web servis
            anahtarı. Anahtar sunucuda şifreli saklanır; bir daha
            görüntülenemez.
            {yenileme && baglanti.anahtarIpucu && (
              <> Mevcut anahtar: ••••{baglanti.anahtarIpucu}</>
            )}
          </FieldDescription>
          <FieldError>{hata}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="entegrator-ortam">Ortam</FieldLabel>
          <Controller
            control={control}
            name="ortam"
            render={({ field }) => (
              <Select
                items={ORTAM_ETIKET}
                value={field.value}
                onValueChange={(v) => v && field.onChange(v as EntegratorOrtam)}
              >
                <SelectTrigger id="entegrator-ortam" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORTAM_ETIKET) as EntegratorOrtam[]).map((o) => (
                    <SelectItem key={o} value={o}>
                      {ORTAM_ETIKET[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Doğrulanıyor…" : "Bağla"}
        </Button>
      </DialogFooter>
    </form>
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
        {baglanti && <BaglantiForm baglanti={baglanti} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
