import { useEffect, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CredentialFormDialog,
  type CredentialFormHedef,
} from "@/features/kasa/components/credential-form-dialog"
import {
  useCredentialErisim,
  useCredentials,
  useDeleteCredential,
} from "@/features/kasa/queries"
import { SISTEMLER, SISTEM_SIRASI } from "@prime/shared/kasa/sistemler"
import { GOSTERME_SURESI_MS, useVaultStore } from "@/features/kasa/store"
import { KasaTebligatSatiri } from "@/features/tebligat/components/kasa-tebligat-satiri"
import { TEBLIGAT_KASA_SISTEMI } from "@prime/shared/tebligat/sabitler"
import { copyWithAutoClear, PANO_TEMIZLEME_MS } from "@/lib/clipboard"
import { DecryptError, decryptJson } from "@/lib/crypto"
import { formatDateTime } from "@prime/shared/lib/format"
import type { CredentialKaydi } from "@prime/shared/types/api"
import type { CredentialSecret, Sistem } from "@prime/shared/types/domain"

const MASKE = "••••••••••"

function decryptHatasi(error: unknown) {
  toast.error(
    error instanceof DecryptError
      ? "Şifre çözülemedi. Kayıt farklı bir kasa anahtarıyla şifrelenmiş olabilir."
      : error instanceof Error
        ? error.message
        : "İşlem başarısız"
  )
}

interface CredentialKartiProps {
  mukellefId: string
  sistem: Sistem
  credential?: CredentialKaydi
  onEkle: () => void
  onDuzenle: (credential: CredentialKaydi, secret: CredentialSecret) => void
  onSil: (credential: CredentialKaydi) => void
}

export function CredentialKarti({
  sistem,
  credential,
  onEkle,
  onDuzenle,
  onSil,
}: CredentialKartiProps) {
  const tanim = SISTEMLER[sistem]
  const requireKey = useVaultStore((s) => s.requireKey)
  const aktifKey = useVaultStore((s) => s.key)
  const erisim = useCredentialErisim()
  // Çözülen şifre, çözüldüğü anahtarla birlikte tutulur
  const [acik, setAcik] = useState<{
    secret: CredentialSecret
    key: CryptoKey
  } | null>(null)

  // Görüntülenen şifre belirli süre sonra gizlenir
  useEffect(() => {
    if (!acik) return
    const timer = setTimeout(() => setAcik(null), GOSTERME_SURESI_MS)
    return () => clearTimeout(timer)
  }, [acik])

  // Kasa kilitlenirse (veya yeniden açılıp anahtar değişirse) şifre ekranda kalmaz
  const gorunenSecret = acik && acik.key === aktifKey ? acik.secret : null

  if (!credential) {
    return (
      <Card
        size="sm"
        role="region"
        aria-label={`${tanim.ad} şifresi`}
        className="border border-dashed shadow-none ring-0"
      >
        <CardHeader>
          <CardTitle>{tanim.ad}</CardTitle>
          <CardDescription>{tanim.aciklama}</CardDescription>
          <CardAction>
            <Badge
              variant="outline"
              className="text-amber-800 dark:text-amber-300"
            >
              Eksik
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="mt-auto">
          <Button size="sm" variant="outline" onClick={onEkle}>
            <HugeiconsIcon
              icon={Add01Icon}
              data-icon="inline-start"
              strokeWidth={2}
            />
            Şifre ekle
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const goster = () =>
    requireKey(async (key) => {
      try {
        const secret = await decryptJson<CredentialSecret>(credential, key)
        setAcik({ secret, key })
        erisim.mutate({ id: credential.id, eylem: "SIFRE_GORUNTULENDI" })
      } catch (error) {
        decryptHatasi(error)
      }
    })

  const kopyala = (alan: keyof CredentialSecret, etiket: string) =>
    requireKey(async (key) => {
      try {
        const secret = await decryptJson<CredentialSecret>(credential, key)
        const deger = secret[alan]
        if (!deger) return
        await copyWithAutoClear(deger)
        erisim.mutate({ id: credential.id, eylem: "SIFRE_KOPYALANDI" })
        toast.success(`${etiket} kopyalandı`, {
          description: `Pano ${PANO_TEMIZLEME_MS / 1000} saniye sonra temizlenecek.`,
        })
      } catch (error) {
        decryptHatasi(error)
      }
    })

  const duzenle = () =>
    requireKey(async (key) => {
      try {
        onDuzenle(
          credential,
          await decryptJson<CredentialSecret>(credential, key)
        )
      } catch (error) {
        decryptHatasi(error)
      }
    })

  const gizliSatir = (alan: keyof CredentialSecret, etiket: string) => (
    <div className="flex items-center justify-between gap-2">
      <div className="grid min-w-0">
        <span className="text-xs text-muted-foreground">{etiket}</span>
        <span
          className="truncate font-mono text-sm"
          data-testid={`${sistem}-${alan}`}
        >
          {gorunenSecret ? gorunenSecret[alan] || "—" : MASKE}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${tanim.ad} ${etiket} kopyala`}
        onClick={() => kopyala(alan, etiket)}
      >
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
      </Button>
    </div>
  )

  return (
    <Card size="sm" role="region" aria-label={`${tanim.ad} şifresi`}>
      <CardHeader>
        <CardTitle>{tanim.ad}</CardTitle>
        <CardDescription>{tanim.aciklama}</CardDescription>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tanim.ad} şifresini düzenle`}
            onClick={duzenle}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tanim.ad} şifresini sil`}
            onClick={() => onSil(credential)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid min-w-0">
            <span className="text-xs text-muted-foreground">
              {tanim.kullaniciAdiEtiketi}
            </span>
            <span className="truncate font-mono text-sm">
              {credential.kullaniciAdi}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tanim.ad} ${tanim.kullaniciAdiEtiketi} kopyala`}
            onClick={() =>
              navigator.clipboard
                .writeText(credential.kullaniciAdi)
                .then(() =>
                  toast.success(`${tanim.kullaniciAdiEtiketi} kopyalandı`)
                )
            }
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          </Button>
        </div>
        {gizliSatir("sifre", tanim.sifreEtiketi)}
        {tanim.ekSifreEtiketi && gizliSatir("ekSifre", tanim.ekSifreEtiketi)}
        {credential.not && (
          <p className="text-xs text-muted-foreground">Not: {credential.not}</p>
        )}
        {sistem === TEBLIGAT_KASA_SISTEMI && (
          <KasaTebligatSatiri credential={credential} />
        )}
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => (gorunenSecret ? setAcik(null) : goster())}
        >
          <HugeiconsIcon
            icon={gorunenSecret ? ViewOffSlashIcon : ViewIcon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          {gorunenSecret ? "Gizle" : `${tanim.ad} şifresini göster`}
        </Button>
        <p className="text-xs text-muted-foreground">
          Güncellendi: {formatDateTime(credential.sonGuncelleme)}
          {credential.sonErisim && (
            <>
              <br />
              Son erişim: {credential.sonErisim.aktorAdi},{" "}
              {formatDateTime(credential.sonErisim.zaman)}
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  )
}

/**
 * Bir mükellefin tüm sistem kartları + ekleme/düzenleme/silme pencereleri.
 * `sistemler` verilirse yalnızca o sistemler gösterilir (kasa sayfasındaki tekil hücre görünümü).
 */
export function MukellefCredentialKartlari({
  mukellefId,
  sistemler = SISTEM_SIRASI,
}: {
  mukellefId: string
  sistemler?: Sistem[]
}) {
  const credentials = useCredentials({ mukellefId })
  const key = useVaultStore((s) => s.key)
  const requireKey = useVaultStore((s) => s.requireKey)
  const sil = useDeleteCredential()
  const [formHedef, setFormHedef] = useState<CredentialFormHedef | null>(null)
  const [silinecek, setSilinecek] = useState<CredentialKaydi | null>(null)

  if (credentials.isPending) return <LoadingState />
  if (credentials.isError) {
    return (
      <ErrorState
        error={credentials.error}
        onRetry={() => credentials.refetch()}
      />
    )
  }

  const bySistem = new Map(credentials.data.map((c) => [c.sistem, c]))

  const silmeyiOnayla = () => {
    if (!silinecek) return
    sil.mutate(silinecek.id, {
      onSuccess: () => {
        toast.success(`${SISTEMLER[silinecek.sistem].ad} şifresi silindi`)
        setSilinecek(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      {/* Container query: kartlar bulunduğu alanın genişliğine göre (sayfa veya yan panel) dizilir */}
      <div className="@container">
        <div className="grid gap-4 @xl:grid-cols-2">
          {sistemler.map((sistem) => (
            <CredentialKarti
              key={sistem}
              mukellefId={mukellefId}
              sistem={sistem}
              credential={bySistem.get(sistem)}
              onEkle={() =>
                requireKey(() => setFormHedef({ mukellefId, sistem }))
              }
              onDuzenle={(credential, secret) =>
                setFormHedef({
                  mukellefId,
                  sistem,
                  mevcut: { credential, secret },
                })
              }
              onSil={setSilinecek}
            />
          ))}
        </div>
      </div>

      <CredentialFormDialog
        hedef={formHedef}
        cryptoKey={key}
        onClose={() => setFormHedef(null)}
      />

      <Dialog
        open={silinecek !== null}
        onOpenChange={(open) => !open && setSilinecek(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Şifre silinsin mi?</DialogTitle>
            <DialogDescription>
              {silinecek && SISTEMLER[silinecek.sistem].ad} giriş bilgileri
              kalıcı olarak silinecek.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Vazgeç
            </DialogClose>
            <Button
              variant="destructive"
              onClick={silmeyiOnayla}
              disabled={sil.isPending}
            >
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
