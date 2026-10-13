import { useCallback, useState } from "react"
import { useSearchParams } from "react-router"
import { MoneyReceive02Icon } from "@hugeicons/core-free-icons"

import {
  AramaKutusu,
  ListeAraclari,
  SekmeFiltre,
} from "@/components/shared/liste-araclari"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MukellefeGonderDialog } from "@/features/kanal/components/mukellefe-gonder-dialog"
import { useMukellef } from "@/features/mukellef/queries"
import { CariPanel } from "@/features/tahsilat/components/cari-panel"
import { OdemeDialog } from "@/features/tahsilat/components/odeme-dialog"
import { CariDurumBadge } from "@/features/tahsilat/components/tahsilat-rozetleri"
import { useCariList } from "@/features/tahsilat/queries"
import { SAYFA_BOYUTU } from "@prime/shared/tahsilat/sabitler"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { CariListParams, CariSatiri } from "@prime/shared/types/api"

type Kapsam = "bakiyeli" | "geciken"
const KAPSAM_ETIKET: Record<Kapsam, string> = {
  bakiyeli: "Bakiyeli",
  geciken: "Geciken",
}

function EkstreSheet({
  mukellefId,
  onClose,
}: {
  mukellefId: string | undefined
  onClose: () => void
}) {
  const mukellef = useMukellef(mukellefId ?? "")
  return (
    <Sheet open={Boolean(mukellefId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="pr-12">
          <SheetTitle>{mukellef.data?.unvan ?? "Cari hesap"}</SheetTitle>
          <SheetDescription>Cari hesap ekstresi</SheetDescription>
        </SheetHeader>
        <div className="@container overflow-y-auto px-4 pb-6">
          {mukellef.isError ? (
            <ErrorState
              error={mukellef.error}
              onRetry={() => mukellef.refetch()}
            />
          ) : mukellef.data ? (
            <CariPanel mukellef={mukellef.data} />
          ) : (
            <LoadingState />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function BorcluSatiri({
  borclular,
  onHatirlat,
}: {
  borclular: CariSatiri[]
  onHatirlat: () => void
}) {
  if (borclular.length === 0) return null
  const toplam = borclular.reduce((t, s) => t + s.acikBorc, 0)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/40 px-4 py-2 text-sm">
      <span>
        Bu sayfada {borclular.length} mükellefin {formatTRY(toplam)} açık borcu
        var.
      </span>
      <Button size="sm" variant="outline" onClick={onHatirlat}>
        Borç hatırlat
      </Button>
    </div>
  )
}

export function CariPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const kapsam: Kapsam | null =
    searchParams.get("geciken") === "true"
      ? "geciken"
      : searchParams.get("bakiyeli") === "true"
        ? "bakiyeli"
        : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const acikMukellef = searchParams.get("mukellef") ?? undefined
  const [odemeMukellef, setOdemeMukellef] = useState<string | null>(null)
  const [hatirlat, setHatirlat] = useState(false)

  const params: CariListParams = {
    q: q || undefined,
    geciken: kapsam === "geciken" || undefined,
    bakiyeli: kapsam === "bakiyeli" || undefined,
    sayfa,
    sayfaBoyutu: SAYFA_BOYUTU,
  }
  const liste = useCariList(params)

  const guncelle = useCallback(
    (degisim: Record<string, string | null>) =>
      setSearchParams(
        (onceki) => {
          const yeni = new URLSearchParams(onceki)
          for (const [k, v] of Object.entries(degisim)) {
            if (v === null || v === "") yeni.delete(k)
            else yeni.set(k, v)
          }
          if (!("sayfa" in degisim)) yeni.delete("sayfa")
          return yeni
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  return (
    <>
      <ListeAraclari
        etiket="Cari hesap filtreleri"
        arama={
          <AramaKutusu
            etiket="Mükellef ara"
            placeholder="Unvan, VKN veya TCKN"
            value={q}
            onChange={(v) => guncelle({ q: v })}
          />
        }
      >
        <SekmeFiltre
          etiket="Kapsam"
          secenekler={KAPSAM_ETIKET}
          value={kapsam}
          onChange={(v) =>
            guncelle({
              geciken: v === "geciken" ? "true" : null,
              bakiyeli: v === "bakiyeli" ? "true" : null,
            })
          }
        />
      </ListeAraclari>

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <LoadingState />
      ) : liste.data.items.length === 0 ? (
        <EmptyState
          icon={MoneyReceive02Icon}
          title={
            kapsam === "geciken"
              ? "Geciken ödeme yok"
              : "Bu filtrede mükellef yok"
          }
        />
      ) : (
        <>
          <BorcluSatiri
            borclular={liste.data.items.filter((s) => s.acikBorc > 0)}
            onHatirlat={() => setHatirlat(true)}
          />
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="Cari hesaplar">
              <TableHeader>
                <TableRow>
                  <TableHead>Mükellef</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Aylık ücret
                  </TableHead>
                  <TableHead className="text-right">Bakiye</TableHead>
                  <TableHead className="hidden sm:table-cell">Durum</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Son ödeme
                  </TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((s) => (
                  <TableRow key={s.mukellefId}>
                    <TableCell className="max-w-72 whitespace-normal sm:whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          guncelle({
                            mukellef: s.mukellefId,
                            sayfa: String(sayfa),
                          })
                        }
                        className="line-clamp-2 text-left font-medium hover:underline sm:block sm:truncate"
                      >
                        {s.mukellefUnvan}
                      </button>
                      <CariDurumBadge durum={s} className="mt-1 sm:hidden" />
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {s.ucret ? formatTRY(s.ucret.aylikBrut) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        s.geciken && "text-destructive",
                        s.bakiye < 0 && "text-sky-700 dark:text-sky-300"
                      )}
                    >
                      {formatTRY(s.bakiye)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <CariDurumBadge durum={s} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                      {s.sonOdeme ? formatDate(s.sonOdeme) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${s.mukellefUnvan} için ödeme al`}
                        onClick={() => setOdemeMukellef(s.mukellefId)}
                      >
                        Ödeme al
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Sayfalama
            total={liste.data.total}
            sayfa={liste.data.sayfa}
            sayfaBoyutu={liste.data.sayfaBoyutu}
            birim="mükelleften"
            onChange={(s) => guncelle({ sayfa: String(s) })}
            ek={<> · toplam bakiye {formatTRY(liste.data.toplamBakiye)}</>}
          />
        </>
      )}

      <OdemeDialog
        mukellefId={odemeMukellef}
        onClose={() => setOdemeMukellef(null)}
      />
      <EkstreSheet
        mukellefId={acikMukellef}
        onClose={() => guncelle({ mukellef: null, sayfa: String(sayfa) })}
      />
      <MukellefeGonderDialog
        acik={hatirlat}
        sablon="BORC_HATIRLATMA"
        hedefler={(liste.data?.items ?? [])
          .filter((s) => s.acikBorc > 0)
          .map((s) => ({ mukellefId: s.mukellefId }))}
        baslik="Toplu borç hatırlatması"
        onClose={() => setHatirlat(false)}
      />
    </>
  )
}
