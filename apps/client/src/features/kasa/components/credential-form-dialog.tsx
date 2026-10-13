import { useState } from "react"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MagicWand01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { SISTEMLER } from "@prime/shared/kasa/sistemler"
import {
  useCreateCredential,
  useUpdateCredential,
} from "@/features/kasa/queries"
import { useTebligatErisimKaydetKasadan } from "@/features/tebligat/kasa-aktarim"
import { useTebligatErisim } from "@/features/tebligat/queries"
import { TEBLIGAT_KASA_SISTEMI } from "@prime/shared/tebligat/sabitler"
import { encryptJson, generatePassword } from "@/lib/crypto"
import { z } from "@prime/shared/lib/zod"
import type { CredentialKaydi } from "@prime/shared/types/api"
import type { CredentialSecret, Sistem } from "@prime/shared/types/domain"

const credentialSchema = z.object({
  kullaniciAdi: z.string().trim().min(1, "Kullanıcı adı zorunludur").max(100),
  sifre: z.string().min(1, "Şifre zorunludur").max(200),
  ekSifre: z.string().max(200),
  not: z.string().trim().max(300, "En fazla 300 karakter"),
})

type CredentialFormValues = z.infer<typeof credentialSchema>

export interface CredentialFormHedef {
  mukellefId: string
  sistem: Sistem
  /** Düzenlemede mevcut kayıt ve çözülmüş gizli alanlar */
  mevcut?: { credential: CredentialKaydi; secret: CredentialSecret }
}

interface CredentialFormDialogProps {
  hedef: CredentialFormHedef | null
  /** Kasa anahtarı: form yalnızca kasa açıkken açılır */
  cryptoKey: CryptoKey | null
  onClose: () => void
}

function GizliAlan({
  id,
  label,
  error,
  registerProps,
  onGenerate,
}: {
  id: string
  label: string
  error?: string
  registerProps: UseFormRegisterReturn
  onGenerate: () => void
}) {
  const [gorunur, setGorunur] = useState(false)
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type={gorunur ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={Boolean(error) || undefined}
          className="font-mono"
          {...registerProps}
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
          <InputGroupButton
            size="icon-xs"
            aria-label={`${label} üret`}
            onClick={onGenerate}
          >
            <HugeiconsIcon icon={MagicWand01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  )
}

/**
 * İnteraktif VD kaydı kaydedildikten sonra: e-Tebligat gece taraması da bu şifreyi kullansın mı?
 * Şifre zaten formda çözülmüş olduğundan kasa yeniden açılmaz; onay verilirse tek istekle sunucuya gider.
 */
function TebligatSorusu({
  credential,
  secret,
  mevcutIpucu,
  onClose,
}: {
  credential: CredentialKaydi
  secret: CredentialSecret
  mevcutIpucu?: string
  onClose: () => void
}) {
  const { kaydet, isPending } = useTebligatErisimKaydetKasadan()
  const onayla = async () => {
    try {
      await kaydet(credential, secret)
      toast.success(
        mevcutIpucu
          ? "e-Tebligat taraması yeni şifreyle güncellendi"
          : "e-Tebligat taraması bu geceden itibaren başlayacak"
      )
      onClose()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "e-Tebligat erişimi kaydedilemedi"
      )
    }
  }
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {mevcutIpucu
            ? "e-Tebligat taraması da bu şifreyi kullansın mı?"
            : "Bu şifreyle e-Tebligat taraması başlatılsın mı?"}
        </DialogTitle>
        <DialogDescription>
          {mevcutIpucu
            ? `Gece taraması şu an ••••${mevcutIpucu} ile GİB'e giriş yapıyor. `
            : "Mükellefin GİB e-Tebligat kutusu her gece taranır, tebligatlar sabah hazır olur. "}
          Onaylarsanız şifre bir kez sunucuya gönderilir ve kasadan ayrı, sunucu
          anahtarıyla şifreli saklanır; kasa sıfır bilgili kalır.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Hayır
        </Button>
        <Button type="button" disabled={isPending} onClick={onayla}>
          {isPending
            ? "GİB'e giriş deneniyor…"
            : mevcutIpucu
              ? "Evet, güncelle"
              : "Evet, başlat"}
        </Button>
      </DialogFooter>
    </div>
  )
}

function CredentialForm({
  hedef,
  cryptoKey,
  onClose,
}: {
  hedef: CredentialFormHedef
  cryptoKey: CryptoKey
  onClose: () => void
}) {
  const tanim = SISTEMLER[hedef.sistem]
  const create = useCreateCredential()
  const update = useUpdateCredential()
  const tebligatKaynagi = hedef.sistem === TEBLIGAT_KASA_SISTEMI
  const tebligat = useTebligatErisim(hedef.mukellefId, tebligatKaynagi)
  const [soru, setSoru] = useState<{
    credential: CredentialKaydi
    secret: CredentialSecret
  } | null>(null)
  const { register, handleSubmit, setValue, formState } =
    useForm<CredentialFormValues>({
      resolver: zodResolver(credentialSchema),
      defaultValues: {
        kullaniciAdi: hedef.mevcut?.credential.kullaniciAdi ?? "",
        sifre: hedef.mevcut?.secret.sifre ?? "",
        ekSifre: hedef.mevcut?.secret.ekSifre ?? "",
        not: hedef.mevcut?.credential.not ?? "",
      },
    })

  const onSubmit = handleSubmit(async (values) => {
    const secret: CredentialSecret = {
      sifre: values.sifre,
      ekSifre:
        tanim.ekSifreEtiketi && values.ekSifre ? values.ekSifre : undefined,
    }
    // Şifreler tarayıcıda şifrelenir; sunucuya yalnızca cipherText + iv gider.
    const encrypted = await encryptJson(secret, cryptoKey)
    const body = {
      kullaniciAdi: values.kullaniciAdi,
      not: values.not || undefined,
      ...encrypted,
    }
    try {
      let kayit: CredentialKaydi
      if (hedef.mevcut) {
        kayit = await update.mutateAsync({
          id: hedef.mevcut.credential.id,
          ...body,
        })
        toast.success(`${tanim.ad} şifresi güncellendi`)
      } else {
        kayit = await create.mutateAsync({
          mukellefId: hedef.mukellefId,
          sistem: hedef.sistem,
          ...body,
        })
        toast.success(`${tanim.ad} şifresi eklendi`)
      }
      const degisti =
        !hedef.mevcut ||
        hedef.mevcut.secret.sifre !== values.sifre ||
        hedef.mevcut.credential.kullaniciAdi !== values.kullaniciAdi
      if (tebligatKaynagi && degisti && tebligat.data) {
        setSoru({ credential: kayit, secret })
        return
      }
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  })

  const hata = (alan: keyof CredentialFormValues) =>
    formState.errors[alan]?.message

  if (soru)
    return (
      <TebligatSorusu
        credential={soru.credential}
        secret={soru.secret}
        mevcutIpucu={tebligat.data?.erisim?.sifreIpucu}
        onClose={onClose}
      />
    )

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {tanim.ad} şifresi {hedef.mevcut ? "düzenle" : "ekle"}
        </DialogTitle>
        <DialogDescription>{tanim.aciklama}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(hata("kullaniciAdi")) || undefined}>
          <FieldLabel htmlFor="cred-kullanici">
            {tanim.kullaniciAdiEtiketi}
          </FieldLabel>
          <Input
            id="cred-kullanici"
            autoComplete="off"
            aria-invalid={Boolean(hata("kullaniciAdi")) || undefined}
            {...register("kullaniciAdi")}
          />
          <FieldError>{hata("kullaniciAdi")}</FieldError>
        </Field>
        <GizliAlan
          id="cred-sifre"
          label={tanim.sifreEtiketi}
          error={hata("sifre")}
          registerProps={register("sifre")}
          onGenerate={() =>
            setValue("sifre", generatePassword(), { shouldValidate: true })
          }
        />
        {tanim.ekSifreEtiketi && (
          <GizliAlan
            id="cred-ek-sifre"
            label={tanim.ekSifreEtiketi}
            error={hata("ekSifre")}
            registerProps={register("ekSifre")}
            onGenerate={() => setValue("ekSifre", generatePassword(8))}
          />
        )}
        <Field data-invalid={Boolean(hata("not")) || undefined}>
          <FieldLabel htmlFor="cred-not">Not</FieldLabel>
          <Input id="cred-not" {...register("not")} />
          <FieldDescription>
            Not şifrelenmez; buraya şifre veya gizli bilgi yazmayın.
          </FieldDescription>
          <FieldError>{hata("not")}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          Kaydet
        </Button>
      </DialogFooter>
    </form>
  )
}

export function CredentialFormDialog({
  hedef,
  cryptoKey,
  onClose,
}: CredentialFormDialogProps) {
  const acik = Boolean(hedef && cryptoKey)
  return (
    <Dialog open={acik} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {hedef && cryptoKey && (
          <CredentialForm
            hedef={hedef}
            cryptoKey={cryptoKey}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
