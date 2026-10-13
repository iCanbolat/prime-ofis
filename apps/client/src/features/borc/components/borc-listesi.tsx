import { Coins01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BorcDetaySheet } from "@/features/borc/components/borc-detay-sheet"
import {
  BorcTutari,
  KamuErisimBadge,
} from "@/features/borc/components/borc-rozetleri"
import { DogrulamaDialog } from "@/features/borc/components/dogrulama"
import { useBorcParams, useKamuIslem } from "@/features/borc/hooks"
import { useBorcListe, useBorcSorgula } from "@/features/borc/queries"
import {
  BORC_KAPSAM_ETIKET,
  BORC_KURUM_BASLIK,
  BORC_SAYFA_BOYUTU,
} from "@prime/shared/borc/sabitler"
import { formatDateTime } from "@prime/shared/lib/format"
import type { BorcKapsam } from "@prime/shared/types/api"
import type { KamuKurum } from "@prime/shared/types/domain"

const KAPSAMLAR = Object.keys(BORC_KAPSAM_ETIKET) as BorcKapsam[]

/** URL durumlu borç listesi (`q`, `kapsam`, `sayfa`, detay için `borc=mukellefId`) */
export function BorcListesi({ kurum }: { kurum: KamuKurum }) {
  const { searchParams, guncelle } = useBorcParams()
  const q = searchParams.get("q") ?? ""
  const kapsamParam = searchParams.get("kapsam") as BorcKapsam | null
  const kapsam =
    kapsamParam && KAPSAMLAR.includes(kapsamParam) ? kapsamParam : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const secili = searchParams.get("borc")
  const liste = useBorcListe({
    kurum,
    q: q || undefined,
    kapsam: kapsam ?? undefined,
    sayfa,
    sayfaBoyutu: BORC_SAYFA_BOYUTU,
  })
  const sorgula = useBorcSorgula()
  const islem = useKamuIslem()

  return (
    <>
      <ListeAraclari
        etiket={`${BORC_KURUM_BASLIK[kurum]} filtreleri`}
        arama={
          <AramaKutusu
            etiket="Mükellef ara"
            placeholder="Mükellef, VKN"
            value={q}
            onChange={(v) => guncelle({ q: v.trim() || null })}
          />
        }
      >
        <SekmeFiltre
          etiket="Kapsam"
          secenekler={BORC_KAPSAM_ETIKET}
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
          icon={Coins01Icon}
          title={
            kapsam || q
              ? "Filtreyle eşleşen mükellef yok"
              : kurum === "SGK"
                ? "SGK işyeri olan mükellef yok"
                : "Aktif mükellef yok"
          }
          action={
            (kapsam || q) && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => guncelle({ kapsam: null, q: null })}
              >
                Filtreleri temizle
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label={BORC_KURUM_BASLIK[kurum]}>
              <TableHeader>
                <TableRow>
                  <TableHead>Mükellef</TableHead>
                  <TableHead className="hidden md:table-cell">Erişim</TableHead>
                  <TableHead>Borç</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Son sorgu
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">İşlem</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((s) => {
                  const sorgulanabilir =
                    s.erisimDurumu === "AKTIF" || s.erisimDurumu === "DOGRULAMA"
                  const bekliyor =
                    sorgula.isPending &&
                    sorgula.variables?.mukellefId === s.mukellefId
                  return (
                    <TableRow key={s.mukellefId}>
                      <TableCell className="max-w-72 whitespace-normal">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => guncelle({ borc: s.mukellefId })}
                        >
                          {s.mukellefUnvan}
                        </button>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {s.vkn}
                        </span>
                        <KamuErisimBadge
                          durum={s.erisimDurumu}
                          className="mt-1 md:hidden"
                        />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <KamuErisimBadge durum={s.erisimDurumu} />
                      </TableCell>
                      <TableCell>
                        <BorcTutari sorgu={s.sorgu} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                        {s.sorgu ? formatDateTime(s.sorgu.sorguTarihi) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {sorgulanabilir ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bekliyor}
                            aria-label={`${s.mukellefUnvan} ${BORC_KURUM_BASLIK[kurum].toLocaleLowerCase("tr-TR")} sorgula`}
                            onClick={() =>
                              sorgula.mutate(
                                { mukellefId: s.mukellefId, kurum },
                                {
                                  onSuccess: (r) =>
                                    islem.sonuc(
                                      r,
                                      `${s.mukellefUnvan}: ${BORC_KURUM_BASLIK[kurum].toLocaleLowerCase("tr-TR")} sorgulandı`
                                    ),
                                  onError: (error) =>
                                    toast.error(error.message),
                                }
                              )
                            }
                          >
                            {bekliyor ? "Sorgulanıyor…" : "Sorgula"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => guncelle({ borc: s.mukellefId })}
                          >
                            Ayrıntı
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Sayfalama
            total={liste.data.total}
            sayfa={liste.data.sayfa}
            sayfaBoyutu={liste.data.sayfaBoyutu}
            birim="mükelleften"
            onChange={(s) => guncelle({ sayfa: String(s) })}
          />
        </>
      )}

      <BorcDetaySheet
        hedef={secili ? { mukellefId: secili, kurum } : null}
        onClose={() => guncelle({ borc: null })}
      />
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </>
  )
}
