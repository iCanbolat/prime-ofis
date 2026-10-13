import { useMemo } from "react"
import { Link } from "react-router"
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FaturaDurumRozetleri } from "@/features/e-belge/components/ebelge-rozetleri"
import { formatTutar } from "@prime/shared/e-belge/kurallar"
import {
  EBELGE_YON_ETIKET,
  FATURA_TIPI_ETIKET,
} from "@prime/shared/e-belge/sabitler"
import { formatDate } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { EBelgeSiralama, EBelgeView, SiralamaYonu } from "@prime/shared/types/api"

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, EBelgeView>()

interface SiralamaDurumu {
  sirala: EBelgeSiralama
  yon: SiralamaYonu
  onChange: (sirala: EBelgeSiralama, yon: SiralamaYonu) => void
}

function SiralamaButonu({
  alan,
  children,
  siralama,
  className,
}: {
  alan: EBelgeSiralama
  children: string
  siralama: SiralamaDurumu
  className?: string
}) {
  const aktif = siralama.sirala === alan
  const icon = !aktif
    ? ArrowUpDownIcon
    : siralama.yon === "asc"
      ? ArrowUp01Icon
      : ArrowDown01Icon
  // İlk tıklamada en yeni / en yüksek önce
  const sonrakiYon: SiralamaYonu =
    aktif && siralama.yon === "desc" ? "asc" : "desc"
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-3", className)}
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

/** GİB durumu yalnızca başarısızsa öne çıkar; gelen ticari faturada yanıt durumu gösterilir. */
interface FaturaTablosuProps {
  data: EBelgeView[]
  siralama: SiralamaDurumu
  isLoading: boolean
  onAc: (id: string) => void
  /** Mükellef kartında mükellef sütunu gizlenir */
  mukellefSutunu?: boolean
  /** e-Fatura listesinde yön rozeti gösterilir */
  yonGoster?: boolean
}

export function FaturaTablosu({
  data,
  siralama,
  isLoading,
  onAc,
  mukellefSutunu = true,
  yonGoster = true,
}: FaturaTablosuProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("duzenlemeTarihi", {
          header: () => (
            <SiralamaButonu alan="tarih" siralama={siralama}>
              Tarih
            </SiralamaButonu>
          ),
          cell: ({ getValue }) => (
            <span className="text-muted-foreground tabular-nums">
              {formatDate(getValue())}
            </span>
          ),
        }),
        helper.accessor("belgeNo", {
          header: "Belge",
          cell: ({ row }) => {
            const f = row.original
            return (
              <div className="flex min-w-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onAc(f.id)}
                  className="w-fit text-left font-mono text-xs font-medium tabular-nums hover:underline"
                  aria-label={`${f.belgeNo} faturasını aç`}
                >
                  {f.belgeNo}
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
                    {formatDate(f.duzenlemeTarihi)}
                  </span>
                  {yonGoster && (
                    <Badge variant="outline">{EBELGE_YON_ETIKET[f.yon]}</Badge>
                  )}
                  {f.faturaTipi !== "SATIS" && (
                    <Badge variant="outline">
                      {FATURA_TIPI_ETIKET[f.faturaTipi]}
                    </Badge>
                  )}
                  {/* Dar ekranda gizlenen karşı taraf */}
                  <span className="truncate text-xs text-muted-foreground xl:hidden">
                    {f.karsiTaraf.unvan}
                  </span>
                </div>
                {/* Dar ekranda gizlenen durum sütunu */}
                <div className="sm:hidden">
                  <FaturaDurumRozetleri f={f} />
                </div>
              </div>
            )
          },
        }),
        helper.accessor("mukellefUnvan", {
          header: "Mükellef",
          cell: ({ row }) => (
            <Link
              to={`/mukellefler/${row.original.mukellefId}/e-belge`}
              className="line-clamp-2 hover:underline"
            >
              {row.original.mukellefUnvan}
            </Link>
          ),
        }),
        helper.display({
          id: "karsiTaraf",
          header: "Karşı taraf",
          cell: ({ row }) => (
            <div className="grid min-w-0">
              <span className="truncate">{row.original.karsiTaraf.unvan}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {row.original.karsiTaraf.vknTckn}
              </span>
            </div>
          ),
        }),
        helper.accessor("toplam", {
          header: () => (
            <SiralamaButonu
              alan="toplam"
              siralama={siralama}
              className="-mr-3 ml-auto flex"
            >
              Tutar
            </SiralamaButonu>
          ),
          cell: ({ row }) => (
            <span className="block text-right font-medium tabular-nums">
              {formatTutar(row.original.toplam, row.original.paraBirimi)}
            </span>
          ),
        }),
        helper.display({
          id: "durum",
          header: "Durum",
          cell: ({ row }) => <FaturaDurumRozetleri f={row.original} />,
        }),
      ]),
    [siralama, onAc, yonGoster]
  )

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
  })

  const cellClass = (id: string) =>
    cn(
      id === "mukellefUnvan" && !mukellefSutunu && "hidden",
      id === "mukellefUnvan" &&
        mukellefSutunu &&
        "hidden whitespace-normal md:table-cell",
      id === "karsiTaraf" && "hidden xl:table-cell",
      id === "durum" && "hidden min-w-32 whitespace-normal sm:table-cell",
      id === "duzenlemeTarihi" && "hidden sm:table-cell",
      id === "toplam" && "text-right",
      id === "belgeNo" && "whitespace-normal"
    )

  return (
    <div className="overflow-hidden rounded-3xl border">
      <Table aria-label="Faturalar">
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
                  {table.getAllLeafColumns().map((c) => (
                    <TableCell key={c.id} className={cellClass(c.id)}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("max-w-64", cellClass(cell.column.id))}
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
