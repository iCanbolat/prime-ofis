import { useCallback } from "react"
import { useSearchParams } from "react-router"
import { LegalDocument01Icon } from "@hugeicons/core-free-icons"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TebligatDetaySheet } from "@/features/tebligat/components/tebligat-detay-sheet"
import {
  SureBadge,
  TebligatDurumBadge,
} from "@/features/tebligat/components/tebligat-rozetleri"
import { useTebligatlar } from "@/features/tebligat/queries"
import {
  KAPSAM_ETIKET,
  KURUM_ETIKET,
  SAYFA_BOYUTU,
  TEBLIGAT_TUR_ETIKET,
} from "@prime/shared/tebligat/sabitler"
import { formatDate } from "@prime/shared/lib/format"
import type { TebligatKapsam } from "@prime/shared/types/api"

const KAPSAMLAR = Object.keys(KAPSAM_ETIKET) as TebligatKapsam[]

/** URL durumlu tebligat listesi + detay paneli; `mukellefId` verilirse o mükellefle sınırlı */
export function TebligatListesi({ mukellefId }: { mukellefId?: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const kapsamParam = searchParams.get("kapsam") as TebligatKapsam | null
  const kapsam =
    kapsamParam && KAPSAMLAR.includes(kapsamParam) ? kapsamParam : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const acik = searchParams.get("tebligat") ?? undefined

  const liste = useTebligatlar({
    mukellefId,
    kapsam: kapsam ?? undefined,
    q: q || undefined,
    sayfa,
    sayfaBoyutu: SAYFA_BOYUTU,
  })

  const guncelle = useCallback(
    (degisim: Record<string, string | null>) =>
      setSearchParams(
        (onceki) => {
          const yeni = new URLSearchParams(onceki)
          for (const [k, v] of Object.entries(degisim)) {
            if (v === null || v === "") yeni.delete(k)
            else yeni.set(k, v)
          }
          if (!("sayfa" in degisim) && !("tebligat" in degisim))
            yeni.delete("sayfa")
          return yeni
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  return (
    <>
      <ListeAraclari
        etiket="Tebligat filtreleri"
        arama={
          <AramaKutusu
            etiket="Tebligat ara"
            placeholder={
              mukellefId ? "Konu veya belge no" : "Mükellef, VKN, konu"
            }
            value={q}
            onChange={(v) => guncelle({ q: v })}
          />
        }
      >
        <SekmeFiltre
          etiket="Kapsam"
          secenekler={KAPSAM_ETIKET}
          value={kapsam}
          onChange={(v) => guncelle({ kapsam: v })}
        />
      </ListeAraclari>

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <LoadingState />
      ) : liste.data.items.length === 0 ? (
        <EmptyState
          icon={LegalDocument01Icon}
          title={kapsam ? "Bu filtrede tebligat yok" : "Henüz e-Tebligat yok"}
          description="Gece taramasında GİB e-Tebligat kutularından alınan ve elle girilen tebligatlar burada listelenir."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="e-Tebligatlar">
              <TableHeader>
                <TableRow>
                  <TableHead>Tebligat</TableHead>
                  {!mukellefId && (
                    <TableHead className="hidden md:table-cell">
                      Mükellef
                    </TableHead>
                  )}
                  <TableHead className="hidden sm:table-cell">Ulaştı</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Son gün
                  </TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => guncelle({ tebligat: t.id })}
                      >
                        {TEBLIGAT_TUR_ETIKET[t.tur]}
                      </button>
                      <span className="block truncate text-xs text-muted-foreground">
                        {KURUM_ETIKET[t.kurum]} · {t.konu}
                      </span>
                      {!mukellefId && (
                        <span className="block truncate text-xs md:hidden">
                          {t.mukellefUnvan}
                        </span>
                      )}
                    </TableCell>
                    {!mukellefId && (
                      <TableCell className="hidden max-w-64 whitespace-normal md:table-cell">
                        {t.mukellefUnvan}
                      </TableCell>
                    )}
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                      {formatDate(t.ulasmaTarihi)}
                    </TableCell>
                    <TableCell className="hidden tabular-nums lg:table-cell">
                      {t.sonIslemTarihi ? formatDate(t.sonIslemTarihi) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <TebligatDurumBadge durum={t.durum} />
                        <SureBadge t={t} />
                      </div>
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
            birim="tebligattan"
            onChange={(s) => guncelle({ sayfa: String(s) })}
          />
        </>
      )}

      <TebligatDetaySheet
        tebligatId={acik}
        onClose={() => guncelle({ tebligat: null })}
      />
    </>
  )
}
