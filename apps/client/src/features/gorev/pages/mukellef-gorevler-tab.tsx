import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, KanbanIcon } from "@hugeicons/core-free-icons"

import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePersonelList } from "@/features/auth/queries"
import { GorevDetaySheet } from "@/features/gorev/components/gorev-detay-sheet"
import {
  GorevFormDialog,
  type GorevHedef,
} from "@/features/gorev/components/gorev-form-dialog"
import { GorevTablosu } from "@/features/gorev/components/gorev-tablosu"
import { useGorevParams } from "@/features/gorev/hooks/use-gorev-params"
import { useGorevList } from "@/features/gorev/queries"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import type { GorevDurum } from "@prime/shared/types/domain"

const ACIK: GorevDurum[] = ["YAPILACAK", "DEVAM", "KONTROL"]

export function MukellefGorevlerTab() {
  const { mukellef } = useMukellefKart()
  const { params, update } = useGorevParams(undefined)
  const [kapsam, setKapsam] = useState<"acik" | "tumu">("acik")
  const [yeniHedef, setYeniHedef] = useState<GorevHedef | null>(null)
  const liste = useGorevList({
    mukellefId: mukellef.id,
    durum: kapsam === "acik" ? ACIK : undefined,
  })
  const personel = usePersonelList()
  const personelById = useMemo(
    () => new Map((personel.data ?? []).map((p) => [p.id, p])),
    [personel.data]
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Görev kapsamı"
          value={[kapsam]}
          onValueChange={(v) => v[0] && setKapsam(v[0] as "acik" | "tumu")}
        >
          <ToggleGroupItem value="acik">Açık görevler</ToggleGroupItem>
          <ToggleGroupItem value="tumu">Tümü</ToggleGroupItem>
        </ToggleGroup>
        <Button
          size="sm"
          onClick={() => setYeniHedef({ mukellefId: mukellef.id })}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Görev ekle
        </Button>
      </div>

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <div className="grid gap-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : liste.data.length === 0 ? (
        <EmptyState
          icon={KanbanIcon}
          title={kapsam === "acik" ? "Açık görev yok" : "Henüz görev yok"}
          description="Bu mükellef için yeni bir görev ekleyebilirsiniz."
        />
      ) : (
        <GorevTablosu
          gorevler={liste.data}
          personelById={personelById}
          onAc={(id) => update({ gorev: id })}
          mukellefGizli
          secilebilir={false}
        />
      )}

      <GorevDetaySheet
        gorevId={params.gorev}
        onClose={() => update({ gorev: null })}
      />
      <GorevFormDialog
        hedef={yeniHedef}
        onClose={() => setYeniHedef(null)}
        onOlustu={(g) => update({ gorev: g.id })}
      />
    </div>
  )
}
