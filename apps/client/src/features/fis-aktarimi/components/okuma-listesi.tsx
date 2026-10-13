import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { OkumaDurumBadge } from "@/features/fis-aktarimi/components/fis-rozetleri"
import { useYenidenOku } from "@/features/fis-aktarimi/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { OkumaView } from "@prime/shared/types/api"

/** Okunmakta olan ve okunamayan belgeler (henüz fişi olmayanlar) */
export function OkumaListesi({
  okumalar,
  gosterMukellef = true,
}: {
  okumalar: OkumaView[]
  gosterMukellef?: boolean
}) {
  const yenidenOku = useYenidenOku()
  if (okumalar.length === 0) return null
  return (
    <ul
      aria-label="Okunan belgeler"
      className="divide-y rounded-3xl border px-4"
    >
      {okumalar.map((o) => (
        <li
          key={o.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
        >
          {o.durum === "OKUNUYOR" && <Spinner className="size-4" />}
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-sm font-medium">
              {o.gelenAd}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {o.tur === "FIS" ? "Fiş / fatura" : "Banka ekstresi"}
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {gosterMukellef && `${o.mukellefUnvan} · `}
              {o.durum === "HATA"
                ? o.hataMesaji
                : `Okuma başladı ${formatDateTime(o.olusturmaTarihi)}`}
            </span>
          </div>
          <OkumaDurumBadge durum={o.durum} />
          {o.durum === "HATA" && (
            <Button
              size="sm"
              variant="outline"
              disabled={yenidenOku.isPending}
              onClick={() =>
                yenidenOku.mutate(o.id, {
                  onSuccess: () => toast.success("Belge yeniden okunuyor"),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Yeniden oku
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
