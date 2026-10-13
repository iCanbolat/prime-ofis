import { useForm } from "react-hook-form"
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
import { useCredentials } from "@/features/kasa/queries"
import { useKasadanAktar } from "@/features/tebligat/kasa-aktarim"
import { useTebligatErisimKaydet } from "@/features/tebligat/queries"
import { ApiError } from "@/lib/http"
import { z } from "@prime/shared/lib/zod"
import type { TebligatErisimSatiri } from "@prime/shared/types/api"

const erisimSchema = z.object({
  kullaniciKodu: z
    .string()
    .trim()
    .regex(/^\d{6,11}$/, "Kullanıcı kodu 6–11 haneli olmalı"),
  sifre: z.string().min(4, "Şifre en az 4 karakter olmalı"),
})

type ErisimFormValues = z.infer<typeof erisimSchema>

/** Kasadaki İnteraktif VD kaydı varsa şifreyi yeniden yazmadan aktarma */
function KasadanKullan({
  satir,
  onClose,
}: {
  satir: TebligatErisimSatiri
  onClose: () => void
}) {
  const credentials = useCredentials({ mukellefId: satir.mukellefId })
  const { aktar, isPending } = useKasadanAktar()
  const kayit = credentials.data?.find((c) => c.id === satir.kasaKaydiId)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        Şifre kasasında bu mükellefin İnteraktif VD kaydı var
        {kayit && ` (${kayit.kullaniciAdi})`}.
      </span>
      <Button
        type="button"
        size="sm"
        disabled={!kayit || isPending}
        onClick={() => kayit && aktar(kayit, onClose)}
      >
        {isPending ? "Aktarılıyor…" : "Kasadaki şifreyi kullan"}
      </Button>
    </div>
  )
}

/** Şifre yalnızca bu formda yaşar; backend'e bir kez gider, yanıtta son 4 karakteri döner */
function ErisimForm({
  satir,
  onClose,
}: {
  satir: TebligatErisimSatiri
  onClose: () => void
}) {
  const kaydet = useTebligatErisimKaydet()
  const mevcut = satir.erisim
  const { register, handleSubmit, setError, formState } =
    useForm<ErisimFormValues>({
      resolver: zodResolver(erisimSchema),
      defaultValues: {
        kullaniciKodu: mevcut?.kullaniciKodu ?? satir.vkn,
        sifre: "",
      },
    })
  const { errors } = formState

  const onSubmit = handleSubmit(async (v) => {
    try {
      await kaydet.mutateAsync({ mukellefId: satir.mukellefId, ...v })
      toast.success("GİB erişimi kaydedildi; kutu bu geceden itibaren taranır")
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422)
        setError("sifre", { message: error.message })
      else toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>GİB e-Tebligat erişimi</DialogTitle>
        <DialogDescription>
          {satir.mukellefUnvan} adına her gece GİB e-Tebligat kutusuna salt
          okunur giriş yapılır, yeni tebligatlar sabaha listede olur. Mükellefin
          bildirim e-postası ayarına dokunmanız gerekmez.
        </DialogDescription>
      </DialogHeader>
      {satir.kasaKaydiId && <KasadanKullan satir={satir} onClose={onClose} />}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.kullaniciKodu) || undefined}>
          <FieldLabel htmlFor="erisim-kullanici">
            İVD kullanıcı kodu / TCKN / VKN
          </FieldLabel>
          <Input
            id="erisim-kullanici"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.kullaniciKodu) || undefined}
            {...register("kullaniciKodu")}
          />
          <FieldError>{errors.kullaniciKodu?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.sifre) || undefined}>
          <FieldLabel htmlFor="erisim-sifre">Şifre</FieldLabel>
          <Input
            id="erisim-sifre"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.sifre) || undefined}
            {...register("sifre")}
          />
          <FieldDescription>
            {mevcut
              ? `Kayıtlı şifre ••••${mevcut.sifreIpucu}. Değiştirmek için yenisini girin.`
              : "Sunucuda kasadan ayrı, şifreli saklanır ve bir daha gösterilmez."}
          </FieldDescription>
          <FieldError>{errors.sifre?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "GİB'e giriş deneniyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ErisimDialog({
  satir,
  onClose,
}: {
  satir: TebligatErisimSatiri | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(satir)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {satir && <ErisimForm satir={satir} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
