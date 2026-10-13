import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { InboxUploadIcon, WhatsappIcon } from "@hugeicons/core-free-icons"

import {
  AramaKutusu,
  ListeAraclari,
  SekmeFiltre,
} from "@/components/shared/liste-araclari"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GelenEvrakListesi } from "@/features/evrak-talebi/components/gelen-inceleme"
import { TalepDetaySheet } from "@/features/evrak-talebi/components/talep-detay-sheet"
import { TalepListesi } from "@/features/evrak-talebi/components/talep-listesi"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import {
  useTalepParams,
  type TalepSekme,
} from "@/features/evrak-talebi/hooks/use-talep-params"
import { TALEP_DURUM_ETIKET } from "@prime/shared/evrak-talebi/sabitler"
import { useGelenList, useTalepList } from "@/features/evrak-talebi/queries"
import type { TalepDurumu } from "@prime/shared/types/domain"

const DURUM_FILTRELERI = Object.fromEntries(
  (["AKTIF", "TAMAMLANDI", "SURESI_DOLDU", "IPTAL"] as const).map((d) => [
    d,
    TALEP_DURUM_ETIKET[d],
  ])
) as Record<TalepDurumu, string>

function ListeIskeleti() {
  return (
    <div className="grid gap-2" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

export function EvrakTalepleriPage() {
  const { params, update } = useTalepParams()
  const [hedef, setHedef] = useState<TalepHedef | null>(null)
  const talepler = useTalepList({
    durum: params.durum,
    q: params.q || undefined,
  })
  const gelen = useGelenList({ durum: "BEKLIYOR" })
  const bekleyen = gelen.data?.length

  return (
    <>
      <PageHeader
        title="Evrak Talepleri"
        description="Müşterilere yükleme bağlantısı gönderin, gelen evrakları inceleyip arşive kaydedin"
        actions={
          <Button onClick={() => setHedef({})}>
            <HugeiconsIcon
              icon={WhatsappIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Evrak iste
          </Button>
        }
      />

      <Tabs
        value={params.sekme}
        onValueChange={(v) => update({ sekme: v as TalepSekme })}
      >
        <TabsList>
          <TabsTrigger value="talepler">Talepler</TabsTrigger>
          <TabsTrigger value="gelen">
            Gelen kutusu
            {bekleyen !== undefined && bekleyen > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {bekleyen}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="talepler" className="grid gap-4 pt-2">
          <ListeAraclari
            etiket="Talep filtreleri"
            arama={
              <AramaKutusu
                etiket="Talep ara"
                placeholder="Mükellef veya evrak ara"
                value={params.q}
                onChange={(q) => update({ q: q.trim() || null })}
              />
            }
          >
            <SekmeFiltre<TalepDurumu>
              etiket="Durum filtresi"
              secenekler={DURUM_FILTRELERI}
              value={params.durum}
              onChange={(durum) => update({ durum })}
            />
          </ListeAraclari>
          {talepler.isError ? (
            <ErrorState
              error={talepler.error}
              onRetry={() => talepler.refetch()}
            />
          ) : talepler.data ? (
            <TalepListesi
              talepler={talepler.data}
              onSec={(id) => update({ talep: id })}
              bosAksiyon={
                !params.durum && !params.q ? (
                  <Button size="sm" onClick={() => setHedef({})}>
                    İlk talebi oluştur
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ListeIskeleti />
          )}
        </TabsContent>

        <TabsContent value="gelen" className="pt-2">
          {gelen.isError ? (
            <ErrorState error={gelen.error} onRetry={() => gelen.refetch()} />
          ) : !gelen.data ? (
            <ListeIskeleti />
          ) : gelen.data.length === 0 ? (
            <EmptyState
              icon={InboxUploadIcon}
              title="İnceleme bekleyen evrak yok"
              description="Müşteriler portaldan dosya yükledikçe burada görünür."
            />
          ) : (
            <Card size="sm">
              <CardContent>
                <GelenEvrakListesi
                  gelenler={gelen.data}
                  gosterMukellef
                  onTalepAc={(id) => update({ talep: id })}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <TalepDetaySheet
        talepId={params.talep}
        onClose={() => update({ talep: null })}
      />
      <TalepOlusturDialog hedef={hedef} onClose={() => setHedef(null)} />
    </>
  )
}
