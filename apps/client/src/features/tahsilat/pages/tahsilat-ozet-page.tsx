import { Link } from "react-router"
import { MoneyReceive02Icon } from "@hugeicons/core-free-icons"

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { ButtonLink } from "@/components/shared/button-link"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CariDurumBadge } from "@/features/tahsilat/components/tahsilat-rozetleri"
import { YAS_DILIMLERI, type AylikTahsilat } from "@prime/shared/tahsilat/kurallar"
import { useTahsilatOzet } from "@/features/tahsilat/queries"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { TahsilatOzetResponse } from "@prime/shared/types/api"

function Gosterge({
  etiket,
  deger,
  alt,
  to,
  vurgu,
}: {
  etiket: string
  deger: string
  alt?: string
  to?: string
  vurgu?: boolean
}) {
  const icerik = (
    <>
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
    </>
  )
  const sinif = "grid gap-0.5 rounded-2xl bg-muted/40 px-4 py-3"
  return to ? (
    <Link to={to} className={cn(sinif, "hover:bg-muted")}>
      {icerik}
    </Link>
  ) : (
    <div className={sinif}>{icerik}</div>
  )
}

const kisaTL = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn`
    : n >= 1_000
      ? `${Math.round(n / 1_000).toLocaleString("tr-TR")} B`
      : Math.round(n).toLocaleString("tr-TR")

/** Aylık tahakkuk ve tahsilat: ay başına yan yana iki çubuk, tek eksen */
function AylikGrafik({ seri }: { seri: AylikTahsilat[] }) {
  const enBuyuk = Math.max(1, ...seri.flatMap((s) => [s.tahakkuk, s.tahsilat]))
  return (
    <figure className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/35" />
          Tahakkuk (borçlandırılan)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" />
          Tahsilat
        </span>
      </div>
      <div
        className="grid h-44 grid-cols-12 items-end gap-1 border-b border-border/60 sm:gap-2"
        aria-hidden="true"
      >
        {seri.map((s) => (
          <div
            key={s.donem}
            className="group relative flex h-full items-end justify-center gap-0.5"
            title={`${formatDonem(s.donem)} — tahakkuk ${formatTRY(s.tahakkuk)}, tahsilat ${formatTRY(s.tahsilat)}`}
          >
            <span
              className="w-1/2 max-w-4 rounded-t-[4px] bg-muted-foreground/35 transition-opacity group-hover:opacity-80"
              style={{ height: `${(s.tahakkuk / enBuyuk) * 100}%` }}
            />
            <span
              className="w-1/2 max-w-4 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: `${(s.tahsilat / enBuyuk) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted-foreground sm:gap-2 sm:text-xs">
        {seri.map((s) => (
          <span key={s.donem} className="truncate">
            {formatDonem(s.donem).slice(0, 3)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Son 12 ayın tahakkuk ve tahsilat tutarları
      </figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Ay</th>
            <th>Tahakkuk</th>
            <th>Tahsilat</th>
          </tr>
        </thead>
        <tbody>
          {seri.map((s) => (
            <tr key={s.donem}>
              <td>{formatDonem(s.donem)}</td>
              <td>{formatTRY(s.tahakkuk)}</td>
              <td>{formatTRY(s.tahsilat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        En yüksek ay: {kisaTL(enBuyuk)} TL
      </p>
    </figure>
  )
}

const DILIM_ETIKET: Record<(typeof YAS_DILIMLERI)[number], string> = {
  "0-30": "0–30 gün",
  "31-60": "31–60 gün",
  "61-90": "61–90 gün",
  "90+": "90 günden eski",
}

function Yaslandirma({ ozet }: { ozet: TahsilatOzetResponse }) {
  const enBuyuk = Math.max(1, ...Object.values(ozet.yaslandirma))
  return (
    <ul className="grid gap-3" aria-label="Açık alacak yaşlandırması">
      {YAS_DILIMLERI.map((d) => {
        const tutar = ozet.yaslandirma[d]
        return (
          <li key={d} className="grid gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{DILIM_ETIKET[d]}</span>
              <span className="font-medium tabular-nums">
                {formatTRY(tutar)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  d === "0-30" ? "bg-primary/60" : "bg-destructive/70"
                )}
                style={{ width: `${(tutar / enBuyuk) * 100}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TahsilatOzetPage() {
  const ozet = useTahsilatOzet()
  if (ozet.isError)
    return <ErrorState error={ozet.error} onRetry={() => ozet.refetch()} />
  if (!ozet.data) return <LoadingState />
  const o = ozet.data
  const oran =
    o.buAyTahakkuk > 0
      ? Math.round((o.buAyTahsilat / o.buAyTahakkuk) * 100)
      : null

  return (
    <>
      <section
        aria-label="Tahsilat özeti"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Gosterge
          etiket="Toplam alacak"
          deger={formatTRY(o.toplamAlacak)}
          alt={`${o.borcluMukellef} mükellefte açık borç`}
          to="/tahsilat/cari?bakiyeli=true"
        />
        <Gosterge
          etiket="Bu ay tahsilat"
          deger={formatTRY(o.buAyTahsilat)}
          alt={
            oran === null
              ? "Bu ay tahakkuk yok"
              : `Tahakkukun %${oran}'i (${formatTRY(o.buAyTahakkuk)})`
          }
        />
        <Gosterge
          etiket="Geciken mükellef"
          deger={String(o.gecikenMukellef)}
          alt="30 günü geçmiş açık borç"
          to="/tahsilat/cari?geciken=true"
          vurgu={o.gecikenMukellef > 0}
        />
        <Gosterge
          etiket="Avans"
          deger={formatTRY(o.avans)}
          alt={`${o.ucretliMukellef} mükellefin aylık ücreti tanımlı`}
        />
      </section>

      <div className="@container">
        <div className="grid items-start gap-4 @4xl:grid-cols-3">
          <Card className="min-w-0 @4xl:col-span-2">
            <CardHeader>
              <CardTitle>Son 12 ay</CardTitle>
              <CardDescription>
                Borçlandırılan hizmet bedeli ve tahsil edilen tutar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AylikGrafik seri={o.aylik} />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Yaşlandırma</CardTitle>
              <CardDescription>
                Açık borçların tahakkuktan bu yana geçen süreye göre dağılımı
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Yaslandirma ozet={o} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>En uzun süredir bekleyenler</CardTitle>
          <CardDescription>Vadesi en çok geçmiş 5 mükellef</CardDescription>
          <CardAction>
            <ButtonLink
              variant="ghost"
              size="sm"
              to="/tahsilat/cari?geciken=true"
            >
              Tümü
            </ButtonLink>
          </CardAction>
        </CardHeader>
        <CardContent>
          {o.enGecikenler.length === 0 ? (
            <EmptyState
              icon={MoneyReceive02Icon}
              title="Geciken ödeme yok"
              description="Tüm açık borçlar 30 günden yeni."
            />
          ) : (
            <ul className="divide-y">
              {o.enGecikenler.map((s) => (
                <li key={s.mukellefId}>
                  <Link
                    to={`/tahsilat/cari?geciken=true&mukellef=${s.mukellefId}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:[&_.ad]:underline"
                  >
                    <span className="ad min-w-0 truncate text-sm font-medium">
                      {s.mukellefUnvan}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular-nums">
                        {formatTRY(s.acikBorc)}
                      </span>
                      <CariDurumBadge durum={s} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
