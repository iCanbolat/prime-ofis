import { useState } from "react"
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
import { kasaApi } from "@/features/kasa/api"
import { useKasaAnahtarDegistir, useKasaKurulum } from "@/features/kasa/queries"
import { useVaultStore } from "@/features/kasa/store"
import {
  createVerifier,
  decryptJson,
  deriveKey,
  encryptJson,
  generateSalt,
  verifyKey,
  KDF_ITERATIONS,
} from "@/lib/crypto"
import type { KasaMetaResponse } from "@prime/shared/types/api"

/** Ana şifre tüm mükellef şifrelerini korur; giriş şifresinden uzun tutulur */
export const ANA_SIFRE_MIN_UZUNLUK = 10

/** Yeni ana şifreden kasa meta'sı ve anahtarı üretir (istemcide; sunucu şifreyi görmez) */
async function yeniKasaMetasi(sifre: string) {
  const salt = generateSalt()
  const key = await deriveKey(sifre, salt, KDF_ITERATIONS)
  const meta: KasaMetaResponse = {
    salt,
    iterations: KDF_ITERATIONS,
    verifier: await createVerifier(key),
  }
  return { key, meta }
}

function sifreHatasi(sifre: string, tekrar: string) {
  if (sifre.length < ANA_SIFRE_MIN_UZUNLUK)
    return `Ana şifre en az ${ANA_SIFRE_MIN_UZUNLUK} karakter olmalı`
  if (sifre !== tekrar) return "Şifreler eşleşmiyor"
  return null
}

/** Yeni ana şifre + tekrar alanları */
function AnaSifreAlanlari({
  sifre,
  tekrar,
  hata,
  onSifre,
  onTekrar,
}: {
  sifre: string
  tekrar: string
  hata: string | null
  onSifre: (v: string) => void
  onTekrar: (v: string) => void
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="kasa-yeni-sifre">Yeni ana şifre</FieldLabel>
        <Input
          id="kasa-yeni-sifre"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={sifre}
          onChange={(e) => onSifre(e.target.value)}
        />
        <FieldDescription>
          En az {ANA_SIFRE_MIN_UZUNLUK} karakter. Ana şifre sunucuya
          gönderilmez; unutulursa kasadaki şifreler kurtarılamaz.
        </FieldDescription>
      </Field>
      <Field data-invalid={Boolean(hata) || undefined}>
        <FieldLabel htmlFor="kasa-yeni-sifre-tekrar">
          Yeni ana şifre (tekrar)
        </FieldLabel>
        <Input
          id="kasa-yeni-sifre-tekrar"
          type="password"
          autoComplete="new-password"
          value={tekrar}
          aria-invalid={Boolean(hata) || undefined}
          onChange={(e) => onTekrar(e.target.value)}
        />
        <FieldError>{hata}</FieldError>
      </Field>
    </FieldGroup>
  )
}

/** İlk kurulum (yönetici): kasa meta'sı oluşturulur ve kasa yeni anahtarla açılır */
export function KasaKurulumDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <KurulumFormu onBitti={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function KurulumFormu({ onBitti }: { onBitti: () => void }) {
  const kurulum = useKasaKurulum()
  const unlock = useVaultStore((s) => s.unlock)
  const [sifre, setSifre] = useState("")
  const [tekrar, setTekrar] = useState("")
  const [hata, setHata] = useState<string | null>(null)
  const [hazirlaniyor, setHazirlaniyor] = useState(false)

  const gonder = async (event: React.FormEvent) => {
    event.preventDefault()
    const sorun = sifreHatasi(sifre, tekrar)
    setHata(sorun)
    if (sorun) return
    setHazirlaniyor(true)
    try {
      const { key, meta } = await yeniKasaMetasi(sifre)
      await kurulum.mutateAsync(meta)
      unlock(key)
      toast.success("Şifre kasası kuruldu")
      onBitti()
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Kasa kurulamadı")
    } finally {
      setHazirlaniyor(false)
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Şifre kasasını kur</DialogTitle>
        <DialogDescription>
          Mükellef şifreleri bu ana şifreyle tarayıcıda şifrelenir. Ana şifreyi
          kasayı kullanacak personelle güvenli bir yoldan paylaşın.
        </DialogDescription>
      </DialogHeader>
      <AnaSifreAlanlari
        sifre={sifre}
        tekrar={tekrar}
        hata={hata}
        onSifre={setSifre}
        onTekrar={setTekrar}
      />
      <DialogFooter>
        <Button type="submit" disabled={!sifre || !tekrar || hazirlaniyor}>
          {hazirlaniyor ? "Kuruluyor…" : "Kasayı kur"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Ana şifre değişimi (yönetici, kasa açıkken): tüm kayıtlar mevcut anahtarla çözülüp yeni
 * anahtarla şifrelenir ve tek istekte gönderilir. Sunucu kayıt kümesi değiştiyse 409 döner.
 */
export function AnaSifreDegistirDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <AnaSifreDegistirFormu onBitti={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AnaSifreDegistirFormu({ onBitti }: { onBitti: () => void }) {
  const degistir = useKasaAnahtarDegistir()
  const unlock = useVaultStore((s) => s.unlock)
  const [sifre, setSifre] = useState("")
  const [tekrar, setTekrar] = useState("")
  const [hata, setHata] = useState<string | null>(null)
  const [durum, setDurum] = useState<string | null>(null)

  const gonder = async (event: React.FormEvent) => {
    event.preventDefault()
    const eskiKey = useVaultStore.getState().key
    if (!eskiKey) {
      setHata("Önce kasanın kilidini açın")
      return
    }
    const sorun = sifreHatasi(sifre, tekrar)
    setHata(sorun)
    if (sorun) return
    try {
      setDurum("Kayıtlar okunuyor…")
      const [mevcutMeta, kayitlar] = await Promise.all([
        kasaApi.meta(),
        kasaApi.list(),
      ])
      if (!(await verifyKey(eskiKey, mevcutMeta.verifier))) {
        throw new Error(
          "Kasa anahtarı güncel değil; kasayı kilitleyip yeniden açın"
        )
      }
      const { key, meta } = await yeniKasaMetasi(sifre)
      setDurum(`${kayitlar.length} kayıt yeniden şifreleniyor…`)
      const yeniKayitlar = await Promise.all(
        kayitlar.map(async (c) => ({
          id: c.id,
          ...(await encryptJson(await decryptJson(c, eskiKey), key)),
        }))
      )
      setDurum("Kaydediliyor…")
      await degistir.mutateAsync({ meta, kayitlar: yeniKayitlar })
      unlock(key)
      toast.success("Kasa ana şifresi değiştirildi")
      onBitti()
    } catch (error) {
      setHata(
        error instanceof Error ? error.message : "Ana şifre değiştirilemedi"
      )
    } finally {
      setDurum(null)
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Kasa ana şifresini değiştir</DialogTitle>
        <DialogDescription>
          Tüm mükellef şifreleri bu tarayıcıda yeni ana şifreyle yeniden
          şifrelenir. Diğer personel kasayı yeni ana şifreyle açmalıdır; eski
          şifreyle açık kalan kasalar kayıt yapamaz.
        </DialogDescription>
      </DialogHeader>
      <AnaSifreAlanlari
        sifre={sifre}
        tekrar={tekrar}
        hata={hata}
        onSifre={setSifre}
        onTekrar={setTekrar}
      />
      <DialogFooter>
        <Button type="submit" disabled={!sifre || !tekrar || Boolean(durum)}>
          {durum ?? "Ana şifreyi değiştir"}
        </Button>
      </DialogFooter>
    </form>
  )
}
