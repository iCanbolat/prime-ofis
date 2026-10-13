import { useMemo, useState } from "react"
import { Link } from "react-router"
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { toast } from "sonner"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  GorevDurumBadge,
  GorevTipBadge,
  OncelikIsareti,
  SonTarih,
} from "@/features/gorev/components/gorev-rozetleri"
import { checklistIlerleme } from "@prime/shared/gorev/kurallar"
import { useGorevToplu } from "@/features/gorev/queries"
import {
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
} from "@prime/shared/gorev/sabitler"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { cn } from "@/lib/utils"
import type { GorevView } from "@prime/shared/types/api"
import type { GorevDurum, Personel } from "@prime/shared/types/domain"

const features = tableFeatures({ rowSelectionFeature })
const helper = createColumnHelper<typeof features, GorevView>()

function TopluIslemCubugu({
  secilenIds,
  onTamamlandi,
}: {
  secilenIds: string[]
  onTamamlandi: () => void
}) {
  const [durum, setDurum] = useState<GorevDurum | "">("")
  const [atanan, setAtanan] = useState("")
  const toplu = useGorevToplu()

  const uygula = (body: { durum?: GorevDurum; atananId?: string }) =>
    toplu.mutate(
      { ids: secilenIds, ...body },
      {
        onSuccess: ({ guncellenen, reddedilen }) => {
          if (guncellenen.length)
            toast.success(`${guncellenen.length} görev güncellendi`)
          if (reddedilen.length)
            toast.error(
              `${reddedilen.length} görev başkasına atandığı için tamamlanamadı`,
              {
                description:
                  "Başkasının görevini yalnızca yönetici tamamlayabilir.",
              }
            )
          setDurum("")
          setAtanan("")
          onTamamlandi()
        },
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <div
      role="region"
      aria-label="Toplu işlemler"
      className="flex flex-wrap items-center gap-2 rounded-3xl border bg-muted/50 px-4 py-2"
    >
      <span className="text-sm font-medium">
        {secilenIds.length} görev seçildi
      </span>
      <Select
        items={GOREV_DURUM_ETIKET}
        value={durum || null}
        onValueChange={(v) => setDurum((v as GorevDurum) ?? "")}
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Yeni durum">
          <SelectValue placeholder="Durum seçin" />
        </SelectTrigger>
        <SelectContent>
          {GOREV_DURUM_SIRASI.map((d) => (
            <SelectItem key={d} value={d}>
              {GOREV_DURUM_ETIKET[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!durum || toplu.isPending}
        onClick={() => durum && uygula({ durum })}
      >
        Durumu değiştir
      </Button>
      <PersonelSelect
        aria-label="Atanacak personel"
        placeholder="Personel seçin"
        value={atanan}
        onValueChange={setAtanan}
        className="w-44"
      />
      <Button
        size="sm"
        disabled={!atanan || toplu.isPending}
        onClick={() => uygula({ atananId: atanan })}
      >
        Ata
      </Button>
      <Button size="sm" variant="ghost" onClick={onTamamlandi}>
        Seçimi temizle
      </Button>
    </div>
  )
}

export function GorevTablosu({
  gorevler,
  personelById,
  onAc,
  mukellefGizli,
  secilebilir = true,
}: {
  gorevler: GorevView[]
  personelById: Map<string, Personel>
  onAc: (id: string) => void
  /** Mükellef kartında mükellef sütunu gizlenir */
  mukellefGizli?: boolean
  secilebilir?: boolean
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table }) => (
            <Checkbox
              aria-label="Tüm görevleri seç"
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              onCheckedChange={(checked) =>
                table.toggleAllRowsSelected(checked)
              }
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`${row.original.baslik} (${row.original.mukellefUnvan}) seç`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(checked)}
            />
          ),
        }),
        helper.accessor("baslik", {
          header: "Görev",
          cell: ({ row }) => (
            <div className="flex min-w-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => onAc(row.original.id)}
                className="truncate text-left font-medium hover:underline"
              >
                {row.original.baslik}
              </button>
              <span className="flex flex-wrap items-center gap-1.5">
                <GorevTipBadge tip={row.original.tip} />
                {row.original.donem && (
                  <span className="text-xs text-muted-foreground">
                    {donemEtiketi(row.original.donem)}
                  </span>
                )}
                <OncelikIsareti oncelik={row.original.oncelik} />
              </span>
            </div>
          ),
        }),
        helper.accessor("mukellefUnvan", {
          header: "Mükellef",
          cell: ({ row }) => (
            <Link
              to={`/mukellefler/${row.original.mukellefId}/gorevler`}
              className="block truncate hover:underline"
            >
              {row.original.mukellefUnvan}
            </Link>
          ),
        }),
        helper.accessor("durum", {
          header: "Durum",
          cell: ({ getValue }) => <GorevDurumBadge durum={getValue()} />,
        }),
        helper.display({
          id: "ilerleme",
          header: "Kontrol listesi",
          cell: ({ row }) => {
            const i = checklistIlerleme(row.original.checklist)
            return i.toplam ? (
              <span className="text-muted-foreground tabular-nums">
                {i.tamam}/{i.toplam}
              </span>
            ) : (
              "—"
            )
          },
        }),
        helper.accessor("atananId", {
          header: "Atanan",
          cell: ({ getValue }) => {
            const p = personelById.get(getValue())
            return p ? (
              <div className="flex items-center gap-2">
                <PersonelAvatar personel={p} size="sm" />
                <span className="truncate">
                  {p.ad} {p.soyad}
                </span>
              </div>
            ) : (
              "—"
            )
          },
        }),
        helper.accessor("sonTarih", {
          header: "Son tarih",
          cell: ({ row }) => (
            <SonTarih
              sonTarih={row.original.sonTarih}
              gecikti={row.original.gecikti}
            />
          ),
        }),
      ]),
    [onAc, personelById]
  )

  const table = useTable({
    features,
    columns,
    data: gorevler,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  })

  const gizli = new Set([
    ...(secilebilir ? [] : ["select"]),
    ...(mukellefGizli ? ["mukellefUnvan"] : []),
  ])
  const mobildeGizli = new Set(["ilerleme", "atananId", "mukellefUnvan"])
  const cellClass = (id: string) =>
    cn(
      id === "select" && "w-10",
      mobildeGizli.has(id) && "hidden md:table-cell"
    )
  const secilenIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  return (
    <div className="grid gap-3">
      {secilebilir && secilenIds.length > 0 && (
        <TopluIslemCubugu
          secilenIds={secilenIds}
          onTamamlandi={() => setRowSelection({})}
        />
      )}
      <div className="overflow-hidden rounded-3xl border">
        <Table aria-label="Görevler">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers
                  .filter((h) => !gizli.has(h.column.id))
                  .map((header) => (
                    <TableHead
                      key={header.id}
                      className={cellClass(header.column.id)}
                    >
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                {row
                  .getAllCells()
                  .filter((c) => !gizli.has(c.column.id))
                  .map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("max-w-72", cellClass(cell.column.id))}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
