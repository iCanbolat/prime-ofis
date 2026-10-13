import { useState } from "react"
import { useSearchParams } from "react-router"

import { ErrorState } from "@/components/shared/query-states"
import { Skeleton } from "@/components/ui/skeleton"
import { BordroDetaySheet } from "@/features/bordro/components/bordro-detay-sheet"
import { IsHareketleri } from "@/features/bordro/components/is-hareketleri"
import { BordroListesi } from "@/features/bordro/components/bordro-listesi"
import { bordroUygulanirMi } from "@prime/shared/bordro/kurallar"
import { useMukellefBordro } from "@/features/bordro/queries"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { EmptyState } from "@/components/shared/query-states"
import { UserGroupIcon } from "@hugeicons/core-free-icons"

export function MukellefBordroTab() {
  const { mukellef } = useMukellefKart()
  const uygulanir = bordroUygulanirMi(mukellef)
  const liste = useMukellefBordro(mukellef.id)
  const [hedef, setHedef] = useState<TalepHedef | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const [panelMukellef, panelDonem] = (searchParams.get("bordro") ?? "").split(
    ":"
  )
  const panel =
    panelMukellef === mukellef.id && panelDonem
      ? { mukellefId: panelMukellef, donem: panelDonem }
      : undefined
  const panelAc = (donem: string | null) =>
    setSearchParams(
      (onceki) => {
        const yeni = new URLSearchParams(onceki)
        if (donem) yeni.set("bordro", `${mukellef.id}:${donem}`)
        else yeni.delete("bordro")
        return yeni
      },
      { replace: true }
    )
  const puantajIste = (donem: string) =>
    setHedef({ mukellefId: mukellef.id, istenenler: ["PUANTAJ"], donem })

  if (!uygulanir)
    return (
      <>
        <EmptyState
          icon={UserGroupIcon}
          title="Bu mükellefin bordrosu yok"
          description="Çalışan sayısı veya SGK işyeri kaydı girildiğinde bordro dönemleri burada izlenir."
        />
        {/* İlk işe giriş de takip edilebilsin */}
        <IsHareketleri mukellefId={mukellef.id} />
      </>
    )

  return (
    <>
      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : liste.data ? (
        <BordroListesi
          satirlar={liste.data}
          gosterMukellef={false}
          onSec={(s) => panelAc(s.donem)}
          onPuantajIste={(s) => puantajIste(s.donem)}
        />
      ) : (
        <div className="grid gap-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}
      <IsHareketleri mukellefId={mukellef.id} />
      <BordroDetaySheet
        hedef={panel}
        onClose={() => panelAc(null)}
        onPuantajIste={(h) => puantajIste(h.donem)}
      />
      <TalepOlusturDialog hedef={hedef} onClose={() => setHedef(null)} />
    </>
  )
}
