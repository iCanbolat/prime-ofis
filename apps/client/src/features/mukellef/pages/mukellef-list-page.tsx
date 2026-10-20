import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import type { RowSelectionState } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  FileImportIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { ButtonLink } from "@/components/shared/button-link"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import { usePersonelList } from "@/features/auth/queries"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { LucaFirmaAktarimDialog } from "@/features/e-belge/components/luca-firma-aktarim"
import { MukellefFiltreleri } from "@/features/mukellef/components/mukellef-filtreleri"
import { MukellefKartlari } from "@/features/mukellef/components/mukellef-kartlari"
import { MukellefTablosu } from "@/features/mukellef/components/mukellef-tablosu"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { useMukellefListParams } from "@/features/mukellef/hooks/use-mukellef-list-params"
import { useMukellefList, useTopluAtama } from "@/features/mukellef/queries"
import { useListeGorunumu } from "@/hooks/use-liste-gorunumu"
import type { MukellefSiralama, SiralamaYonu } from "@prime/shared/types/api"
import type { Mukellef, Personel } from "@prime/shared/types/domain"

const EMPTY: Mukellef[] = []

function TopluAtamaCubugu({
  secilenIds,
  onTamamlandi,
}: {
  secilenIds: string[]
  onTamamlandi: () => void
}) {
  const [sorumlu, setSorumlu] = useState("")
  const atama = useTopluAtama()

  const uygula = () => {
    atama.mutate(
      { ids: secilenIds, sorumluPersonelId: sorumlu },
      {
        onSuccess: ({ guncellenen }) => {
          toast.success(`${guncellenen} mükellefin sorumlusu güncellendi`)
          setSorumlu("")
          onTamamlandi()
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  return (
    <div
      role="region"
      aria-label="Toplu işlemler"
      className="flex flex-wrap items-center gap-2 rounded-3xl border bg-muted/50 px-4 py-2"
    >
      <span className="text-sm font-medium">
        {secilenIds.length} mükellef seçildi
      </span>
      <PersonelSelect
        aria-label="Atanacak sorumlu"
        placeholder="Sorumlu seçin"
        value={sorumlu}
        onValueChange={setSorumlu}
        className="w-48"
      />
      <Button size="sm" disabled={!sorumlu || atama.isPending} onClick={uygula}>
        Sorumlu ata
      </Button>
      <Button size="sm" variant="ghost" onClick={onTamamlandi}>
        Seçimi temizle
      </Button>
    </div>
  )
}

export function MukellefListPage() {
  const { params, update, reset, hasFilters } = useMukellefListParams()
  const liste = useMukellefList(params)
  const personel = usePersonelList()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [gorunum, setGorunum] = useListeGorunumu("mukellefler")
  const yonetici = hasRole(
    useAuthStore((s) => s.user),
    ["YONETICI"]
  )
  const [lucaAktarim, setLucaAktarim] = useState(false)

  const personelById = useMemo(
    () =>
      new Map<string, Personel>((personel.data ?? []).map((p) => [p.id, p])),
    [personel.data]
  )

  const onSiralamaChange = useCallback(
    (sirala: MukellefSiralama, yon: SiralamaYonu) => update({ sirala, yon }),
    [update]
  )
  const siralama = useMemo(
    () => ({
      sirala: params.sirala,
      yon: params.yon,
      onChange: onSiralamaChange,
    }),
    [params.sirala, params.yon, onSiralamaChange]
  )

  const secilenIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const data = liste.data?.items ?? EMPTY
  const total = liste.data?.total ?? 0
  const sayfa = liste.data?.sayfa ?? params.sayfa

  return (
    <>
      <PageHeader
        title="Mükellefler"
        description="Büronuzun takip ettiği şahıs ve şirketler"
        actions={
          <>
            {yonetici && (
              <Button variant="outline" onClick={() => setLucaAktarim(true)}>
                <HugeiconsIcon
                  icon={FileImportIcon}
                  data-icon="inline-start"
                  strokeWidth={2}
                />
                <span className="hidden sm:inline">Luca'dan aktar</span>
                <span className="sm:hidden">Aktar</span>
              </Button>
            )}
            <ButtonLink to="/mukellefler/yeni">
              <HugeiconsIcon
                icon={Add01Icon}
                data-icon="inline-start"
                strokeWidth={2}
              />
              Yeni mükellef
            </ButtonLink>
          </>
        }
      />

      <LucaFirmaAktarimDialog
        open={lucaAktarim}
        onClose={() => setLucaAktarim(false)}
      />

      <MukellefFiltreleri gorunum={gorunum} onGorunumChange={setGorunum} />

      {secilenIds.length > 0 && (
        <TopluAtamaCubugu
          secilenIds={secilenIds}
          onTamamlandi={() => setRowSelection({})}
        />
      )}

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.isPending && total === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title={
            hasFilters
              ? "Filtrelere uyan mükellef yok"
              : "Henüz mükellef eklenmemiş"
          }
          description={
            hasFilters
              ? "Arama veya filtreleri değiştirmeyi deneyin."
              : "Mükelleflerinizi büronun Luca hesabındaki firmalardan aktarın veya ilk mükellefinizi ekleyin."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={reset}>
                Filtreleri temizle
              </Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {yonetici && (
                  <Button onClick={() => setLucaAktarim(true)}>
                    Luca'dan aktar
                  </Button>
                )}
                <ButtonLink variant="outline" to="/mukellefler/yeni">
                  Yeni mükellef
                </ButtonLink>
              </div>
            )
          }
        />
      ) : (
        <>
          {gorunum === "grid" ? (
            <MukellefKartlari
              data={data}
              personelById={personelById}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              isLoading={liste.isPending}
            />
          ) : (
            <MukellefTablosu
              data={data}
              personelById={personelById}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              siralama={siralama}
              isLoading={liste.isPending}
            />
          )}
          <Sayfalama
            total={total}
            sayfa={sayfa}
            sayfaBoyutu={params.sayfaBoyutu}
            onChange={(s) => update({ sayfa: s })}
          />
        </>
      )}
    </>
  )
}
