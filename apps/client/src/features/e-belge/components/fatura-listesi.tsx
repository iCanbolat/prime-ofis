import { useCallback, useMemo } from "react"
import { Invoice03Icon } from "@hugeicons/core-free-icons"

import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import { FaturaDetaySheet } from "@/features/e-belge/components/fatura-detay-sheet"
import { FaturaFiltreleri } from "@/features/e-belge/components/fatura-filtreleri"
import { FaturaKartlari } from "@/features/e-belge/components/fatura-kartlari"
import { FaturaTablosu } from "@/features/e-belge/components/fatura-tablosu"
import { useFaturaParams } from "@/features/e-belge/hooks/use-fatura-params"
import { formatTutar } from "@prime/shared/e-belge/kurallar"
import { useFaturalar } from "@/features/e-belge/queries"
import { EBELGE_TUR_ETIKET } from "@prime/shared/e-belge/sabitler"
import { useListeGorunumu } from "@/hooks/use-liste-gorunumu"
import type { EBelgeSiralama, EBelgeView, SiralamaYonu } from "@prime/shared/types/api"
import type { EBelgeTur } from "@prime/shared/types/domain"

const EMPTY: EBelgeView[] = []

/** Filtreler + tablo + sayfalama + detay paneli. /e-belge sekmeleri ve mükellef kartı kullanır. */
export function FaturaListesi({
  tur,
  sabitMukellef,
}: {
  tur: EBelgeTur
  sabitMukellef?: string
}) {
  const { params, sorgu, update, reset, hasFilters } = useFaturaParams(
    tur,
    sabitMukellef
  )
  const liste = useFaturalar(sorgu)
  const [gorunum, setGorunum] = useListeGorunumu("faturalar")

  const onSiralama = useCallback(
    (sirala: EBelgeSiralama, siralamaYonu: SiralamaYonu) =>
      update({ sirala, siralamaYonu }),
    [update]
  )
  const siralama = useMemo(
    () => ({
      sirala: params.sirala,
      yon: params.siralamaYonu,
      onChange: onSiralama,
    }),
    [params.sirala, params.siralamaYonu, onSiralama]
  )
  const onAc = useCallback((id: string) => update({ fatura: id }), [update])

  const data = liste.data?.items ?? EMPTY
  const total = liste.data?.total ?? 0
  const sayfa = liste.data?.sayfa ?? params.sayfa
  const boyut = sorgu.sayfaBoyutu ?? 20
  const yonGoster = tur === "E_FATURA" && !params.yon

  return (
    <>
      <FaturaFiltreleri
        tur={tur}
        sabitMukellef={sabitMukellef}
        gorunum={gorunum}
        onGorunumChange={setGorunum}
      />

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.isPending && total === 0 ? (
        <EmptyState
          icon={Invoice03Icon}
          title={
            hasFilters
              ? "Filtrelere uyan fatura yok"
              : `Henüz ${EBELGE_TUR_ETIKET[tur]} faturası yok`
          }
          description={
            hasFilters
              ? "Arama veya filtreleri değiştirmeyi deneyin."
              : "Faturalar Luca senkronuyla gelir."
          }
          action={
            hasFilters && (
              <Button variant="outline" onClick={reset}>
                Filtreleri temizle
              </Button>
            )
          }
        />
      ) : (
        <>
          {gorunum === "grid" ? (
            <FaturaKartlari
              data={data}
              isLoading={liste.isPending}
              onAc={onAc}
              mukellefGoster={!sabitMukellef}
              yonGoster={yonGoster}
            />
          ) : (
            <FaturaTablosu
              data={data}
              siralama={siralama}
              isLoading={liste.isPending}
              onAc={onAc}
              mukellefSutunu={!sabitMukellef}
              yonGoster={yonGoster}
            />
          )}
          <Sayfalama
            total={total}
            sayfa={sayfa}
            sayfaBoyutu={boyut}
            birim="faturadan"
            onChange={(s) => update({ sayfa: s })}
            ek={
              liste.data &&
              liste.data.toplamTutar > 0 && (
                <>
                  {" · "}
                  <span className="text-foreground tabular-nums">
                    Toplam {formatTutar(liste.data.toplamTutar)}
                  </span>
                </>
              )
            }
          />
        </>
      )}

      <FaturaDetaySheet
        faturaId={params.fatura}
        onClose={() => update({ fatura: null })}
      />
    </>
  )
}
