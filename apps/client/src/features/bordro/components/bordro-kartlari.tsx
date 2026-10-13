import { Button } from "@/components/ui/button"
import {
  BordroDurumBadge,
  BordroUyariBadge,
} from "@/features/bordro/components/bordro-rozetleri"
import { kalanMetin } from "@/features/bordro/gorunum"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import type { BordroSatiri } from "@prime/shared/types/api"

/** Bordro takibi ızgara görünümü: mükellef × dönem kartları (tablet ve altında zorunlu) */
export function BordroKartlari({
  satirlar,
  onSec,
  onPuantajIste,
}: {
  satirlar: BordroSatiri[]
  onSec: (satir: BordroSatiri) => void
  onPuantajIste?: (satir: BordroSatiri) => void
}) {
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Bordro takibi"
    >
      {satirlar.map((s) => {
        const puantajIste =
          onPuantajIste && s.durum === "BEKLENIYOR" && !s.girdiTalepId
        return (
          <li
            key={`${s.mukellefId}:${s.donem}`}
            aria-label={`${s.mukellefUnvan} ${formatDonem(s.donem)} bordro`}
            className="relative flex flex-col gap-3 rounded-3xl border bg-card p-4"
          >
            <button
              type="button"
              onClick={() => onSec(s)}
              className="grid min-w-0 gap-0.5 text-left leading-snug outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
            >
              <span className="line-clamp-2 font-medium">
                {s.mukellefUnvan}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDonem(s.donem)}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-1">
              <BordroDurumBadge durum={s.durum} />
              <BordroUyariBadge uyari={s.uyari} />
            </div>

            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Çalışan</dt>
                <dd className="font-medium tabular-nums">
                  {s.ozet?.calisanSayisi ?? s.calisanSayisi}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">MUHSGK</dt>
                <dd className="font-medium tabular-nums">
                  {formatDate(s.sonTarih)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Brüt</dt>
                <dd className="truncate font-medium tabular-nums">
                  {s.ozet ? formatTRY(s.ozet.brutToplam) : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {kalanMetin(s)}
                {s.degisiklikYok && " · Değişiklik yok"}
              </span>
              {puantajIste && (
                <Button
                  variant="outline"
                  size="xs"
                  // Kartın tıklanabilir alanının üstünde kalsın
                  className="relative z-10"
                  onClick={() => onPuantajIste(s)}
                >
                  Puantaj iste
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
