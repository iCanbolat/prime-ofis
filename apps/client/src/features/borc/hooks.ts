import { useCallback, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import type { KamuDogrulamaView, KamuIslemSonucu } from "@prime/shared/types/api"

/** Panel açan anahtarlar değişince sayfa korunur; filtre değişince 1. sayfaya dönülür */
const SAYFAYI_KORUYAN = ["sayfa", "borc", "dogrulama", "erisim", "yazi"]

export function useBorcParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const guncelle = useCallback(
    (degisim: Record<string, string | null>) =>
      setSearchParams(
        (onceki) => {
          const yeni = new URLSearchParams(onceki)
          for (const [k, v] of Object.entries(degisim)) {
            if (v === null) yeni.delete(k)
            else yeni.set(k, v)
          }
          if (!Object.keys(degisim).some((k) => SAYFAYI_KORUYAN.includes(k)))
            yeni.delete("sayfa")
          return yeni
        },
        { replace: true }
      ),
    [setSearchParams]
  )
  return { searchParams, guncelle }
}

/**
 * Sorgu tetikleyen işlemlerin ortak sonucu: doğrulama ekranı çıktıysa pencere açılır, aksi halde
 * başarı mesajı gösterilir.
 */
export function useKamuIslem() {
  const [dogrulama, setDogrulama] = useState<KamuDogrulamaView | null>(null)
  const sonuc = useCallback((r: KamuIslemSonucu, basariMesaji: string) => {
    if (r.dogrulama) setDogrulama(r.dogrulama)
    else toast.success(basariMesaji)
  }, [])
  return { dogrulama, kapat: () => setDogrulama(null), sonuc }
}
