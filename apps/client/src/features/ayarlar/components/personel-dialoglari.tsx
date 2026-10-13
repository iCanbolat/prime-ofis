/**
 * Ayarlar → Personel: ekleme, düzenleme, şifre belirleme ve silme pencereleri.
 * Her işlem, oturumu açık yöneticinin kendi şifresiyle onaylanır (sunucuda da doğrulanır).
 */
import { useState } from "react"
import {
  Controller,
  useForm,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MagicWand01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"

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
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  usePersonelGuncelle,
  usePersonelOlustur,
  usePersonelSifre,
  usePersonelSil,
} from "@/features/auth/queries"
import { generatePassword } from "@/lib/crypto"
import { ApiError } from "@/lib/http"
import { isValidPhoneTR, normalizePhoneTR } from "@prime/shared/lib/validators"
import { z } from "@prime/shared/lib/zod"
import {
  ROL_ETIKET,
  type Personel,
  type PersonelRenk,
  type Rol,
} from "@prime/shared/types/domain"

export const SIFRE_MIN = 8
const RENKLER: PersonelRenk[] = ["blue", "emerald", "amber", "rose", "violet"]

const yoneticiSifresi = z.string().min(1, "Onay için yönetici şifrenizi girin")
const yeniSifre = z
  .string()
  .min(SIFRE_MIN, `Şifre en az ${SIFRE_MIN} karakter olmalı`)
  .max(128)

const bilgiSchema = z.object({
  ad: z.string().trim().min(1, "Ad zorunludur").max(50),
  soyad: z.string().trim().min(1, "Soyad zorunludur").max(50),
  eposta: z.email("Geçerli bir e-posta adresi giriniz"),
  telefon: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || isValidPhoneTR(v),
      "Geçerli bir telefon numarası giriniz (ör. 0532 123 45 67)"
    ),
  rol: z.enum(["YONETICI", "PERSONEL"]),
  aktif: z.boolean(),
  yoneticiSifresi,
})

const olusturSchema = bilgiSchema
  .extend({ sifre: yeniSifre, sifreTekrar: z.string() })
  .refine((v) => v.sifre === v.sifreTekrar, {
    message: "Şifreler eşleşmiyor",
    path: ["sifreTekrar"],
  })

const sifreSchema = z
  .object({ sifre: yeniSifre, sifreTekrar: z.string(), yoneticiSifresi })
  .refine((v) => v.sifre === v.sifreTekrar, {
    message: "Şifreler eşleşmiyor",
    path: ["sifreTekrar"],
  })

const silSchema = z.object({ yoneticiSifresi })

type OlusturValues = z.infer<typeof olusturSchema>
type SifreValues = z.infer<typeof sifreSchema>
type SilValues = z.infer<typeof silSchema>

/**
 * Sunucu hatasını forma yansıtır: yanlış yönetici şifresi alanın altında gösterilir
 * (alan temizlenir), diğer hatalar bildirim olarak çıkar.
 */
function sunucuHatasi<T extends { yoneticiSifresi: string }>(
  form: UseFormReturn<T>,
  error: unknown
) {
  const alan = "yoneticiSifresi" as Path<T>
  if (error instanceof ApiError && error.status === 403) {
    form.resetField(alan)
    form.setError(alan, { message: error.message }, { shouldFocus: true })
    return
  }
  toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı")
}

function SifreAlani<T extends FieldValues>({
  form,
  name,
  id,
  label,
  autoComplete,
  description,
  onGenerate,
}: {
  form: UseFormReturn<T>
  name: Path<T>
  id: string
  label: string
  autoComplete: "new-password" | "current-password"
  description?: React.ReactNode
  onGenerate?: () => void
}) {
  const [gorunur, setGorunur] = useState(false)
  const error = form.formState.errors[name]?.message as string | undefined
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={gorunur ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error) || undefined}
          {...form.register(name)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={gorunur ? `${label} gizle` : `${label} göster`}
            onClick={() => setGorunur((v) => !v)}
          >
            <HugeiconsIcon
              icon={gorunur ? ViewOffSlashIcon : ViewIcon}
              strokeWidth={2}
            />
          </InputGroupButton>
          {onGenerate && (
            <InputGroupButton
              size="icon-xs"
              aria-label={`${label} üret`}
              onClick={() => {
                onGenerate()
                setGorunur(true)
              }}
            >
              <HugeiconsIcon icon={MagicWand01Icon} strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

/** Yeni şifre + tekrar; "üret" iki alanı birden doldurur. */
function YeniSifreAlanlari<
  T extends { sifre: string; sifreTekrar: string } & FieldValues,
>({ form, label = "Şifre" }: { form: UseFormReturn<T>; label?: string }) {
  const uret = () => {
    const sifre = generatePassword(12)
    const secenek = { shouldValidate: form.formState.isSubmitted }
    form.setValue("sifre" as Path<T>, sifre as T[Path<T>], secenek)
    form.setValue("sifreTekrar" as Path<T>, sifre as T[Path<T>], secenek)
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SifreAlani
        form={form}
        name={"sifre" as Path<T>}
        id="personel-sifre"
        label={label}
        autoComplete="new-password"
        description={`En az ${SIFRE_MIN} karakter`}
        onGenerate={uret}
      />
      <SifreAlani
        form={form}
        name={"sifreTekrar" as Path<T>}
        id="personel-sifre-tekrar"
        label={`${label} (tekrar)`}
        autoComplete="new-password"
      />
    </div>
  )
}

function YoneticiSifresiAlani<T extends { yoneticiSifresi: string }>({
  form,
}: {
  form: UseFormReturn<T>
}) {
  return (
    <SifreAlani
      form={form}
      name={"yoneticiSifresi" as Path<T>}
      id="yonetici-sifresi"
      label="Yönetici şifreniz"
      autoComplete="current-password"
      description="Personel işlemleri kendi giriş şifrenizle onaylanır."
    />
  )
}

function Metin({
  form,
  name,
  label,
  ...inputProps
}: {
  form: UseFormReturn<OlusturValues>
  name: "ad" | "soyad" | "eposta" | "telefon"
  label: string
} & Omit<React.ComponentProps<typeof Input>, "form" | "name">) {
  const error = form.formState.errors[name]?.message
  const id = `personel-${name}`
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-invalid={Boolean(error) || undefined}
        {...inputProps}
        {...form.register(name)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  )
}

/** Ekleme ve düzenleme; düzenlemede şifre alanları yoktur (ayrı pencere). */
function PersonelFormu({
  mevcut,
  personelSayisi,
  onClose,
}: {
  mevcut: Personel | null
  personelSayisi: number
  onClose: () => void
}) {
  const olustur = usePersonelOlustur()
  const guncelle = usePersonelGuncelle()
  const form = useForm<OlusturValues>({
    // Düzenlemede şifre alanları formda yok → yalnızca bilgi şeması doğrulanır
    resolver: zodResolver(
      mevcut ? (bilgiSchema as unknown as typeof olusturSchema) : olusturSchema
    ),
    defaultValues: {
      ad: mevcut?.ad ?? "",
      soyad: mevcut?.soyad ?? "",
      eposta: mevcut?.eposta ?? "",
      telefon: mevcut?.telefon ?? "",
      rol: mevcut?.rol ?? "PERSONEL",
      aktif: mevcut?.aktif ?? true,
      sifre: "",
      sifreTekrar: "",
      yoneticiSifresi: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const bilgi = {
      ad: values.ad,
      soyad: values.soyad,
      eposta: values.eposta,
      telefon: values.telefon ? normalizePhoneTR(values.telefon) : "",
      rol: values.rol,
      aktif: values.aktif,
      renk: mevcut?.renk ?? RENKLER[personelSayisi % RENKLER.length]!,
      yoneticiSifresi: values.yoneticiSifresi,
    }
    try {
      if (mevcut) {
        await guncelle.mutateAsync({ id: mevcut.id, ...bilgi })
        toast.success(`${values.ad} ${values.soyad} güncellendi`)
      } else {
        await olustur.mutateAsync({ ...bilgi, sifre: values.sifre })
        toast.success(`${values.ad} ${values.soyad} eklendi`)
      }
      onClose()
    } catch (error) {
      sunucuHatasi(form, error)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {mevcut ? "Personeli düzenle" : "Personel ekle"}
        </DialogTitle>
        <DialogDescription>
          {mevcut
            ? "İletişim bilgileri, rol ve erişim durumu. Şifre ayrı değiştirilir."
            : "Yeni kullanıcı bu e-posta ve belirlediğiniz şifreyle giriş yapar."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Metin form={form} name="ad" label="Ad" autoComplete="off" />
          <Metin form={form} name="soyad" label="Soyad" autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Metin
            form={form}
            name="eposta"
            label="E-posta"
            type="email"
            autoComplete="off"
          />
          <Metin
            form={form}
            name="telefon"
            label="Telefon"
            type="tel"
            placeholder="0532 123 45 67"
          />
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="rol"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="personel-rol">Rol</FieldLabel>
                <Select
                  items={ROL_ETIKET}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as Rol)}
                >
                  <SelectTrigger id="personel-rol" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROL_ETIKET) as Rol[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROL_ETIKET[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="aktif"
            render={({ field }) => (
              <Field orientation="horizontal" className="pb-2">
                <Checkbox
                  id="personel-aktif"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="personel-aktif">
                  Aktif (giriş yapabilir)
                </FieldLabel>
              </Field>
            )}
          />
        </div>
        {!mevcut && <YeniSifreAlanlari form={form} />}
        <FieldSeparator />
        <YoneticiSifresiAlani form={form} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {mevcut ? "Kaydet" : "Ekle"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SifreFormu({
  personel,
  onClose,
}: {
  personel: Personel
  onClose: () => void
}) {
  const sifre = usePersonelSifre()
  const form = useForm<SifreValues>({
    resolver: zodResolver(sifreSchema),
    defaultValues: { sifre: "", sifreTekrar: "", yoneticiSifresi: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await sifre.mutateAsync({
        id: personel.id,
        sifre: values.sifre,
        yoneticiSifresi: values.yoneticiSifresi,
      })
      toast.success(`${personel.ad} ${personel.soyad} için şifre değiştirildi`)
      onClose()
    } catch (error) {
      sunucuHatasi(form, error)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Şifre belirle</DialogTitle>
        <DialogDescription>
          {personel.ad} {personel.soyad} bir sonraki girişinde yeni şifreyi
          kullanır. Yeni şifreyi kendisine güvenli bir kanaldan iletin.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <YeniSifreAlanlari form={form} label="Yeni şifre" />
        <FieldSeparator />
        <YoneticiSifresiAlani form={form} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Şifreyi kaydet
        </Button>
      </DialogFooter>
    </form>
  )
}

function SilFormu({
  personel,
  onClose,
}: {
  personel: Personel
  onClose: () => void
}) {
  const sil = usePersonelSil()
  const form = useForm<SilValues>({
    resolver: zodResolver(silSchema),
    defaultValues: { yoneticiSifresi: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await sil.mutateAsync({ id: personel.id, ...values })
      toast.success(`${personel.ad} ${personel.soyad} silindi`)
      onClose()
    } catch (error) {
      sunucuHatasi(form, error)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Personeli sil</DialogTitle>
        <DialogDescription>
          {personel.ad} {personel.soyad} kalıcı olarak silinir ve bir daha giriş
          yapamaz. Geçmiş aktivite kayıtları korunur. Geçici olarak erişimi
          kapatmak için personeli düzenleyip pasife alabilirsiniz.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <YoneticiSifresiAlani form={form} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={form.formState.isSubmitting}
        >
          Sil
        </Button>
      </DialogFooter>
    </form>
  )
}

export type PersonelIslemi =
  | { tur: "ekle" }
  | { tur: "duzenle"; personel: Personel }
  | { tur: "sifre"; personel: Personel }
  | { tur: "sil"; personel: Personel }

export function PersonelIslemDialog({
  islem,
  personelSayisi,
  onClose,
}: {
  islem: PersonelIslemi | null
  personelSayisi: number
  onClose: () => void
}) {
  return (
    <Dialog open={islem !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={islem?.tur === "sil" ? "sm:max-w-md" : "sm:max-w-lg"}
      >
        {/* İçerik her açılışta sıfırdan kurulsun (şifre alanları temiz başlasın) */}
        {islem?.tur === "ekle" && (
          <PersonelFormu
            mevcut={null}
            personelSayisi={personelSayisi}
            onClose={onClose}
          />
        )}
        {islem?.tur === "duzenle" && (
          <PersonelFormu
            key={islem.personel.id}
            mevcut={islem.personel}
            personelSayisi={personelSayisi}
            onClose={onClose}
          />
        )}
        {islem?.tur === "sifre" && (
          <SifreFormu
            key={islem.personel.id}
            personel={islem.personel}
            onClose={onClose}
          />
        )}
        {islem?.tur === "sil" && (
          <SilFormu
            key={islem.personel.id}
            personel={islem.personel}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
