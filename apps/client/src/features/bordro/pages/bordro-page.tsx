import { useState } from "react"
import { UserGroupIcon } from "@hugeicons/core-free-icons"

import { MonthPicker } from "@/components/shared/date-picker"
import {
  AramaKutusu,
  GorunumToggle,
  ListeAraclari,
} from "@/components/shared/liste-araclari"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IsHareketleri } from "@/features/bordro/components/is-hareketleri"
import { BordroDetaySheet } from "@/features/bordro/components/bordro-detay-sheet"
import { BordroKartlari } from "@/features/bordro/components/bordro-kartlari"
import { BordroListesi } from "@/features/bordro/components/bordro-listesi"
import {
  UYARILAR,
  useBordroParams,
  type BordroSekme,
  type BordroUyariFiltresi,
} from "@/features/bordro/hooks/use-bordro-params"
import {
  BORDRO_DURUM_ETIKET,
  BORDRO_SAYFA_BOYUTU,
} from "@prime/shared/bordro/sabitler"
import { useBordroListe } from "@/features/bordro/queries"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { useListeGorunumu } from "@/hooks/use-liste-gorunumu"
import type { BordroSatiri } from "@prime/shared/types/api"
import type { BordroDurum } from "@prime/shared/types/domain"

const TUMU = "tumu"
const DURUMLAR = Object.keys(BORDRO_DURUM_ETIKET) as BordroDurum[]
const UYARI_FILTRE_ETIKET: Record<BordroUyariFiltresi, string> = {
  YAKLASIYOR: "Süresi yaklaşan",
  GECIKTI: "Geciken",
}

export function BordroPage() {
  const { params, listeParams, update } = useBordroParams()
  const liste = useBordroListe(listeParams)
  const [gorunum, setGorunum] = useListeGorunumu("bordro")
  const [hedef, setHedef] = useState<TalepHedef | null>(null)

  const puantajIste = (mukellefId: string, donem: string) =>
    setHedef({ mukellefId, istenenler: ["PUANTAJ"], donem })

  const geciken = liste.data?.uyarilar.GECIKTI ?? 0
  const yaklasan = liste.data?.uyarilar.YAKLASIYOR ?? 0
  const sayilar = liste.data?.sayilar
  // Seçeneklerde dönemdeki satır sayısı (arama uygulanmış, durum/uyarı filtresinden önce)
  const durumItems: Record<string, string> = {
    [TUMU]: "Tüm durumlar",
    ...Object.fromEntries(
      DURUMLAR.map((d) => [
        d,
        sayilar
          ? `${BORDRO_DURUM_ETIKET[d]} (${sayilar[d]})`
          : BORDRO_DURUM_ETIKET[d],
      ])
    ),
  }
  const uyariItems: Record<string, string> = {
    [TUMU]: "Tüm süreler",
    ...Object.fromEntries(
      UYARILAR.map((u) => [
        u,
        liste.data
          ? `${UYARI_FILTRE_ETIKET[u]} (${liste.data.uyarilar[u]})`
          : UYARI_FILTRE_ETIKET[u],
      ])
    ),
  }
  const filtreVar = Boolean(params.durum || params.uyari || params.q)
  const onSec = (s: BordroSatiri) =>
    update({ bordro: `${s.mukellefId}:${s.donem}` })
  const onPuantajIste = (s: BordroSatiri) => puantajIste(s.mukellefId, s.donem)

  return (
    <>
      <PageHeader
        title="Bordro takibi"
        description="Puantaj girdisinden MUHSGK beyanına kadar mükelleflerin bordro dönemleri ve işe giriş / çıkış bildirimleri"
        actions={
          params.sekme === "donemler" && (
            <MonthPicker
              value={params.donem}
              onChange={(donem) => update({ donem })}
              aria-label="Dönem"
              className="w-44"
            />
          )
        }
      />

      <Tabs
        value={params.sekme}
        onValueChange={(v) => update({ sekme: v as BordroSekme })}
      >
        <TabsList>
          <TabsTrigger value="donemler">Dönemler</TabsTrigger>
          <TabsTrigger value="hareket">İşe giriş / çıkış</TabsTrigger>
        </TabsList>

        <TabsContent value="donemler" className="grid gap-4 pt-2">
          {geciken > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>
                {geciken} mükellefin MUHSGK süresi geçti, beyan verilmedi
              </AlertTitle>
              <AlertDescription>
                <button
                  type="button"
                  className="underline"
                  onClick={() => update({ uyari: "GECIKTI" })}
                >
                  Gecikenleri göster
                </button>
              </AlertDescription>
            </Alert>
          ) : (
            yaklasan > 0 && (
              <Alert>
                <AlertTitle>
                  {yaklasan} mükellefin bordrosu için süre yaklaşıyor
                </AlertTitle>
                <AlertDescription>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => update({ uyari: "YAKLASIYOR" })}
                  >
                    Yaklaşanları göster
                  </button>
                </AlertDescription>
              </Alert>
            )
          )}

          <ListeAraclari
            etiket="Bordro filtreleri"
            arama={
              <AramaKutusu
                etiket="Mükellef ara"
                placeholder="Mükellef ara"
                value={params.q}
                onChange={(q) => update({ q: q.trim() || null })}
              />
            }
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <Select
                items={durumItems}
                value={params.durum ?? TUMU}
                onValueChange={(v) =>
                  v && update({ durum: v === TUMU ? null : (v as BordroDurum) })
                }
              >
                <SelectTrigger
                  aria-label="Durum filtresi"
                  className="min-w-0 flex-1 sm:w-52 sm:flex-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(durumItems).map(([k, ad]) => (
                    <SelectItem key={k} value={k}>
                      {ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                items={uyariItems}
                value={params.uyari ?? TUMU}
                onValueChange={(v) =>
                  v &&
                  update({
                    uyari: v === TUMU ? null : (v as BordroUyariFiltresi),
                  })
                }
              >
                <SelectTrigger
                  aria-label="Süre filtresi"
                  className="min-w-0 flex-1 sm:w-48 sm:flex-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(uyariItems).map(([k, ad]) => (
                    <SelectItem key={k} value={k}>
                      {ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <GorunumToggle value={gorunum} onChange={setGorunum} />
          </ListeAraclari>

          {liste.isError ? (
            <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
          ) : liste.data ? (
            liste.data.total === 0 ? (
              filtreVar ? (
                <EmptyState
                  icon={UserGroupIcon}
                  title="Filtreyle eşleşen bordro yok"
                  action={
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() =>
                        update({ durum: null, uyari: null, q: null })
                      }
                    >
                      Filtreleri temizle
                    </button>
                  }
                />
              ) : (
                <BordroListesi satirlar={[]} onSec={onSec} />
              )
            ) : (
              <>
                {gorunum === "grid" ? (
                  <BordroKartlari
                    satirlar={liste.data.items}
                    onSec={onSec}
                    onPuantajIste={onPuantajIste}
                  />
                ) : (
                  <BordroListesi
                    satirlar={liste.data.items}
                    onSec={onSec}
                    onPuantajIste={onPuantajIste}
                  />
                )}
                <Sayfalama
                  total={liste.data.total}
                  sayfa={liste.data.sayfa}
                  sayfaBoyutu={BORDRO_SAYFA_BOYUTU}
                  birim="mükelleften"
                  onChange={(sayfa) => update({ sayfa })}
                />
              </>
            )
          ) : (
            <div className="grid gap-2" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="hareket" className="pt-2">
          <IsHareketleri />
        </TabsContent>
      </Tabs>

      <BordroDetaySheet
        hedef={params.panel}
        onClose={() => update({ bordro: null })}
        onPuantajIste={(h) => puantajIste(h.mukellefId, h.donem)}
      />
      <TalepOlusturDialog hedef={hedef} onClose={() => setHedef(null)} />
    </>
  )
}
