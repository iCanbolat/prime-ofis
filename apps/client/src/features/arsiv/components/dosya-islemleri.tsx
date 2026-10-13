import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DuzenleDialog } from "@/features/arsiv/components/duzenle-dialog"
import { OnizlemeDialog } from "@/features/arsiv/components/onizleme-dialog"
import { formatBoyut } from "@prime/shared/arsiv/kurallar"
import {
  useArsivGeriAl,
  useArsivGuncelle,
  useArsivKaliciSil,
  useArsivSil,
} from "@/features/arsiv/queries"
import { ARSIV_KATEGORI_ETIKET, type ArsivKategori } from "@prime/shared/types/domain"
import type { ArsivDosyaView } from "@prime/shared/types/api"

export interface DosyaIslemleri {
  onizle: (dosya: ArsivDosyaView) => void
  duzenle: (dosya: ArsivDosyaView) => void
  tasi: (dosya: ArsivDosyaView, kategori: ArsivKategori) => void
  sil: (dosya: ArsivDosyaView) => void
  geriAl: (dosya: ArsivDosyaView) => void
  kaliciSil: (dosya: ArsivDosyaView) => void
}

/** Dosya işlemleri + ilgili pencereler. `dialoglar` sayfada bir kez render edilir. */
export function useDosyaIslemleri() {
  const [onizlenen, setOnizlenen] = useState<ArsivDosyaView | null>(null)
  const [duzenlenen, setDuzenlenen] = useState<ArsivDosyaView | null>(null)
  const [silinecek, setSilinecek] = useState<ArsivDosyaView | null>(null)
  const guncelle = useArsivGuncelle()
  const silMut = useArsivSil()
  const geriAlMut = useArsivGeriAl()
  const kaliciMut = useArsivKaliciSil()

  const geriAl = (dosya: ArsivDosyaView) =>
    geriAlMut.mutate(dosya.id, {
      onSuccess: () => toast.success(`"${dosya.ad}" geri alındı`),
      onError: (error) => toast.error(error.message),
    })

  const islemler: DosyaIslemleri = {
    onizle: setOnizlenen,
    duzenle: setDuzenlenen,
    tasi: (dosya, kategori) =>
      guncelle.mutate(
        { id: dosya.id, kategori },
        {
          onSuccess: () =>
            toast.success(
              `"${dosya.ad}" ${ARSIV_KATEGORI_ETIKET[kategori]} kategorisine taşındı`
            ),
          onError: (error) => toast.error(error.message),
        }
      ),
    sil: (dosya) =>
      silMut.mutate(dosya.id, {
        onSuccess: () =>
          toast(`"${dosya.ad}" çöp kutusuna taşındı`, {
            action: { label: "Geri al", onClick: () => geriAl(dosya) },
          }),
        onError: (error) => toast.error(error.message),
      }),
    geriAl,
    kaliciSil: setSilinecek,
  }

  const dialoglar = (
    <>
      <OnizlemeDialog
        dosya={
          onizlenen && {
            id: onizlenen.id,
            ad: onizlenen.ad,
            mimeType: onizlenen.mimeType,
            aciklama: `${onizlenen.mukellefUnvan} · ${ARSIV_KATEGORI_ETIKET[onizlenen.kategori]} · ${formatBoyut(onizlenen.boyut)}`,
            kaynak: "arsiv",
          }
        }
        onClose={() => setOnizlenen(null)}
      />
      <DuzenleDialog dosya={duzenlenen} onClose={() => setDuzenlenen(null)} />
      <ConfirmDialog
        open={Boolean(silinecek)}
        onOpenChange={(open) => !open && setSilinecek(null)}
        title="Dosya kalıcı olarak silinsin mi?"
        description={
          silinecek &&
          `"${silinecek.ad}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`
        }
        confirmLabel="Kalıcı olarak sil"
        destructive
        pending={kaliciMut.isPending}
        onConfirm={() =>
          silinecek &&
          kaliciMut.mutate(silinecek.id, {
            onSuccess: () => {
              toast.success("Dosya kalıcı olarak silindi")
              setSilinecek(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </>
  )

  return { islemler, dialoglar }
}
