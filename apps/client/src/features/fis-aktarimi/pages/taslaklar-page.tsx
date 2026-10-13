import { useEffect } from "react"
import { Invoice01Icon } from "@hugeicons/core-free-icons"

import { MonthPicker } from "@/components/shared/date-picker"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { FisDuzenleyici } from "@/features/fis-aktarimi/components/fis-duzenleyici"
import { FisTablosu } from "@/features/fis-aktarimi/components/fis-tablosu"
import { OkumaListesi } from "@/features/fis-aktarimi/components/okuma-listesi"
import { useFisParams } from "@/features/fis-aktarimi/hooks/use-fis-params"
import { useFisler, useOkumalar } from "@/features/fis-aktarimi/queries"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"

export function TaslaklarPage() {
  const { mukellef, donem, fis, gelen, set } = useFisParams()
  const filtre = {
    mukellefId: mukellef || undefined,
    donem: donem || undefined,
  }
  const fisler = useFisler({ ...filtre, durum: "TASLAK" })
  const okumalar = useOkumalar({ mukellefId: filtre.mukellefId })

  // Gelen evrak incelemesinden "Fiş taslağını aç" ile gelinince o belgenin ilk fişi açılır
  const gelenFisi = gelen
    ? fisler.data?.find((f) => f.gelenId === gelen)?.id
    : undefined
  useEffect(() => {
    if (gelenFisi) set({ fis: gelenFisi, gelen: null })
  }, [gelenFisi, set])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <MukellefSelect
          value={mukellef}
          onValueChange={(v) => set({ mukellef: v || null })}
          bosSecenek="Tüm mükellefler"
          aria-label="Mükellef filtresi"
          className="w-full sm:w-64"
        />
        <MonthPicker
          value={donem}
          onChange={(v) => set({ donem: v || null })}
          placeholder="Tüm dönemler"
          clearable
          aria-label="Dönem filtresi"
        />
      </div>

      {okumalar.data && <OkumaListesi okumalar={okumalar.data} />}

      {fisler.isPending ? (
        <LoadingState />
      ) : fisler.isError ? (
        <ErrorState error={fisler.error} onRetry={() => fisler.refetch()} />
      ) : fisler.data.length === 0 ? (
        <EmptyState
          icon={Invoice01Icon}
          title="Onay bekleyen fiş yok"
          description="Portaldan gelen fiş ve banka ekstrelerini Evrak Talepleri'nde onayladığınızda okunur ve taslak fiş olarak burada listelenir. Şimdilik yalnızca bilanço esasına göre defter tutan mükellefler desteklenir."
        />
      ) : (
        <FisTablosu
          fisler={fisler.data}
          onAc={(id) => set({ fis: id })}
          ariaLabel="Taslak fişler"
        />
      )}

      <FisDuzenleyici fisId={fis} onClose={() => set({ fis: null })} />
    </div>
  )
}
