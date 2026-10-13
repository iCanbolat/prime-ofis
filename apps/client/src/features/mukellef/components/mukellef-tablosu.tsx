import { useMemo } from "react"
import { Link } from "react-router"
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AktifBadge,
  MukellefTurBadge,
} from "@/features/mukellef/components/mukellef-badges"
import { formatDate, maskTaxId } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { MukellefSiralama, SiralamaYonu } from "@prime/shared/types/api"
import type { Mukellef, Personel } from "@prime/shared/types/domain"

const features = tableFeatures({ rowSelectionFeature })
const helper = createColumnHelper<typeof features, Mukellef>()

interface SiralamaDurumu {
  sirala: MukellefSiralama
  yon: SiralamaYonu
  onChange: (sirala: MukellefSiralama, yon: SiralamaYonu) => void
}

function SiralamaButonu({
  alan,
  children,
  siralama,
}: {
  alan: MukellefSiralama
  children: string
  siralama: SiralamaDurumu
}) {
  const aktif = siralama.sirala === alan
  const icon = !aktif
    ? ArrowUpDownIcon
    : siralama.yon === "asc"
      ? ArrowUp01Icon
      : ArrowDown01Icon
  const sonrakiYon: SiralamaYonu =
    aktif && siralama.yon === "asc" ? "desc" : "asc"
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3"
      onClick={() => siralama.onChange(alan, sonrakiYon)}
      aria-label={`${children} sütununa göre sırala`}
    >
      {children}
      <HugeiconsIcon
        icon={icon}
        data-icon="inline-end"
        strokeWidth={2}
        className={cn(!aktif && "text-muted-foreground")}
      />
    </Button>
  )
}

interface MukellefTablosuProps {
  data: Mukellef[]
  personelById: Map<string, Personel>
  rowSelection: RowSelectionState
  onRowSelectionChange: (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)
  ) => void
  siralama: SiralamaDurumu
  isLoading: boolean
}

export function MukellefTablosu({
  data,
  personelById,
  rowSelection,
  onRowSelectionChange,
  siralama,
  isLoading,
}: MukellefTablosuProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table }) => (
            <Checkbox
              aria-label="Sayfadaki tüm mükellefleri seç"
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              onCheckedChange={(checked) =>
                table.toggleAllRowsSelected(checked)
              }
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`${row.original.unvan} seç`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(checked)}
            />
          ),
        }),
        helper.accessor("unvan", {
          header: () => (
            <SiralamaButonu alan="unvan" siralama={siralama}>
              Unvan
            </SiralamaButonu>
          ),
          cell: ({ row }) => (
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                to={`/mukellefler/${row.original.id}`}
                className="line-clamp-2 font-medium hover:underline sm:truncate"
              >
                {row.original.unvan}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MukellefTurBadge tur={row.original.tur} />
                {/* Dar ekranda gizlenen sütunların özeti */}
                <span className="font-mono text-xs text-muted-foreground tabular-nums md:hidden">
                  {maskTaxId(row.original.vkn ?? row.original.tckn)}
                </span>
                {!row.original.aktif && (
                  <span className="sm:hidden">
                    <AktifBadge aktif={false} />
                  </span>
                )}
              </div>
            </div>
          ),
        }),
        helper.display({
          id: "kimlik",
          header: "VKN / TCKN",
          cell: ({ row }) => (
            <span className="font-mono text-xs tabular-nums">
              {maskTaxId(row.original.vkn ?? row.original.tckn)}
            </span>
          ),
        }),
        helper.accessor("vergiDairesi", { header: "Vergi dairesi" }),
        helper.accessor("sorumluPersonelId", {
          header: "Sorumlu",
          cell: ({ getValue }) => {
            const p = personelById.get(getValue())
            return p ? (
              <div className="flex items-center gap-2">
                <PersonelAvatar personel={p} size="sm" />
                <span className="sr-only truncate sm:not-sr-only">
                  {p.ad} {p.soyad}
                </span>
              </div>
            ) : (
              "—"
            )
          },
        }),
        helper.accessor("aktif", {
          header: "Durum",
          cell: ({ getValue }) => <AktifBadge aktif={getValue()} />,
        }),
        helper.accessor("olusturmaTarihi", {
          header: () => (
            <SiralamaButonu alan="olusturmaTarihi" siralama={siralama}>
              Kayıt tarihi
            </SiralamaButonu>
          ),
          cell: ({ getValue }) => (
            <span className="text-muted-foreground tabular-nums">
              {formatDate(getValue())}
            </span>
          ),
        }),
      ]),
    [personelById, siralama]
  )

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange,
  })

  // Küçük ekranlarda ikincil sütunlar gizlenir (özetleri unvan hücresinde)
  const hiddenBelowMd = new Set(["kimlik", "vergiDairesi", "olusturmaTarihi"])
  const cellClass = (id: string) =>
    cn(
      id === "select" && "w-10",
      hiddenBelowMd.has(id) && "hidden md:table-cell",
      id === "aktif" && "hidden sm:table-cell",
      id === "unvan" && "whitespace-normal sm:whitespace-nowrap"
    )

  return (
    <div className="overflow-hidden rounded-3xl border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
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
          {isLoading && data.length === 0
            ? Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getAllCells().map((cell) => (
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
  )
}
