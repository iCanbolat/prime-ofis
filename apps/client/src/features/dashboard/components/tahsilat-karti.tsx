import { Link } from "react-router"

import { ButtonLink } from "@/components/shared/button-link"
import { ErrorState } from "@/components/shared/query-states"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { TahsilatOzetResponse } from "@prime/shared/types/api"

/** Bu ay tahsil edilenin tahakkuka oranı */
function BuAyIlerleme({
  tahsilat,
  tahakkuk,
}: {
  tahsilat: number
  tahakkuk: number
}) {
  const oran = tahakkuk > 0 ? Math.min(1, tahsilat / tahakkuk) : 0
  return (
    <div className="grid gap-1.5">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Bu ay tahsil edilen</span>
        <span className="font-medium tabular-nums">
          {formatTRY(tahsilat)}
          {tahakkuk > 0 && (
            <span className="font-normal text-muted-foreground">
              {" "}
              / {formatTRY(tahakkuk)}
            </span>
          )}
        </span>
      </p>
      {tahakkuk > 0 && (
        <span
          role="meter"
          aria-label="Bu ay tahsilat oranı"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(oran * 100)}
          className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span className="bg-primary/70" style={{ width: `${oran * 100}%` }} />
        </span>
      )}
    </div>
  )
}

/** Büronun alacağı: toplam açık bakiye, geciken mükellef ve bu ayın tahsilat oranı */
export function TahsilatKarti({
  ozet,
  hata,
  onRetry,
}: {
  ozet: TahsilatOzetResponse | undefined
  hata?: unknown
  onRetry: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Tahsilat</CardTitle>
        <CardDescription>Mükelleflerden alınacak hizmet bedeli</CardDescription>
        <CardAction>
          <ButtonLink variant="ghost" size="sm" to="/tahsilat">
            Tahsilat
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {hata ? (
          <ErrorState error={hata} onRetry={onRetry} />
        ) : !ozet ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/tahsilat/cari?bakiyeli=true"
                className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2 hover:bg-muted"
              >
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {formatTRY(ozet.toplamAlacak)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Açık alacak
                </span>
              </Link>
              <Link
                to="/tahsilat/cari?geciken=true"
                className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2 hover:bg-muted"
              >
                <span
                  className={cn(
                    "font-heading text-lg font-semibold tabular-nums",
                    ozet.gecikenMukellef > 0 && "text-destructive"
                  )}
                >
                  {ozet.gecikenMukellef}
                </span>
                <span className="text-xs text-muted-foreground">
                  Geciken mükellef
                </span>
              </Link>
            </div>
            <BuAyIlerleme
              tahsilat={ozet.buAyTahsilat}
              tahakkuk={ozet.buAyTahakkuk}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
