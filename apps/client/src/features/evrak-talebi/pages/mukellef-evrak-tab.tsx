import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { WhatsappIcon } from "@hugeicons/core-free-icons"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GelenEvrakListesi } from "@/features/evrak-talebi/components/gelen-inceleme"
import { TalepDetaySheet } from "@/features/evrak-talebi/components/talep-detay-sheet"
import { TalepListesi } from "@/features/evrak-talebi/components/talep-listesi"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { useTalepParams } from "@/features/evrak-talebi/hooks/use-talep-params"
import { useGelenList, useTalepList } from "@/features/evrak-talebi/queries"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"

/** Mükellef kartı → Evrak Talepleri sekmesi */
export function MukellefEvrakTab() {
  const { mukellef } = useMukellefKart()
  const { params, update } = useTalepParams()
  const [hedef, setHedef] = useState<TalepHedef | null>(null)
  const talepler = useTalepList({ mukellefId: mukellef.id })
  const gelen = useGelenList({ mukellefId: mukellef.id, durum: "BEKLIYOR" })

  return (
    <div className="grid gap-4">
      {gelen.data && gelen.data.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>İnceleme bekleyen evraklar</CardTitle>
            <CardDescription>Onaylananlar arşive kaydedilir</CardDescription>
          </CardHeader>
          <CardContent>
            <GelenEvrakListesi
              gelenler={gelen.data}
              onTalepAc={(id) => update({ talep: id })}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Talepler</h2>
        <Button size="sm" onClick={() => setHedef({ mukellefId: mukellef.id })}>
          <HugeiconsIcon
            icon={WhatsappIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Evrak iste
        </Button>
      </div>

      {talepler.isError ? (
        <ErrorState error={talepler.error} onRetry={() => talepler.refetch()} />
      ) : talepler.data ? (
        <TalepListesi
          talepler={talepler.data}
          gosterMukellef={false}
          onSec={(id) => update({ talep: id })}
        />
      ) : (
        <LoadingState />
      )}

      <TalepDetaySheet
        talepId={params.talep}
        onClose={() => update({ talep: null })}
      />
      <TalepOlusturDialog hedef={hedef} onClose={() => setHedef(null)} />
    </div>
  )
}
