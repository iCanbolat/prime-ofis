import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Coins01Icon } from "@hugeicons/core-free-icons"

import { MonthPicker } from "@/components/shared/date-picker"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { KontorAlimDialog } from "@/features/e-belge/components/kontor-alim-dialog"
import { ORTALAMA_AY } from "@prime/shared/e-belge/kontor"
import { useKontor } from "@/features/e-belge/queries"
import {
  formatDate,
  formatDateTime,
  formatDonem,
  formatTRY,
} from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"

const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const sayi = (n: number) => n.toLocaleString("tr-TR")

function Gosterge({
  etiket,
  deger,
  alt,
  vurgu,
}: {
  etiket: string
  deger: string
  alt?: string
  vurgu?: boolean
}) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-muted/40 px-4 py-3">
      <span className="text-xs text-muted-foreground">{etiket}</span>
      <span
        className={cn(
          "font-heading text-2xl font-semibold tabular-nums",
          vurgu && "text-destructive"
        )}
      >
        {deger}
      </span>
      {alt && <span className="text-xs text-muted-foreground">{alt}</span>}
    </div>
  )
}

export function KontorPage() {
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])
  const [searchParams, setSearchParams] = useSearchParams()
  const donemParam = searchParams.get("donem")
  const donem = donemParam && DONEM_RE.test(donemParam) ? donemParam : undefined
  const kontor = useKontor({ donem })
  const [alimAcik, setAlimAcik] = useState(false)

  if (kontor.isPending) return <LoadingState />
  if (kontor.isError)
    return <ErrorState error={kontor.error} onRetry={() => kontor.refetch()} />
  const k = kontor.data
  const donemToplam = k.mukellefler.reduce((t, m) => t + m.toplam, 0)
  const donemTutar = k.mukellefler.reduce((t, m) => t + m.tutar, 0)

  return (
    <>
      <section
        aria-label="Kontör bakiyesi"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Gosterge
          etiket="Kalan kontör"
          deger={sayi(k.kalan)}
          vurgu={k.dusukBakiye}
          alt={
            k.lucaBakiye !== undefined && k.lucaBakiyeTarihi
              ? `Luca'da ${sayi(k.lucaBakiye)} · ${formatDateTime(k.lucaBakiyeTarihi)}`
              : k.tahminiAy === null
                ? `${sayi(k.toplamAlinan)} alındı`
                : `≈ ${k.tahminiAy.toLocaleString("tr-TR")} ay yeter`
          }
        />
        <Gosterge
          etiket={`${formatDonem(k.donem)} tüketimi`}
          deger={sayi(donemToplam)}
          alt={`${k.mukellefler.length} mükellef`}
        />
        <Gosterge
          etiket="Aylık ortalama"
          deger={sayi(k.aylikOrtalama)}
          alt={`Son ${ORTALAMA_AY} tam ay`}
        />
        <Gosterge
          etiket="Birim maliyet"
          deger={formatTRY(k.birimMaliyet)}
          alt="KDV ve hediye dahil"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Mükellef bazında tüketim</CardTitle>
          <CardDescription>
            Gelen ve giden her e-belge 1 kontör. Yansıtılacak tutar, dönem
            tüketimi × birim maliyettir.
          </CardDescription>
          <CardAction>
            <MonthPicker
              aria-label="Dönem"
              size="sm"
              value={k.donem}
              onChange={(v) =>
                setSearchParams(v ? { donem: v } : {}, { replace: true })
              }
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {k.mukellefler.length === 0 ? (
            <EmptyState
              icon={Coins01Icon}
              title="Bu dönemde kontör harcanmadı"
              description="Senkronize edilen e-belgeler dönemine göre burada listelenir."
            />
          ) : (
            <div className="overflow-x-auto rounded-3xl border">
              <Table aria-label="Mükellef bazında kontör tüketimi">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mükellef</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Gelen
                    </TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Giden
                    </TableHead>
                    <TableHead className="text-right">Kontör</TableHead>
                    <TableHead className="text-right">Yansıtılacak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {k.mukellefler.map((m) => (
                    <TableRow key={m.mukellefId}>
                      <TableCell className="max-w-72 whitespace-normal sm:whitespace-nowrap">
                        <Link
                          to={`/mukellefler/${m.mukellefId}/e-belge`}
                          className="line-clamp-2 font-medium hover:underline sm:block sm:truncate"
                        >
                          {m.mukellefUnvan}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {sayi(m.gelen)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {sayi(m.giden)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {sayi(m.toplam)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTRY(m.tutar)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Toplam</TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="text-right tabular-nums">
                      {sayi(donemToplam)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTRY(donemTutar)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son 6 ay</CardTitle>
          <CardDescription>Büro genelinde harcanan kontör</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {k.aylik.map((a) => (
              <li key={a.donem}>
                <button
                  type="button"
                  aria-pressed={a.donem === k.donem}
                  onClick={() =>
                    setSearchParams({ donem: a.donem }, { replace: true })
                  }
                  className={cn(
                    "grid w-full gap-0.5 rounded-2xl bg-muted/40 px-3 py-2 text-left hover:bg-muted",
                    a.donem === k.donem && "ring-2 ring-ring"
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {formatDonem(a.donem)}
                  </span>
                  <span className="font-heading text-lg font-semibold tabular-nums">
                    {sayi(a.tuketim)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontör alımları</CardTitle>
          <CardDescription>
            Toplam {sayi(k.toplamAlinan)} kontör alındı, {sayi(k.toplamTuketim)}{" "}
            kontör harcandı.
          </CardDescription>
          {yonetici && (
            <CardAction>
              <Button size="sm" onClick={() => setAlimAcik(true)}>
                Kontör alımı ekle
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {k.alimlar.length === 0 ? (
            <EmptyState
              icon={Coins01Icon}
              title="Henüz kontör alımı kaydedilmedi"
              description={
                yonetici
                  ? "Luca'dan aldığınız paketi ekleyince bakiye hesaplanır."
                  : "Alımları yönetici kaydeder."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-3xl border">
              <Table aria-label="Kontör alımları">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">Kontör</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Birim
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Ekleyen
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {k.alimlar.map((a) => {
                    const adet = a.paketAdet + a.hediyeAdet
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-64 whitespace-normal">
                          <span className="tabular-nums">
                            {formatDate(a.tarih)}
                          </span>
                          {a.not && (
                            <span className="block text-xs text-muted-foreground">
                              {a.not}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {sayi(adet)}
                          {a.hediyeAdet > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              {sayi(a.paketAdet)} + {sayi(a.hediyeAdet)} hediye
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTRY(a.tutar)}
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                          {formatTRY(adet > 0 ? a.tutar / adet : 0)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {a.ekleyenAd}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <KontorAlimDialog open={alimAcik} onClose={() => setAlimAcik(false)} />
    </>
  )
}
