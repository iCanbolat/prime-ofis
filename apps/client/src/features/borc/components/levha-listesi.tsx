import { Link } from "react-router"
import { File01Icon } from "@hugeicons/core-free-icons"
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
import { ButtonLink } from "@/components/shared/button-link"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { KamuErisimBadge } from "@/features/borc/components/borc-rozetleri"
import { DogrulamaDialog } from "@/features/borc/components/dogrulama"
import { useBorcParams, useKamuIslem } from "@/features/borc/hooks"
import { useLevhalar, useLevhaSorgula } from "@/features/borc/queries"
import { BORC_SAYFA_BOYUTU, levhaArsivYolu } from "@prime/shared/borc/sabitler"
import { formatDateTime, formatTRY } from "@prime/shared/lib/format"

const KAPSAM_ETIKET = { eksik: "Eksik", guncel: "Güncel" } as const
type LevhaKapsam = keyof typeof KAPSAM_ETIKET

/** Mükelleflerin GİB'deki en yeni vergi levhası; eksikler önce */
export function LevhaListesi() {
  const { searchParams, guncelle } = useBorcParams()
  const q = searchParams.get("q") ?? ""
  const kapsamParam = searchParams.get("kapsam")
  const kapsam =
    kapsamParam && kapsamParam in KAPSAM_ETIKET
      ? (kapsamParam as LevhaKapsam)
      : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const liste = useLevhalar({
    q: q || undefined,
    kapsam: kapsam ?? undefined,
    sayfa,
    sayfaBoyutu: BORC_SAYFA_BOYUTU,
  })
  const sorgula = useLevhaSorgula()
  const islem = useKamuIslem()

  return (
    <>
      <ListeAraclari
        etiket="Vergi levhası filtreleri"
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
          etiket="Levha durumu"
          secenekler={KAPSAM_ETIKET}
          value={kapsam}
          onChange={(v) => guncelle({ kapsam: v })}
        />
      </ListeAraclari>
      {liste.data && (
        <p className="text-sm text-muted-foreground">
          Bugün GİB'de {liste.data.beklenenYil} yılı levhası beklenir. Eksik
          levhalar gece sorgusunda otomatik alınıp arşive kaydedilir.
        </p>
      )}

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <LoadingState />
      ) : liste.data.items.length === 0 ? (
        <EmptyState
          icon={File01Icon}
          title={
            kapsam === "eksik"
              ? "Levhası eksik mükellef yok"
              : "Filtreyle eşleşen mükellef yok"
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="Vergi levhaları">
              <TableHeader>
                <TableRow>
                  <TableHead>Mükellef</TableHead>
                  <TableHead>Levha</TableHead>
                  <TableHead className="hidden lg:table-cell">Alındı</TableHead>
                  <TableHead>
                    <span className="sr-only">İşlem</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((s) => {
                  const bekliyor =
                    sorgula.isPending && sorgula.variables === s.mukellefId
                  const alinabilir =
                    s.erisimDurumu === "AKTIF" || s.erisimDurumu === "DOGRULAMA"
                  return (
                    <TableRow key={s.mukellefId}>
                      <TableCell className="max-w-72 whitespace-normal">
                        <Link
                          to={`/mukellefler/${s.mukellefId}/borc`}
                          className="font-medium hover:underline"
                        >
                          {s.mukellefUnvan}
                        </Link>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {s.vkn}
                        </span>
                        {s.erisimDurumu !== "AKTIF" && (
                          <KamuErisimBadge
                            durum={s.erisimDurumu}
                            className="mt-1"
                          />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {s.levha ? (
                          <span className="grid">
                            <span className="font-medium">
                              {s.levha.yil} · {s.levha.vergiTuru}
                            </span>
                            {s.levha.matrah !== undefined && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                Matrah {formatTRY(s.levha.matrah)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Yok</span>
                        )}
                        <Badge
                          variant="secondary"
                          className={
                            s.guncel
                              ? "mt-1 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                              : "mt-1 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                          }
                        >
                          {s.guncel
                            ? "Güncel"
                            : `${liste.data.beklenenYil} eksik`}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                        {s.levha ? formatDateTime(s.levha.sorguTarihi) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {s.levha && (
                            <ButtonLink
                              size="sm"
                              variant="ghost"
                              to={levhaArsivYolu(s.mukellefId)}
                            >
                              Arşivde aç
                            </ButtonLink>
                          )}
                          {!s.guncel && alinabilir && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bekliyor}
                              aria-label={`${s.mukellefUnvan} vergi levhasını GİB'den al`}
                              onClick={() =>
                                sorgula.mutate(s.mukellefId, {
                                  onSuccess: (r) =>
                                    islem.sonuc(
                                      r,
                                      `${s.mukellefUnvan}: vergi levhası sorgulandı`
                                    ),
                                  onError: (error) =>
                                    toast.error(error.message),
                                })
                              }
                            >
                              {bekliyor ? "Alınıyor…" : "GİB'den al"}
                            </Button>
                          )}
                        </div>
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
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </>
  )
}
