import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowTurnBackwardIcon,
  Delete02Icon,
  Edit02Icon,
  FolderTransferIcon,
  MoreHorizontalIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DonemBadge,
  DosyaIkonu,
  GecerlilikBadge,
} from "@/features/arsiv/components/dosya-gorsel"
import type { DosyaIslemleri } from "@/features/arsiv/components/dosya-islemleri"
import { KATEGORI_SIRASI, formatBoyut } from "@prime/shared/arsiv/kurallar"
import { formatDate } from "@prime/shared/lib/format"
import { ARSIV_KATEGORI_ETIKET } from "@prime/shared/types/domain"
import type { ArsivDosyaView } from "@prime/shared/types/api"

interface ListeProps {
  dosyalar: ArsivDosyaView[]
  islemler: DosyaIslemleri
  /** Mükellef adı gösterilsin mi (genel arşivde evet, mükellef sekmesinde hayır) */
  gosterMukellef: boolean
  cop: boolean
}

function DosyaMenu({
  dosya,
  islemler,
  cop,
}: {
  dosya: ArsivDosyaView
  islemler: DosyaIslemleri
  cop: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${dosya.ad} işlemleri`}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {cop ? (
          <>
            <DropdownMenuItem onClick={() => islemler.geriAl(dosya)}>
              <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
              Geri al
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => islemler.kaliciSil(dosya)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Kalıcı olarak sil
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={() => islemler.onizle(dosya)}>
              <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
              Önizle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => islemler.duzenle(dosya)}>
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              Düzenle
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} />
                Taşı
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {KATEGORI_SIRASI.filter((k) => k !== dosya.kategori).map(
                  (k) => (
                    <DropdownMenuItem
                      key={k}
                      onClick={() => islemler.tasi(dosya, k)}
                    >
                      {ARSIV_KATEGORI_ETIKET[k]}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => islemler.sil(dosya)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Çöp kutusuna taşı
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DosyaGrid({
  dosyalar,
  islemler,
  gosterMukellef,
  cop,
}: ListeProps) {
  return (
    <ul
      aria-label="Dosyalar"
      className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
    >
      {dosyalar.map((d) => (
        <li
          key={d.id}
          aria-label={d.ad}
          className="group/dosya relative flex flex-col gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <DosyaIkonu mimeType={d.mimeType} className="size-10" />
            <DosyaMenu dosya={d} islemler={islemler} cop={cop} />
          </div>
          <button
            type="button"
            disabled={cop}
            onClick={() => islemler.onizle(d)}
            className="grid min-w-0 gap-0.5 text-left leading-snug outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 disabled:cursor-default"
          >
            <span className="truncate text-sm font-medium">{d.ad}</span>
            <span className="truncate text-xs text-muted-foreground">
              {gosterMukellef
                ? d.mukellefUnvan
                : ARSIV_KATEGORI_ETIKET[d.kategori]}
            </span>
          </button>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {gosterMukellef && (
              <Badge variant="outline" className="max-w-full truncate">
                {ARSIV_KATEGORI_ETIKET[d.kategori]}
              </Badge>
            )}
            <DonemBadge dosya={d} />
            <GecerlilikBadge tarih={d.gecerlilikTarihi} />
            <span className="ml-auto tabular-nums">{formatBoyut(d.boyut)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DosyaTablo({
  dosyalar,
  islemler,
  gosterMukellef,
  cop,
}: ListeProps) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table aria-label="Dosyalar">
        <TableHeader>
          <TableRow>
            <TableHead>Ad</TableHead>
            {gosterMukellef && (
              <TableHead className="hidden lg:table-cell">Mükellef</TableHead>
            )}
            <TableHead className="hidden md:table-cell">Kategori</TableHead>
            <TableHead className="hidden sm:table-cell">Geçerlilik</TableHead>
            <TableHead className="hidden md:table-cell">
              {cop ? "Silinme" : "Yükleme"}
            </TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Boyut
            </TableHead>
            <TableHead className="w-10">
              <span className="sr-only">İşlemler</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dosyalar.map((d) => (
            <TableRow key={d.id} aria-label={d.ad}>
              <TableCell className="max-w-0 min-w-48">
                <div className="flex items-center gap-3">
                  <DosyaIkonu mimeType={d.mimeType} className="size-8" />
                  <button
                    type="button"
                    disabled={cop}
                    onClick={() => islemler.onizle(d)}
                    className="truncate text-left font-medium hover:underline disabled:no-underline"
                  >
                    {d.ad}
                  </button>
                </div>
              </TableCell>
              {gosterMukellef && (
                <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">
                  {d.mukellefUnvan}
                </TableCell>
              )}
              <TableCell className="hidden md:table-cell">
                <span className="grid justify-items-start gap-1">
                  {ARSIV_KATEGORI_ETIKET[d.kategori]}
                  <DonemBadge dosya={d} />
                </span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {d.gecerlilikTarihi ? (
                  <GecerlilikBadge tarih={d.gecerlilikTarihi} detayli />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                <span className="inline-flex items-center gap-2">
                  {d.yukleyen && !cop && (
                    <PersonelAvatar personel={d.yukleyen} size="sm" />
                  )}
                  {formatDate(
                    cop ? (d.silinmeTarihi ?? d.yuklemeTarihi) : d.yuklemeTarihi
                  )}
                </span>
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                {formatBoyut(d.boyut)}
              </TableCell>
              <TableCell>
                <DosyaMenu dosya={d} islemler={islemler} cop={cop} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
