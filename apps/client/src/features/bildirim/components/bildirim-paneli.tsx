import { useState } from "react"
import { useNavigate } from "react-router"
import { formatDistanceToNowStrict, isToday, isYesterday } from "date-fns"
import { tr } from "date-fns/locale"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Notification01Icon,
  TickDouble02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BILDIRIM_GORUNUM, turKategorisi } from "@/features/bildirim/gorunum"
import { useBildirimler, useOkunduIsaretle } from "@/features/bildirim/queries"
import { cn } from "@/lib/utils"
import type { BildirimView } from "@prime/shared/types/api"

type Sekme = "tumu" | "okunmamis"

const PANEL_LIMIT = 50

function gunGrubu(zaman: string) {
  const d = new Date(zaman)
  if (isToday(d)) return "Bugün"
  if (isYesterday(d)) return "Dün"
  return "Daha önce"
}

function gruplandir(items: BildirimView[]) {
  const gruplar: { baslik: string; items: BildirimView[] }[] = []
  for (const b of items) {
    const baslik = gunGrubu(b.zaman)
    const son = gruplar.at(-1)
    if (son?.baslik === baslik) son.items.push(b)
    else gruplar.push({ baslik, items: [b] })
  }
  return gruplar
}

function BildirimSatiri({
  bildirim,
  onSec,
}: {
  bildirim: BildirimView
  onSec: (b: BildirimView) => void
}) {
  const kategori = BILDIRIM_GORUNUM[turKategorisi(bildirim.tur)]
  return (
    <li>
      <button
        type="button"
        onClick={() => onSec(bildirim)}
        className={cn(
          "flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30",
          !bildirim.okundu && "bg-primary/5"
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            kategori.className
          )}
          aria-hidden="true"
        >
          <HugeiconsIcon
            icon={kategori.icon}
            strokeWidth={2}
            className="size-4"
          />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span
            className={cn(
              "text-sm leading-snug",
              bildirim.okundu ? "text-foreground/80" : "font-medium"
            )}
          >
            {bildirim.baslik}
          </span>
          {bildirim.aciklama && (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {bildirim.aciklama}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {kategori.etiket}
            {bildirim.aktor &&
              ` · ${bildirim.aktor.ad} ${bildirim.aktor.soyad}`}
            {" · "}
            <time dateTime={bildirim.zaman}>
              {formatDistanceToNowStrict(new Date(bildirim.zaman), {
                addSuffix: true,
                locale: tr,
              })}
            </time>
          </span>
        </span>
        {!bildirim.okundu && (
          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">Okunmamış</span>
          </span>
        )}
      </button>
    </li>
  )
}

export function BildirimPaneli({ onKapat }: { onKapat: () => void }) {
  const navigate = useNavigate()
  const [sekme, setSekme] = useState<Sekme>("tumu")
  const liste = useBildirimler({
    sadeceOkunmamis: sekme === "okunmamis" || undefined,
    limit: PANEL_LIMIT,
  })
  const okundu = useOkunduIsaretle()
  const okunmamis = liste.data?.okunmamis ?? 0

  const sec = (b: BildirimView) => {
    if (!b.okundu) okundu.mutate(b.id)
    if (b.link) {
      onKapat()
      navigate(b.link)
    }
  }

  return (
    <div className="grid" aria-label="Bildirimler" role="region">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="font-heading text-base font-semibold">Bildirimler</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={okunmamis === 0}
          onClick={() => okundu.mutate(undefined)}
        >
          <HugeiconsIcon
            icon={TickDouble02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Tümünü okundu işaretle
        </Button>
      </div>

      <Tabs
        value={sekme}
        onValueChange={(v) => setSekme(v as Sekme)}
        className="px-4 pt-2 pb-2"
      >
        <TabsList>
          <TabsTrigger value="tumu">Tümü</TabsTrigger>
          <TabsTrigger value="okunmamis">
            Okunmamış
            {okunmamis > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {okunmamis}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="max-h-[min(28rem,60svh)] overflow-y-auto overscroll-contain border-t">
        {liste.isPending ? (
          <div className="grid gap-2 p-3" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : liste.isError ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Bildirimler yüklenemedi.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => liste.refetch()}
            >
              Tekrar dene
            </button>
          </p>
        ) : liste.data.items.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} />
            </span>
            <p className="text-sm font-medium">
              {sekme === "okunmamis"
                ? "Okunmamış bildirim yok"
                : "Henüz bildirim yok"}
            </p>
            <p className="text-xs text-muted-foreground">
              Size atanan işler ve hatırlatmalar burada görünür.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 p-2">
            {gruplandir(liste.data.items).map((grup) => (
              <section key={grup.baslik} aria-label={grup.baslik}>
                <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  {grup.baslik}
                </h3>
                <ul className="grid gap-0.5" role="list">
                  {grup.items.map((b) => (
                    <BildirimSatiri key={b.id} bildirim={b} onSec={sec} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
