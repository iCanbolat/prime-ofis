import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { LucaDogrulamaDialog } from "@/features/e-belge/components/luca-dogrulama"
import { lucaDogrulamaBekliyor, useSenkron } from "@/features/e-belge/queries"
import { cn } from "@/lib/utils"

/**
 * Luca'dan artımlı senkron. `mukellefId` verilmezse tüm bağlı mükellefler. Luca portalı
 * doğrulama kodu isterse (409 `dogrulama`) kod penceresi açılır, kod kabul edilince senkron
 * yeniden denenir.
 */
export function SenkronButonu({
  mukellefId,
  size = "default",
  variant = "outline",
}: {
  mukellefId?: string
  size?: "sm" | "default"
  variant?: "outline" | "default"
}) {
  const senkron = useSenkron()
  const [dogrulama, setDogrulama] = useState(false)

  const baslat = () =>
    senkron.mutate(
      { mukellefId },
      {
        onSuccess: (s) => {
          const parcalar = [
            `${s.yeniFatura} yeni fatura`,
            s.guncellenenFatura && `${s.guncellenenFatura} güncellenen`,
            s.onaylananBerat && `${s.onaylananBerat} berat alındı`,
          ].filter(Boolean)
          toast.success(`Senkronize edildi: ${parcalar.join(", ")}`)
          if (s.hatali.length)
            toast.error(
              s.hatali.length === 1
                ? `${s.hatali[0]!.unvan}: ${s.hatali[0]!.mesaj}`
                : `${s.hatali.length} mükellef bağlantı hatası nedeniyle senkronize edilemedi`
            )
        },
        onError: (error) => {
          if (lucaDogrulamaBekliyor(error)) setDogrulama(true)
          else toast.error(error.message)
        },
      }
    )

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={senkron.isPending}
        onClick={baslat}
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          strokeWidth={2}
          data-icon="inline-start"
          className={cn(senkron.isPending && "animate-spin")}
        />
        {senkron.isPending ? "Senkronize ediliyor…" : "Şimdi senkronize et"}
      </Button>
      <LucaDogrulamaDialog
        open={dogrulama}
        onClose={() => setDogrulama(false)}
        onCozuldu={baslat}
      />
    </>
  )
}
