import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  LockPasswordIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "@hugeicons/core-free-icons"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
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
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { kasaMetaQuery } from "@/features/kasa/queries"
import {
  DENEME_BEKLEME_MS,
  MAKS_HATALI_DENEME,
  useKasaAcik,
  useVaultStore,
} from "@/features/kasa/store"
import { deriveKey, verifyKey } from "@/lib/crypto"

const demoModu =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS === "true"

/** Uygulama genelinde tek örnek: `requireKey()` çağrıldığında açılır. */
export function KasaKilitDialog() {
  const acik = useVaultStore((s) => s.dialogAcik)
  const closeDialog = useVaultStore((s) => s.closeDialog)

  return (
    <Dialog open={acik} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        {/* İçerik her açılışta sıfırdan kurulsun (şifre alanı temiz başlasın) */}
        {acik && <KilitAcmaFormu />}
      </DialogContent>
    </Dialog>
  )
}

function KilitAcmaFormu() {
  const queryClient = useQueryClient()
  const unlock = useVaultStore((s) => s.unlock)
  const beklemeBitis = useVaultStore((s) => s.beklemeBitis)
  const hataliDenemeKaydet = useVaultStore((s) => s.hataliDenemeKaydet)
  const beklemeyiBitir = useVaultStore((s) => s.beklemeyiBitir)
  const [sifre, setSifre] = useState("")
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  useEffect(() => {
    if (!beklemeBitis) return
    const timer = setTimeout(
      beklemeyiBitir,
      Math.max(beklemeBitis - Date.now(), 0)
    )
    return () => clearTimeout(timer)
  }, [beklemeBitis, beklemeyiBitir])

  const kilitli = beklemeBitis !== null

  const gonder = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!sifre || kilitli) return
    setYukleniyor(true)
    setHata(null)
    try {
      const meta = await queryClient.fetchQuery(kasaMetaQuery)
      const key = await deriveKey(sifre, meta.salt, meta.iterations)
      if (await verifyKey(key, meta.verifier)) {
        unlock(key)
        return
      }
      const deneme = hataliDenemeKaydet()
      setSifre("")
      setHata(
        deneme >= MAKS_HATALI_DENEME
          ? `Çok fazla hatalı deneme. ${DENEME_BEKLEME_MS / 1000} saniye bekleyin.`
          : `Ana şifre hatalı (${deneme}/${MAKS_HATALI_DENEME})`
      )
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Kasa açılamadı")
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={LockPasswordIcon}
            strokeWidth={2}
            className="size-5"
          />
          Şifre kasasının kilidini aç
        </DialogTitle>
        <DialogDescription>
          Mükellef şifreleri büro ana şifresiyle şifrelenir. Ana şifre hiçbir
          yerde saklanmaz; kasa 5 dakika hareketsizlikte otomatik kilitlenir.
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={Boolean(hata) || undefined}>
        <FieldLabel htmlFor="kasa-ana-sifre">Ana şifre</FieldLabel>
        <Input
          id="kasa-ana-sifre"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={sifre}
          disabled={kilitli}
          aria-invalid={Boolean(hata) || undefined}
          onChange={(event) => setSifre(event.target.value)}
        />
        {demoModu && (
          <FieldDescription>
            Demo ortamı ana şifresi: <code className="font-mono">demo1234</code>
          </FieldDescription>
        )}
        <FieldError>{hata}</FieldError>
      </Field>

      {kilitli && (
        <Alert variant="destructive">
          <AlertDescription>
            Güvenlik nedeniyle deneme geçici olarak durduruldu.
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!sifre || yukleniyor || kilitli}>
          {yukleniyor ? "Açılıyor…" : "Kilidi aç"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Kullanıcı etkinliğini izler, hareketsizlikte kasayı kilitler. AppLayout'ta bir kez render edilir. */
export function KasaOtomatikKilit({
  kontrolAraligiMs = 15_000,
}: {
  kontrolAraligiMs?: number
}) {
  const acik = useKasaAcik()

  useEffect(() => {
    if (!acik) return
    const { touch, lockIfIdle } = useVaultStore.getState()
    let sonDokunus = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - sonDokunus < 1000) return
      sonDokunus = now
      touch(now)
    }
    const olaylar = ["pointerdown", "keydown", "scroll"] as const
    olaylar.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    )
    const interval = setInterval(() => lockIfIdle(), kontrolAraligiMs)
    return () => {
      olaylar.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(interval)
    }
  }, [acik, kontrolAraligiMs])

  return null
}

/** Sayfa içi kasa durumu bandı (şifreler sekmesi, kasa sayfası). */
export function KasaDurumUyarisi() {
  const acik = useKasaAcik()
  const lock = useVaultStore((s) => s.lock)
  const requireKey = useVaultStore((s) => s.requireKey)

  return acik ? (
    <Alert>
      <HugeiconsIcon icon={SquareUnlock02Icon} strokeWidth={2} />
      <AlertTitle>Kasa açık</AlertTitle>
      <AlertDescription>
        Şifreleri görüntüleyebilir ve kopyalayabilirsiniz. Her erişim kayıt
        altına alınır.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={lock}>
          Kasayı kilitle
        </Button>
      </AlertAction>
    </Alert>
  ) : (
    <Alert>
      <HugeiconsIcon icon={SquareLock02Icon} strokeWidth={2} />
      <AlertTitle>Kasa kilitli</AlertTitle>
      <AlertDescription>
        Kullanıcı adları görünür; şifreleri görmek veya değiştirmek için kasanın
        kilidini açın.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" onClick={() => requireKey()}>
          Kilidi aç
        </Button>
      </AlertAction>
    </Alert>
  )
}
