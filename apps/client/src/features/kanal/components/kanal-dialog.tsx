import { Controller, useForm } from "react-hook-form"
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
import { useKanalKaydet } from "@/features/kanal/queries"
import { KANAL_ETIKET, WHATSAPP_SABLON_ETIKET } from "@prime/shared/kanal/sabitler"
import { ApiError } from "@/lib/http"
import { z } from "@prime/shared/lib/zod"
import type {
  EpostaKanalAyari,
  KanalAyari,
  KanalTip,
  TelegramKanalAyari,
  WhatsappKanalAyari,
  WhatsappSablon,
} from "@prime/shared/types/domain"

const SABLONLAR = Object.keys(WHATSAPP_SABLON_ETIKET) as WhatsappSablon[]

/** Gizli alan: ilk kurulumda zorunlu, güncellemede boş bırakılırsa mevcut korunur */
const gizli = (zorunlu: boolean, mesaj: string) =>
  zorunlu ? z.string().min(4, mesaj) : z.string()

const epostaSchema = (yeni: boolean) =>
  z.object({
    aktif: z.boolean(),
    sunucu: z.string().trim().min(3, "SMTP sunucusunu yazın"),
    port: z.number("Port girin").int().min(1).max(65535),
    guvenlik: z.enum(["TLS", "STARTTLS"]),
    kullanici: z.string().trim().min(3, "Kullanıcı adını yazın"),
    gonderenAd: z.string().trim().max(80),
    gonderenAdres: z.email("Geçerli bir adres girin"),
    sifre: gizli(yeni, "SMTP şifresini girin"),
  })

const telegramSchema = (yeni: boolean) =>
  z.object({
    aktif: z.boolean(),
    botKullaniciAdi: z
      .string()
      .trim()
      .regex(
        /^@?\w{5,32}bot$/i,
        "Bot adı 'bot' ile bitmeli (ör. PrimeOfisBot)"
      ),
    token: gizli(yeni, "BotFather'dan aldığınız token'ı girin"),
  })

const whatsappSchema = (yeni: boolean) =>
  z.object({
    aktif: z.boolean(),
    telefonNumarasiId: z.string().regex(/^\d{6,20}$/, "Yalnızca rakam"),
    wabaId: z.string().regex(/^\d{6,20}$/, "Yalnızca rakam"),
    gorunenNumara: z.string().trim().min(10, "Numarayı yazın"),
    erisimAnahtari: gizli(yeni, "Kalıcı erişim anahtarını girin"),
    sablonlar: z.record(
      z.string(),
      z
        .string()
        .trim()
        .regex(/^[a-z0-9_]*$/, "Küçük harf, rakam ve alt çizgi")
    ),
  })

function Gizli({
  id,
  etiket,
  ipucu,
  hata,
  ...rest
}: {
  id: string
  etiket: string
  ipucu?: string
  hata?: string
} & React.ComponentProps<typeof Input>) {
  return (
    <Field data-invalid={Boolean(hata) || undefined}>
      <FieldLabel htmlFor={id}>{etiket}</FieldLabel>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        aria-invalid={Boolean(hata) || undefined}
        {...rest}
      />
      <FieldDescription>
        {ipucu
          ? `Kayıtlı değer ••••${ipucu}. Değiştirmek istemiyorsanız boş bırakın.`
          : "Sunucuda şifreli saklanır, bir daha gösterilmez."}
      </FieldDescription>
      <FieldError>{hata}</FieldError>
    </Field>
  )
}

function AktifAlani({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
      />
      <FieldLabel htmlFor={id}>Kanal etkin</FieldLabel>
    </Field>
  )
}

function useKaydetVeKapat(onClose: () => void) {
  const kaydet = useKanalKaydet()
  return {
    kaydet,
    /** 422: sağlayıcı kimlik bilgisini reddetti → gizli alana yazılır */
    gonder: async (
      body: Parameters<typeof kaydet.mutateAsync>[0],
      gizliHatasi: (mesaj: string) => void
    ) => {
      try {
        await kaydet.mutateAsync(body)
        toast.success(`${KANAL_ETIKET[body.tip]} kaydedildi`)
        onClose()
      } catch (error) {
        if (error instanceof ApiError && error.status === 422)
          gizliHatasi(error.message)
        else
          toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
      }
    },
  }
}

function EpostaForm({
  mevcut,
  onClose,
}: {
  mevcut?: EpostaKanalAyari
  onClose: () => void
}) {
  const { gonder } = useKaydetVeKapat(onClose)
  const schema = epostaSchema(!mevcut)
  const { register, control, handleSubmit, setError, formState } = useForm<
    z.infer<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      aktif: mevcut?.aktif ?? true,
      sunucu: mevcut?.sunucu ?? "",
      port: mevcut?.port ?? 587,
      guvenlik: mevcut?.guvenlik ?? "STARTTLS",
      kullanici: mevcut?.kullanici ?? "",
      gonderenAd: mevcut?.gonderenAd ?? "",
      gonderenAdres: mevcut?.gonderenAdres ?? "",
      sifre: "",
    },
  })
  const e = formState.errors
  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={handleSubmit((v) =>
        gonder(
          { tip: "EPOSTA", ...v, sifre: v.sifre || undefined },
          (message) => setError("sifre", { message })
        )
      )}
    >
      <DialogHeader>
        <DialogTitle>E-posta (SMTP)</DialogTitle>
        <DialogDescription>
          Hatırlatmalar ve mükellef e-postaları bu hesaptan gönderilir. Gmail /
          Outlook için uygulama şifresi kullanın.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field data-invalid={Boolean(e.sunucu) || undefined}>
            <FieldLabel htmlFor="smtp-sunucu">SMTP sunucusu</FieldLabel>
            <Input
              id="smtp-sunucu"
              placeholder="smtp.gmail.com"
              {...register("sunucu")}
            />
            <FieldError>{e.sunucu?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(e.port) || undefined}>
            <FieldLabel htmlFor="smtp-port">Port</FieldLabel>
            <Input
              id="smtp-port"
              type="number"
              {...register("port", { valueAsNumber: true })}
            />
            <FieldError>{e.port?.message}</FieldError>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="smtp-guvenlik">Güvenlik</FieldLabel>
          <Controller
            control={control}
            name="guvenlik"
            render={({ field }) => (
              <Select
                items={{ STARTTLS: "STARTTLS (587)", TLS: "TLS (465)" }}
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
              >
                <SelectTrigger id="smtp-guvenlik" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STARTTLS">STARTTLS (587)</SelectItem>
                  <SelectItem value="TLS">TLS (465)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field data-invalid={Boolean(e.kullanici) || undefined}>
          <FieldLabel htmlFor="smtp-kullanici">Kullanıcı adı</FieldLabel>
          <Input
            id="smtp-kullanici"
            autoComplete="off"
            {...register("kullanici")}
          />
          <FieldError>{e.kullanici?.message}</FieldError>
        </Field>
        <Gizli
          id="smtp-sifre"
          etiket="Şifre"
          ipucu={mevcut?.gizliIpucu}
          hata={e.sifre?.message}
          {...register("sifre")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="smtp-gonderen-ad">Gönderen adı</FieldLabel>
            <Input id="smtp-gonderen-ad" {...register("gonderenAd")} />
          </Field>
          <Field data-invalid={Boolean(e.gonderenAdres) || undefined}>
            <FieldLabel htmlFor="smtp-gonderen">Gönderen adresi</FieldLabel>
            <Input
              id="smtp-gonderen"
              type="email"
              {...register("gonderenAdres")}
            />
            <FieldError>{e.gonderenAdres?.message}</FieldError>
          </Field>
        </div>
        <Controller
          control={control}
          name="aktif"
          render={({ field }) => (
            <AktifAlani
              id="smtp-aktif"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FieldGroup>
      <Altbilgi bekliyor={formState.isSubmitting} onClose={onClose} />
    </form>
  )
}

function TelegramForm({
  mevcut,
  onClose,
}: {
  mevcut?: TelegramKanalAyari
  onClose: () => void
}) {
  const { gonder } = useKaydetVeKapat(onClose)
  const schema = telegramSchema(!mevcut)
  const { register, control, handleSubmit, setError, formState } = useForm<
    z.infer<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      aktif: mevcut?.aktif ?? true,
      botKullaniciAdi: mevcut?.botKullaniciAdi ?? "",
      token: "",
    },
  })
  const e = formState.errors
  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={handleSubmit((v) =>
        gonder(
          { tip: "TELEGRAM", ...v, token: v.token || undefined },
          (message) => setError("token", { message })
        )
      )}
    >
      <DialogHeader>
        <DialogTitle>Telegram botu</DialogTitle>
        <DialogDescription>
          Telegram'da @BotFather ile bir bot oluşturup token'ı girin. Personel,
          Bildirimlerim sekmesinden botla kendi hesabını eşler. Mükelleflere
          Telegram'dan mesaj gönderilmez.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(e.botKullaniciAdi) || undefined}>
          <FieldLabel htmlFor="tg-bot">Bot kullanıcı adı</FieldLabel>
          <Input
            id="tg-bot"
            placeholder="PrimeOfisBot"
            {...register("botKullaniciAdi")}
          />
          <FieldError>{e.botKullaniciAdi?.message}</FieldError>
        </Field>
        <Gizli
          id="tg-token"
          etiket="Bot token"
          ipucu={mevcut?.gizliIpucu}
          hata={e.token?.message}
          {...register("token")}
        />
        <Controller
          control={control}
          name="aktif"
          render={({ field }) => (
            <AktifAlani
              id="tg-aktif"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FieldGroup>
      <Altbilgi bekliyor={formState.isSubmitting} onClose={onClose} />
    </form>
  )
}

function WhatsappForm({
  mevcut,
  onClose,
}: {
  mevcut?: WhatsappKanalAyari
  onClose: () => void
}) {
  const { gonder } = useKaydetVeKapat(onClose)
  const schema = whatsappSchema(!mevcut)
  const { register, control, handleSubmit, setError, formState } = useForm<
    z.infer<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      aktif: mevcut?.aktif ?? true,
      telefonNumarasiId: mevcut?.telefonNumarasiId ?? "",
      wabaId: mevcut?.wabaId ?? "",
      gorunenNumara: mevcut?.gorunenNumara ?? "",
      erisimAnahtari: "",
      sablonlar: Object.fromEntries(
        SABLONLAR.map((s) => [s, mevcut?.sablonlar[s] ?? ""])
      ),
    },
  })
  const e = formState.errors
  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={handleSubmit((v) =>
        gonder(
          {
            tip: "WHATSAPP",
            ...v,
            erisimAnahtari: v.erisimAnahtari || undefined,
          },
          (message) => setError("erisimAnahtari", { message })
        )
      )}
    >
      <DialogHeader>
        <DialogTitle>WhatsApp Business</DialogTitle>
        <DialogDescription>
          Meta WhatsApp Cloud API bilgileri (Meta Business Suite → WhatsApp →
          API kurulumu). Mükellefe giden her mesaj Meta'da onaylı bir şablonla
          gönderilir; onaylanmamış türler için "WhatsApp'ta aç" kullanılır.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(e.telefonNumarasiId) || undefined}>
            <FieldLabel htmlFor="wa-phone-id">
              Telefon numarası kimliği
            </FieldLabel>
            <Input
              id="wa-phone-id"
              inputMode="numeric"
              {...register("telefonNumarasiId")}
            />
            <FieldError>{e.telefonNumarasiId?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(e.wabaId) || undefined}>
            <FieldLabel htmlFor="wa-waba">
              İşletme hesabı kimliği (WABA)
            </FieldLabel>
            <Input id="wa-waba" inputMode="numeric" {...register("wabaId")} />
            <FieldError>{e.wabaId?.message}</FieldError>
          </Field>
        </div>
        <Field data-invalid={Boolean(e.gorunenNumara) || undefined}>
          <FieldLabel htmlFor="wa-numara">Görünen numara</FieldLabel>
          <Input
            id="wa-numara"
            placeholder="+90 216 345 67 89"
            {...register("gorunenNumara")}
          />
          <FieldError>{e.gorunenNumara?.message}</FieldError>
        </Field>
        <Gizli
          id="wa-token"
          etiket="Kalıcı erişim anahtarı"
          ipucu={mevcut?.gizliIpucu}
          hata={e.erisimAnahtari?.message}
          {...register("erisimAnahtari")}
        />
        <FieldSet>
          <FieldLegend variant="label">Onaylı şablon adları</FieldLegend>
          <FieldDescription>
            Boş bırakılan tür WhatsApp Business ile gönderilemez.
          </FieldDescription>
          <div className="grid gap-3 sm:grid-cols-2">
            {SABLONLAR.map((s) => (
              <Field
                key={s}
                data-invalid={Boolean(e.sablonlar?.[s]) || undefined}
              >
                <FieldLabel htmlFor={`wa-sablon-${s}`}>
                  {WHATSAPP_SABLON_ETIKET[s]}
                </FieldLabel>
                <Input
                  id={`wa-sablon-${s}`}
                  className="font-mono text-xs"
                  placeholder="ornek_sablon_adi"
                  {...register(`sablonlar.${s}`)}
                />
                <FieldError>{e.sablonlar?.[s]?.message}</FieldError>
              </Field>
            ))}
          </div>
        </FieldSet>
        <Controller
          control={control}
          name="aktif"
          render={({ field }) => (
            <AktifAlani
              id="wa-aktif"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FieldGroup>
      <Altbilgi bekliyor={formState.isSubmitting} onClose={onClose} />
    </form>
  )
}

function Altbilgi({
  bekliyor,
  onClose,
}: {
  bekliyor: boolean
  onClose: () => void
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose}>
        Vazgeç
      </Button>
      <Button type="submit" disabled={bekliyor}>
        {bekliyor ? "Doğrulanıyor…" : "Kaydet"}
      </Button>
    </DialogFooter>
  )
}

export function KanalDialog({
  tip,
  mevcut,
  onClose,
}: {
  tip: KanalTip | null
  mevcut: KanalAyari | null | undefined
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(tip)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {tip === "EPOSTA" && (
          <EpostaForm
            mevcut={mevcut?.tip === "EPOSTA" ? mevcut : undefined}
            onClose={onClose}
          />
        )}
        {tip === "TELEGRAM" && (
          <TelegramForm
            mevcut={mevcut?.tip === "TELEGRAM" ? mevcut : undefined}
            onClose={onClose}
          />
        )}
        {tip === "WHATSAPP" && (
          <WhatsappForm
            mevcut={mevcut?.tip === "WHATSAPP" ? mevcut : undefined}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
