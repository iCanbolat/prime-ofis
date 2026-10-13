import { useState } from "react"
import { Link } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  useSgkErisim,
  useSgkErisimKaldir,
  useSgkErisimKaydet,
  useSgkErisimleri,
} from "@/features/borc/queries"
import { useCredentials } from "@/features/kasa/queries"
import { useVaultStore } from "@/features/kasa/store"
import { DecryptError, decryptJson } from "@/lib/crypto"
import { formatDateTime } from "@prime/shared/lib/format"
import { ApiError } from "@/lib/http"
import { cn } from "@/lib/utils"
import { z } from "@prime/shared/lib/zod"
import type { SgkErisimSatiri, SgkErisimSatirDurumu } from "@prime/shared/types/api"
import type { CredentialSecret } from "@prime/shared/types/domain"

const sgkSchema = z.object({
  kullaniciAdi: z
    .string()
    .trim()
    .min(2, "Kullanıcı adı en az 2 karakter olmalı")
    .max(40, "Kullanıcı adı en çok 40 karakter olabilir"),
  isyeriKodu: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "İşyeri kodu 1–10 haneli olmalı"),
  sistemSifre: z.string().min(4, "Sistem şifresi en az 4 karakter olmalı"),
  isyeriSifre: z.string().min(4, "İşyeri şifresi en az 4 karakter olmalı"),
})

type SgkFormValues = z.infer<typeof sgkSchema>

const DURUM_ETIKET: Record<SgkErisimSatirDurumu, string> = {
  AKTIF: "Sorgulanıyor",
  HATA: "Giriş başarısız",
  TANIMSIZ: "Tanımlı değil",
}

const DURUM_RENK: Record<SgkErisimSatirDurumu, string> = {
  AKTIF: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  HATA: "bg-destructive/10 text-destructive",
  TANIMSIZ: "bg-muted text-muted-foreground",
}

function SgkDurumBadge({ durum }: { durum: SgkErisimSatirDurumu }) {
  return (
    <Badge variant="secondary" className={cn(DURUM_RENK[durum])}>
      {DURUM_ETIKET[durum]}
    </Badge>
  )
}

/**
 * Şifreler yalnızca bu formda yaşar; backend'e bir kez gider. Kasadaki SGK kaydı varsa sistem ve
 * işyeri şifresi tarayıcıda kasa anahtarıyla çözülüp aynı istekle gönderilir (kasa sıfır bilgili
 * kalır). İşyeri kodu kasada tutulmadığı için formdan alınır.
 */
function SgkErisimForm({
  satir,
  onClose,
}: {
  satir: SgkErisimSatiri
  onClose: () => void
}) {
  const kaydet = useSgkErisimKaydet()
  const credentials = useCredentials({ mukellefId: satir.mukellefId })
  const requireKey = useVaultStore((s) => s.requireKey)
  const kasa = credentials.data?.find((c) => c.id === satir.kasaKaydiId)
  const mevcut = satir.erisim
  const { register, handleSubmit, setError, trigger, getValues, formState } =
    useForm<SgkFormValues>({
      resolver: zodResolver(sgkSchema),
      defaultValues: {
        kullaniciAdi: mevcut?.kullaniciAdi ?? kasa?.kullaniciAdi ?? "",
        isyeriKodu: mevcut?.isyeriKodu ?? "",
        sistemSifre: "",
        isyeriSifre: "",
      },
    })
  const { errors } = formState

  const gonder = async (v: SgkFormValues & { kasaCredentialId?: string }) => {
    try {
      await kaydet.mutateAsync({ mukellefId: satir.mukellefId, ...v })
      toast.success(
        "SGK erişimi kaydedildi; prim borcu bu geceden itibaren sorgulanır"
      )
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422)
        setError("isyeriSifre", { message: error.message })
      else toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
    }
  }

  const kasadanKullan = async () => {
    if (!kasa) return
    if (!(await trigger(["kullaniciAdi", "isyeriKodu"]))) return
    requireKey(async (key) => {
      try {
        const secret = await decryptJson<CredentialSecret>(kasa, key)
        if (!secret.ekSifre) {
          toast.error("Kasadaki SGK kaydında işyeri şifresi yok")
          return
        }
        await gonder({
          kullaniciAdi: getValues("kullaniciAdi").trim(),
          isyeriKodu: getValues("isyeriKodu").trim(),
          sistemSifre: secret.sifre,
          isyeriSifre: secret.ekSifre,
          kasaCredentialId: kasa.id,
        })
      } catch (error) {
        toast.error(
          error instanceof DecryptError
            ? "Şifre çözülemedi. Kayıt farklı bir kasa anahtarıyla şifrelenmiş olabilir."
            : error instanceof Error
              ? error.message
              : "Aktarılamadı"
        )
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit((v) => gonder(v))}
      noValidate
      className="grid gap-6"
    >
      <DialogHeader>
        <DialogTitle>SGK sorgu erişimi</DialogTitle>
        <DialogDescription>
          {satir.mukellefUnvan} adına SGK İşveren Sistemi'ne salt okunur giriş
          yapılır: prim borcu her gece sorgulanır, borcu yoktur yazısı
          istenebilir.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.kullaniciAdi) || undefined}>
          <FieldLabel htmlFor="sgk-kullanici">Kullanıcı adı</FieldLabel>
          <Input
            id="sgk-kullanici"
            autoComplete="off"
            aria-invalid={Boolean(errors.kullaniciAdi) || undefined}
            {...register("kullaniciAdi")}
          />
          <FieldError>{errors.kullaniciAdi?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.isyeriKodu) || undefined}>
          <FieldLabel htmlFor="sgk-isyeri">İşyeri kodu</FieldLabel>
          <Input
            id="sgk-isyeri"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.isyeriKodu) || undefined}
            {...register("isyeriKodu")}
          />
          <FieldError>{errors.isyeriKodu?.message}</FieldError>
        </Field>
        {kasa && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Şifre kasasında bu mükellefin SGK kaydı var ({kasa.kullaniciAdi}).
            </span>
            <Button
              type="button"
              size="sm"
              disabled={formState.isSubmitting || kaydet.isPending}
              onClick={kasadanKullan}
            >
              Kasadaki şifreleri kullan
            </Button>
          </div>
        )}
        <Field data-invalid={Boolean(errors.sistemSifre) || undefined}>
          <FieldLabel htmlFor="sgk-sistem">Sistem şifresi</FieldLabel>
          <Input
            id="sgk-sistem"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.sistemSifre) || undefined}
            {...register("sistemSifre")}
          />
          {mevcut && (
            <FieldDescription>
              Kayıtlı ••••{mevcut.sistemSifreIpucu}. Değiştirmek için yenisini
              girin.
            </FieldDescription>
          )}
          <FieldError>{errors.sistemSifre?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.isyeriSifre) || undefined}>
          <FieldLabel htmlFor="sgk-isyeri-sifre">İşyeri şifresi</FieldLabel>
          <Input
            id="sgk-isyeri-sifre"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.isyeriSifre) || undefined}
            {...register("isyeriSifre")}
          />
          <FieldDescription>
            {mevcut
              ? `Kayıtlı ••••${mevcut.isyeriSifreIpucu}.`
              : "Sunucuda kasadan ayrı, şifreli saklanır ve bir daha gösterilmez."}
          </FieldDescription>
          <FieldError>{errors.isyeriSifre?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "SGK'ya giriş deneniyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function SgkErisimDialog({
  satir,
  onClose,
}: {
  satir: SgkErisimSatiri | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(satir)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {satir && <SgkErisimForm satir={satir} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** Mükellef kartında SGK erişimi: durum, son sorgu, tanımla / güncelle / kaldır */
export function SgkErisimKarti({ mukellefId }: { mukellefId: string }) {
  const erisim = useSgkErisim(mukellefId)
  const kaldir = useSgkErisimKaldir()
  const [duzenle, setDuzenle] = useState(false)
  const [kaldirilacak, setKaldirilacak] = useState(false)

  if (erisim.isError)
    return <ErrorState error={erisim.error} onRetry={() => erisim.refetch()} />
  if (!erisim.data) return <LoadingState />
  const s = erisim.data
  const e = s.erisim
  const aciklama = !e
    ? "Tanımlanınca prim borcu her gece sorgulanır ve SGK borcu yoktur yazısı istenebilir."
    : e.durum === "HATA"
      ? `${e.hataMesaji ?? "SGK'ya giriş yapılamadı"}. Şifre güncellenene kadar sorgulanmaz.`
      : "Prim borcu her gece sorgulanır."

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          SGK İşveren Sistemi
          <SgkDurumBadge durum={s.durum} />
        </CardTitle>
        <CardDescription
          className={e?.durum === "HATA" ? "text-destructive" : undefined}
        >
          {aciklama}
          {e && (
            <span className="block text-muted-foreground">
              Kullanıcı {e.kullaniciAdi} · işyeri {e.isyeriKodu} · şifreler ••••
              {e.sistemSifreIpucu} / ••••{e.isyeriSifreIpucu}
              {e.kasaKaynagi && " (kasadan)"}
              {e.sonSorgu && ` · son sorgu ${formatDateTime(e.sonSorgu)}`}
            </span>
          )}
          {s.kasaDahaYeni && (
            <span className="block text-amber-800 dark:text-amber-300">
              Şifre kasasındaki SGK kaydı, sorgunun kullandığından daha yeni.
            </span>
          )}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={e ? "outline" : "default"}
            onClick={() => setDuzenle(true)}
          >
            {e ? "Şifreyi güncelle" : "Erişim tanımla"}
          </Button>
          {e && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setKaldirilacak(true)}
            >
              Kaldır
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <SgkErisimDialog
        satir={duzenle ? s : null}
        onClose={() => setDuzenle(false)}
      />
      <ConfirmDialog
        open={kaldirilacak}
        onOpenChange={setKaldirilacak}
        title="SGK erişimi kaldırılsın mı?"
        description="Bu mükellefin prim borcu artık sorgulanmaz. Önceki sorgu sonuçları silinmez."
        confirmLabel="Kaldır"
        destructive
        pending={kaldir.isPending}
        onConfirm={() =>
          kaldir.mutate(mukellefId, {
            onSuccess: () => {
              toast.success("SGK erişimi kaldırıldı")
              setKaldirilacak(false)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </Card>
  )
}

/** Sorgulanamayan mükellefler: SGK erişimi hatalı / tanımsız; GİB erişimi e-Tebligat'ta yönetilir */
export function ErisimlerSheet({
  open,
  onClose,
  gibSorunlu,
}: {
  open: boolean
  onClose: () => void
  gibSorunlu: number
}) {
  const erisimler = useSgkErisimleri({}, open)
  const [duzenlenen, setDuzenlenen] = useState<SgkErisimSatiri | null>(null)
  const sorunlu = (erisimler.data ?? []).filter((s) => s.durum !== "AKTIF")

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>Sorgu erişimleri</SheetTitle>
          <SheetDescription>
            GİB sorguları e-Tebligat için tanımlı İnteraktif VD erişimini
            kullanır; SGK sorguları için ayrı erişim gerekir.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 overflow-y-auto px-4 pb-6">
          <section className="grid gap-2" aria-label="GİB erişimleri">
            <h3 className="text-sm font-medium">GİB (İnteraktif VD)</h3>
            <p className="text-sm text-muted-foreground">
              {gibSorunlu > 0
                ? `${gibSorunlu} mükellefin GİB erişimi tanımsız ya da hatalı; vergi borcu ve levhası sorgulanamaz.`
                : "Tüm aktif mükelleflerin GİB erişimi çalışıyor."}{" "}
              <Link to="/tebligat?erisim=" className="underline">
                GİB erişimlerini düzenle
              </Link>
            </p>
          </section>
          <section className="grid gap-2" aria-label="SGK erişimleri">
            <h3 className="text-sm font-medium">
              SGK İşveren Sistemi{sorunlu.length > 0 && ` (${sorunlu.length})`}
            </h3>
            {erisimler.isError ? (
              <ErrorState
                error={erisimler.error}
                onRetry={() => erisimler.refetch()}
              />
            ) : !erisimler.data ? (
              <LoadingState />
            ) : sorunlu.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                SGK işyeri olan tüm mükelleflerin erişimi çalışıyor.
              </p>
            ) : (
              <ul className="divide-y rounded-2xl border">
                {sorunlu.map((s) => (
                  <li
                    key={s.mukellefId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="grid min-w-0 text-sm">
                      <Link
                        to={`/mukellefler/${s.mukellefId}/borc`}
                        className="truncate font-medium hover:underline"
                      >
                        {s.mukellefUnvan}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {s.erisim?.hataMesaji ?? "Erişim tanımlı değil"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDuzenlenen(s)}
                    >
                      {s.erisim ? "Şifreyi güncelle" : "Tanımla"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
      <SgkErisimDialog satir={duzenlenen} onClose={() => setDuzenlenen(null)} />
    </Sheet>
  )
}
