import { useState } from "react"
import { addMonths, format, subMonths } from "date-fns"
import { tr } from "date-fns/locale"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/shared/page-header"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AyTakvimi } from "@/features/takvim/components/ay-takvimi"
import { OlayListesi } from "@/features/takvim/components/olay-listesi"
import { TakvimFiltreleri } from "@/features/takvim/components/takvim-filtreleri"
import {
  useTakvimParams,
  type TakvimAralik,
  type TakvimGorunum,
} from "@/features/takvim/hooks/use-takvim-params"
import { useTakvim } from "@/features/takvim/queries"
import { TATIL_HARITASI } from "@prime/shared/takvim/tatiller"
import { formatDonem } from "@prime/shared/lib/format"
import { fromYmd } from "@prime/shared/lib/tarih"
import type { TakvimOlayi } from "@prime/shared/types/api"

const ARALIK_ETIKET: Record<TakvimAralik, string> = {
  ay: "Ay",
  hafta: "Önümüzdeki 7 gün",
  geciken: "Gecikenler",
}

function Ozet({ olaylar }: { olaylar: TakvimOlayi[] }) {
  const geciken = olaylar.filter((o) => o.gecikti).length
  const onayli = olaylar.filter((o) => o.durum === "ONAYLANDI").length
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {olaylar.length} yükümlülük · {onayli} onaylandı
      {geciken > 0 && (
        <span className="font-medium text-destructive">
          {" "}
          · {geciken} gecikmiş
        </span>
      )}
    </p>
  )
}

export function TakvimPage() {
  const p = useTakvimParams()
  const takvim = useTakvim(p.sorgu)
  const [seciliGun, setSeciliGun] = useState<string | null>(null)

  const ayTarihi = fromYmd(`${p.ay}-01`)
  const ayaGit = (tarih: Date) => p.update({ ay: format(tarih, "yyyy-MM") })
  const ayGezinmesi = p.gorunum === "ay" || p.aralik === "ay"
  const olaylar = takvim.data ?? []
  const gunOlaylari = seciliGun
    ? olaylar.filter((o) => o.sonTarih === seciliGun)
    : []

  return (
    <>
      <PageHeader
        title="Vergi ve bildirim takvimi"
        description="Aktif mükelleflerin beyan ve bildirim son günleri. Hafta sonu ve resmi tatiller otomatik kaydırılır."
        actions={
          <ToggleGroup
            variant="outline"
            spacing={0}
            aria-label="Görünüm"
            value={[p.gorunum]}
            onValueChange={(v) =>
              v[0] && p.update({ gorunum: v[0] as TakvimGorunum })
            }
          >
            <ToggleGroupItem value="ay">Ay</ToggleGroupItem>
            <ToggleGroupItem value="liste">Liste</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {ayGezinmesi ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Önceki ay"
              onClick={() => ayaGit(subMonths(ayTarihi, 1))}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <h2
              className="min-w-36 text-center font-heading text-lg font-medium"
              aria-live="polite"
            >
              {formatDonem(p.ay)}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sonraki ay"
              onClick={() => ayaGit(addMonths(ayTarihi, 1))}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            {p.ay !== p.bugun.slice(0, 7) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => p.update({ ay: undefined })}
              >
                Bugün
              </Button>
            )}
          </div>
        ) : (
          <h2 className="font-heading text-lg font-medium">
            {ARALIK_ETIKET[p.aralik]}
          </h2>
        )}

        {p.gorunum === "liste" && (
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Zaman aralığı"
            value={[p.aralik]}
            onValueChange={(v) =>
              v[0] && p.update({ aralik: v[0] as TakvimAralik })
            }
          >
            {(Object.keys(ARALIK_ETIKET) as TakvimAralik[]).map((a) => (
              <ToggleGroupItem key={a} value={a}>
                {ARALIK_ETIKET[a]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <TakvimFiltreleri />

      {takvim.isError ? (
        <ErrorState error={takvim.error} onRetry={() => takvim.refetch()} />
      ) : takvim.isPending ? (
        <LoadingState />
      ) : (
        <>
          <Ozet
            olaylar={
              p.gorunum === "ay"
                ? olaylar.filter((o) => o.sonTarih.startsWith(p.ay))
                : olaylar
            }
          />
          {p.gorunum === "ay" ? (
            <AyTakvimi
              ay={p.ay}
              bugun={p.bugun}
              olaylar={olaylar}
              onGunSec={setSeciliGun}
            />
          ) : (
            <OlayListesi
              olaylar={olaylar}
              bosMesaj={
                p.aralik === "geciken" ? "Gecikmiş yükümlülük yok" : undefined
              }
            />
          )}
        </>
      )}

      <Sheet
        open={seciliGun !== null}
        onOpenChange={(open) => !open && setSeciliGun(null)}
      >
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          {seciliGun && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {format(fromYmd(seciliGun), "d MMMM yyyy, EEEE", {
                    locale: tr,
                  })}
                </SheetTitle>
                <SheetDescription>
                  {TATIL_HARITASI.get(seciliGun) ??
                    `${gunOlaylari.length} yükümlülük`}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <OlayListesi olaylar={gunOlaylari} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
