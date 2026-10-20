import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Link04Icon,
  MoreHorizontalIcon,
  PlugSocketIcon,
} from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { BaglantiDialog } from "@/features/e-belge/components/baglanti-dialog"
import { LucaFirmaAktarimDialog } from "@/features/e-belge/components/luca-firma-aktarim"
import { BaglantiDurumBadge } from "@/features/e-belge/components/ebelge-rozetleri"
import {
  useBaglantiKaldir,
  useBaglantilar,
  useSenkron,
} from "@/features/e-belge/queries"
import { BAGLANTI_DURUM_ETIKET } from "@prime/shared/e-belge/sabitler"
import { formatDateTime } from "@prime/shared/lib/format"
import type { EntegratorBaglantiView } from "@prime/shared/types/api"
import type { EntegratorBaglantiDurumu } from "@prime/shared/types/domain"

const DURUMLAR = Object.keys(
  BAGLANTI_DURUM_ETIKET
) as EntegratorBaglantiDurumu[]
const TUMU = "TUMU"

function Servisler({ b }: { b: EntegratorBaglantiView }) {
  const servisler = [
    b.eFatura && "e-Fatura",
    b.eArsiv && "e-Arşiv",
    b.eDefter && "e-Defter",
  ].filter((s): s is string => Boolean(s))
  if (servisler.length === 0)
    return <span className="text-muted-foreground">—</span>
  return <span className="text-sm">{servisler.join(" · ")}</span>
}

export function BaglantilarPage() {
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])
  const baglantilar = useBaglantilar()
  const kaldir = useBaglantiKaldir()
  const senkron = useSenkron()
  const [searchParams, setSearchParams] = useSearchParams()
  const durumParam = searchParams.get(
    "durum"
  ) as EntegratorBaglantiDurumu | null
  const durum = durumParam && DURUMLAR.includes(durumParam) ? durumParam : null
  const [duzenlenen, setDuzenlenen] = useState<EntegratorBaglantiView | null>(
    null
  )
  const [kaldirilacak, setKaldirilacak] =
    useState<EntegratorBaglantiView | null>(null)
  const [aktarim, setAktarim] = useState(false)

  const sayilar = useMemo(() => {
    const s: Record<EntegratorBaglantiDurumu, number> = {
      BAGLI: 0,
      HATA: 0,
      BAGLI_DEGIL: 0,
    }
    for (const b of baglantilar.data ?? []) s[b.durum]++
    return s
  }, [baglantilar.data])

  const gorunenler = (baglantilar.data ?? []).filter(
    (b) => !durum || b.durum === durum
  )

  if (baglantilar.isError)
    return (
      <ErrorState
        error={baglantilar.error}
        onRetry={() => baglantilar.refetch()}
      />
    )
  if (baglantilar.isPending) return <LoadingState />

  const mukellefiSenkronizeEt = (b: EntegratorBaglantiView) =>
    senkron.mutate(
      { mukellefId: b.mukellefId },
      {
        onSuccess: (s) =>
          s.hatali.length
            ? toast.error(`${b.mukellefUnvan}: ${s.hatali[0]!.mesaj}`)
            : toast.success(
                `${b.mukellefUnvan} senkronize edildi: ${s.yeniFatura} yeni fatura`
              ),
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          aria-label="Bağlantı durumu"
          value={[durum ?? TUMU]}
          onValueChange={(v) =>
            v[0] &&
            setSearchParams(v[0] === TUMU ? {} : { durum: v[0] }, {
              replace: true,
            })
          }
        >
          <ToggleGroupItem value={TUMU}>Tümü</ToggleGroupItem>
          {DURUMLAR.map((d) => (
            <ToggleGroupItem key={d} value={d}>
              {BAGLANTI_DURUM_ETIKET[d]} ({sayilar[d]})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {yonetici ? (
          <Button variant="outline" onClick={() => setAktarim(true)}>
            Luca'dan mükellef aktar
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bağlantıları yalnızca yönetici kurabilir veya kaldırabilir.
          </p>
        )}
      </div>

      {gorunenler.length === 0 ? (
        <EmptyState icon={PlugSocketIcon} title="Bu durumda mükellef yok" />
      ) : (
        <div className="overflow-x-auto rounded-3xl border">
          <Table aria-label="Luca bağlantıları">
            <TableHeader>
              <TableRow>
                <TableHead>Mükellef</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="hidden md:table-cell">
                  Servisler
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Son senkron
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gorunenler.map((b) => (
                <TableRow key={b.mukellefId}>
                  <TableCell className="max-w-72 whitespace-normal sm:whitespace-nowrap">
                    <Link
                      to={`/mukellefler/${b.mukellefId}/e-belge`}
                      className="line-clamp-2 font-medium hover:underline sm:block sm:truncate"
                    >
                      {b.mukellefUnvan}
                    </Link>
                    {b.durum !== "BAGLI_DEGIL" && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {b.lucaFirmaId
                          ? "Luca firmasına eşli"
                          : "Luca firmasıyla eşlenmemiş"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <BaglantiDurumBadge durum={b.durum} />
                    {b.hataMesaji && (
                      <span className="mt-1 block text-xs text-destructive">
                        {b.hataMesaji}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Servisler b={b} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                    {b.sonSenkron ? formatDateTime(b.sonSenkron) : "—"}
                  </TableCell>
                  <TableCell>
                    {yonetici && b.durum === "BAGLI_DEGIL" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${b.mukellefUnvan} Luca'ya bağla`}
                        onClick={() => setDuzenlenen(b)}
                      >
                        <HugeiconsIcon
                          icon={Link04Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        Bağla
                      </Button>
                    ) : b.durum !== "BAGLI_DEGIL" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${b.mukellefUnvan} bağlantı işlemleri`}
                            />
                          }
                        >
                          <HugeiconsIcon
                            icon={MoreHorizontalIcon}
                            strokeWidth={2}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={b.durum !== "BAGLI" || senkron.isPending}
                            onClick={() => mukellefiSenkronizeEt(b)}
                          >
                            Şimdi senkronize et
                          </DropdownMenuItem>
                          {yonetici && (
                            <>
                              <DropdownMenuItem
                                onClick={() => setDuzenlenen(b)}
                              >
                                Anahtarı yenile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setKaldirilacak(b)}
                              >
                                Bağlantıyı kaldır
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LucaFirmaAktarimDialog
        open={aktarim}
        onClose={() => setAktarim(false)}
      />
      <BaglantiDialog
        baglanti={duzenlenen}
        onClose={() => setDuzenlenen(null)}
      />
      <ConfirmDialog
        open={kaldirilacak !== null}
        onOpenChange={(open) => !open && setKaldirilacak(null)}
        title="Luca bağlantısı kaldırılsın mı?"
        description={`${kaldirilacak?.mukellefUnvan ?? ""} için web servis anahtarı silinir ve senkron durur. Senkronize edilmiş faturalar korunur.`}
        confirmLabel="Kaldır"
        destructive
        pending={kaldir.isPending}
        onConfirm={() =>
          kaldirilacak &&
          kaldir.mutate(kaldirilacak.mukellefId, {
            onSuccess: () => {
              toast.success("Bağlantı kaldırıldı")
              setKaldirilacak(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </>
  )
}
