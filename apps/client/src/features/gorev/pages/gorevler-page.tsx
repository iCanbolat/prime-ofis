import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  KanbanIcon,
  ListViewIcon,
  TaskAdd01Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePersonelList } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { DonemGorevleriDialog } from "@/features/gorev/components/donem-gorevleri-dialog"
import { GorevDetaySheet } from "@/features/gorev/components/gorev-detay-sheet"
import { GorevFiltreleri } from "@/features/gorev/components/gorev-filtreleri"
import { GorevKarti } from "@/features/gorev/components/gorev-karti"
import {
  GorevFormDialog,
  type GorevHedef,
} from "@/features/gorev/components/gorev-form-dialog"
import { GorevTablosu } from "@/features/gorev/components/gorev-tablosu"
import { KanbanPanosu } from "@/features/gorev/components/kanban-panosu"
import { useGorevParams } from "@/features/gorev/hooks/use-gorev-params"
import { useGorevTasiIslemi } from "@/features/gorev/hooks/use-gorev-tasi"
import { useGorevList } from "@/features/gorev/queries"
import {
  GOREV_SAYFA_BOYUTU,
  KANBAN_YUKSEKLIGI,
} from "@prime/shared/gorev/sabitler"
import { useGorevTercihleri, type GorevGorunum } from "@/features/gorev/store"
import { useIsDar } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

const GORUNUMLER: Record<
  GorevGorunum,
  { ad: string; icon: typeof KanbanIcon }
> = {
  kanban: { ad: "Kanban", icon: KanbanIcon },
  liste: { ad: "Liste", icon: ListViewIcon },
}

function GorunumSecici({
  value,
  onChange,
}: {
  value: GorevGorunum
  onChange: (g: GorevGorunum) => void
}) {
  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      aria-label="Görünüm"
      className="shrink-0"
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as GorevGorunum)}
    >
      {(Object.keys(GORUNUMLER) as GorevGorunum[]).map((g) => (
        <ToggleGroupItem key={g} value={g} aria-label={GORUNUMLER[g].ad}>
          <HugeiconsIcon icon={GORUNUMLER[g].icon} strokeWidth={2} />
          <span className="hidden xl:inline">{GORUNUMLER[g].ad}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function PanoIskeleti() {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", KANBAN_YUKSEKLIGI)}
      aria-busy="true"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-full rounded-3xl" />
      ))}
    </div>
  )
}

export function GorevlerPage() {
  const user = useAuthStore((s) => s.user)
  const { params, sorgu, update, filtreVar } = useGorevParams(user?.id)
  const gorunum = useGorevTercihleri((s) => s.gorunum)
  const setGorunum = useGorevTercihleri((s) => s.setGorunum)
  const liste = useGorevList(sorgu)
  const personel = usePersonelList()
  const { onTasi, tamamlayabilirMi } = useGorevTasiIslemi()
  const [yeniHedef, setYeniHedef] = useState<GorevHedef | null>(null)
  const [donemAcik, setDonemAcik] = useState(false)
  const dar = useIsDar()

  const personelById = useMemo(
    () => new Map((personel.data ?? []).map((p) => [p.id, p])),
    [personel.data]
  )
  const ac = (id: string) => update({ gorev: id })

  // Liste görünümü istemci taraflı sayfalanır; toplu işlem/filtre sonrası
  // liste kısalırsa son sayfaya sıkıştırılır
  const toplam = liste.data?.length ?? 0
  const sayfa = Math.min(
    params.sayfa,
    Math.max(Math.ceil(toplam / GOREV_SAYFA_BOYUTU), 1)
  )
  const sayfaGorevleri = useMemo(
    () =>
      (liste.data ?? []).slice(
        (sayfa - 1) * GOREV_SAYFA_BOYUTU,
        sayfa * GOREV_SAYFA_BOYUTU
      ),
    [liste.data, sayfa]
  )

  return (
    <>
      <PageHeader
        title="Görevler"
        description="Büro içi iş takibi: beyanname hazırlığından müşteri işlerine"
        actions={
          <>
            <Button variant="outline" onClick={() => setDonemAcik(true)}>
              <HugeiconsIcon
                icon={TaskAdd01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              <span className="hidden sm:inline">
                Dönem görevlerini oluştur
              </span>
              <span className="sm:hidden">Dönem</span>
            </Button>
            <Button onClick={() => setYeniHedef({})}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Yeni görev
            </Button>
          </>
        }
      />

      <GorevFiltreleri kullaniciId={user?.id}>
        <GorunumSecici value={gorunum} onChange={setGorunum} />
      </GorevFiltreleri>

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <PanoIskeleti />
      ) : liste.data.length === 0 && (filtreVar || gorunum === "liste") ? (
        <EmptyState
          icon={KanbanIcon}
          title={filtreVar ? "Filtrelere uyan görev yok" : "Henüz görev yok"}
          description={
            filtreVar
              ? "Filtreleri değiştirmeyi veya temizlemeyi deneyin."
              : "Dönem görevlerini oluşturarak başlayabilirsiniz."
          }
        />
      ) : gorunum === "kanban" ? (
        <KanbanPanosu
          gorevler={liste.data}
          personelById={personelById}
          tamamlayabilirMi={tamamlayabilirMi}
          onAc={ac}
          onTasi={onTasi}
        />
      ) : (
        <div className="grid gap-3">
          {dar ? (
            // Dar ekranda liste görünümü kart ızgarasına döner
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="list"
              aria-label="Görevler"
            >
              {sayfaGorevleri.map((g) => (
                <li key={g.id}>
                  <GorevKarti
                    gorev={g}
                    atanan={personelById.get(g.atananId)}
                    tamamlayabilir={tamamlayabilirMi(g)}
                    onAc={ac}
                    onTasi={onTasi}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <GorevTablosu
              gorevler={sayfaGorevleri}
              personelById={personelById}
              onAc={ac}
            />
          )}
          {toplam > GOREV_SAYFA_BOYUTU && (
            <Sayfalama
              total={toplam}
              sayfa={sayfa}
              sayfaBoyutu={GOREV_SAYFA_BOYUTU}
              birim="görevden"
              onChange={(s) => update({ sayfa: s })}
            />
          )}
        </div>
      )}

      <GorevDetaySheet
        gorevId={params.gorev}
        onClose={() => update({ gorev: null })}
      />
      <GorevFormDialog
        hedef={yeniHedef}
        onClose={() => setYeniHedef(null)}
        onOlustu={(g) => ac(g.id)}
      />
      <DonemGorevleriDialog
        open={donemAcik}
        onClose={() => setDonemAcik(false)}
      />
    </>
  )
}
