import { useMemo } from "react"
import { addMonths, subMonths } from "date-fns"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import {
  YukumlulukBadge,
  OlayListesi,
} from "@/features/takvim/components/olay-listesi"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { uygulananTipler } from "@prime/shared/takvim/motor"
import { useTakvim } from "@/features/takvim/queries"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"

/** Mükellefin son 3 ay ve önümüzdeki 3 aylık yükümlülükleri */
export function MukellefTakvimTab() {
  const { mukellef } = useMukellefKart()
  const bugunYmd = bugun()
  const aralik = useMemo(
    () => ({
      baslangic: toYmd(subMonths(fromYmd(bugunYmd), 3)),
      bitis: toYmd(addMonths(fromYmd(bugunYmd), 3)),
    }),
    [bugunYmd]
  )
  const takvim = useTakvim({ ...aralik, mukellefId: mukellef.id })
  const tipler = uygulananTipler(mukellef)

  const yaklasan = (takvim.data ?? []).filter((o) => o.sonTarih >= bugunYmd)
  const gecmis = (takvim.data ?? []).filter((o) => o.sonTarih < bugunYmd)

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Tabi olduğu yükümlülükler</CardTitle>
          <CardDescription>
            Mükellef türü, defter türü, KDV ve SGK bilgilerine göre otomatik
            belirlenir.
            {!mukellef.aktif && " Pasif mükellefler için takvim üretilmez."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tipler.map((tip) => (
            <span key={tip} className="flex items-center gap-1.5 text-sm">
              <YukumlulukBadge tip={tip} />
              <span className="text-muted-foreground">
                {YUKUMLULUK_TANIMLARI[tip].ad}
              </span>
            </span>
          ))}
        </CardContent>
      </Card>

      {takvim.isError ? (
        <ErrorState error={takvim.error} onRetry={() => takvim.refetch()} />
      ) : takvim.isPending ? (
        <LoadingState />
      ) : (
        <div className="@container grid gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Yaklaşan (3 ay)</CardTitle>
            </CardHeader>
            <CardContent>
              <OlayListesi
                olaylar={yaklasan}
                gosterMukellef={false}
                bosMesaj="Yaklaşan yükümlülük yok"
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Geçmiş (3 ay)</CardTitle>
            </CardHeader>
            <CardContent>
              <OlayListesi
                olaylar={gecmis}
                gosterMukellef={false}
                tersSira
                bosMesaj="Geçmiş yükümlülük yok"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
