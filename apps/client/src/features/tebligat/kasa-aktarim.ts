/**
 * Kasadaki İnteraktif VD şifresini e-Tebligat gece taramasına aktarma.
 *
 * Kasa sıfır bilgilidir: şifre yalnızca tarayıcıda, kasa anahtarıyla çözülür ve tek bir
 * `PUT /tebligat/erisim/:mukellefId` isteğiyle sunucuya gider; sunucu onu kendi anahtarıyla (KMS)
 * ayrı tabloda saklar. Kasadaki kayıt değişmez, sunucu kasayı hiçbir zaman çözemez.
 */
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { kasaKeys } from "@/features/kasa/queries"
import { useVaultStore } from "@/features/kasa/store"
import { useTebligatErisimKaydet } from "@/features/tebligat/queries"
import { DecryptError, decryptJson } from "@/lib/crypto"
import type { CredentialKaydi } from "@prime/shared/types/api"
import type { CredentialSecret } from "@prime/shared/types/domain"

export function useTebligatErisimKaydetKasadan() {
  const kaydet = useTebligatErisimKaydet()
  const queryClient = useQueryClient()
  return {
    isPending: kaydet.isPending,
    /** Çözülmüş şifreyle kaydeder (kasa formunda şifre zaten elde) */
    kaydet: async (credential: CredentialKaydi, secret: CredentialSecret) => {
      await kaydet.mutateAsync({
        mukellefId: credential.mukellefId,
        kullaniciKodu: credential.kullaniciAdi.trim(),
        sifre: secret.sifre,
        kasaCredentialId: credential.id,
      })
      // Kasa kartındaki "son erişim" aktarımı da gösterir
      await queryClient.invalidateQueries({ queryKey: kasaKeys.lists() })
    },
  }
}

/** Kasa kilitliyse kilit penceresini açar, şifreyi tarayıcıda çözüp aktarır */
export function useKasadanAktar() {
  const requireKey = useVaultStore((s) => s.requireKey)
  const { kaydet, isPending } = useTebligatErisimKaydetKasadan()
  const aktar = (credential: CredentialKaydi, onSuccess?: () => void) =>
    requireKey(async (key) => {
      try {
        const secret = await decryptJson<CredentialSecret>(credential, key)
        await kaydet(credential, secret)
        toast.success(
          "Kasadaki İnteraktif VD şifresi e-Tebligat taramasına aktarıldı"
        )
        onSuccess?.()
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
  return { aktar, isPending }
}
