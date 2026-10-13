import { useState } from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Cancel01Icon,
  SidebarLeftIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  ArsivAgaci,
  type AgacSecim,
} from "@/features/arsiv/components/arsiv-agaci"
import {
  ArsivAraclari,
  DosyaAlani,
} from "@/features/arsiv/components/arsiv-gezgini"
import { useDosyaIslemleri } from "@/features/arsiv/components/dosya-islemleri"
import {
  EksikEvrakOzeti,
  EksikEvraklar,
} from "@/features/arsiv/components/eksik-evraklar"
import {
  YukleDialog,
  type YukleHedef,
} from "@/features/arsiv/components/yukle-dialog"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { kategorilerdenIstenen } from "@prime/shared/evrak-talebi/sabitler"
import {
  GECERLILIK_FILTRE_ETIKET,
  useArsivParams,
} from "@/features/arsiv/hooks/use-arsiv-params"
import { useArsivAgac } from "@/features/arsiv/queries"
import { ARSIV_KATEGORI_ETIKET } from "@prime/shared/types/domain"

export function ArsivPage() {
  const { params, update } = useArsivParams()
  const agac = useArsivAgac()
  const { islemler, dialoglar } = useDosyaIslemleri()
  const [yukleHedef, setYukleHedef] = useState<YukleHedef | null>(null)
  const [talepHedef, setTalepHedef] = useState<TalepHedef | null>(null)
  const [klasorlerAcik, setKlasorlerAcik] = useState(false)

  const secim: AgacSecim = {
    mukellef: params.mukellef,
    kategori: params.kategori,
    cop: params.cop,
  }
  const onSec = (s: AgacSecim) => {
    update({
      mukellef: s.mukellef ?? null,
      kategori: s.kategori ?? null,
      cop: s.cop || null,
      eksik: null,
    })
    setKlasorlerAcik(false)
  }
  const mukellef = params.cop
    ? undefined
    : agac.data?.mukellefler.find((m) => m.mukellefId === params.mukellef)
  const yukle = () =>
    setYukleHedef({
      mukellefId: mukellef?.mukellefId,
      kategori: params.kategori,
    })

  const agacBileseni = (
    <ArsivAgaci agac={agac.data} secim={secim} onSec={onSec} />
  )

  return (
    <>
      <PageHeader
        title="Dijital Arşiv"
        description="Mükellef evrakları, geçerlilik takibi ve eksik belgeler"
        actions={
          !params.cop && (
            <Button onClick={yukle}>
              <HugeiconsIcon
                icon={Upload04Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Yükle
            </Button>
          )
        }
      />

      {agac.isError ? (
        <ErrorState error={agac.error} onRetry={() => agac.refetch()} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="sticky top-4 hidden max-h-[calc(100svh-6rem)] overflow-y-auto rounded-2xl border bg-card p-3 lg:block">
            {agacBileseni}
          </aside>

          <section className="grid min-w-0 gap-4" aria-label="Dosyalar">
            <nav
              aria-label="Konum"
              className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm"
            >
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onSec({ cop: false })}
              >
                Arşiv
              </button>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
              {params.cop ? (
                <span className="font-medium">Çöp kutusu</span>
              ) : mukellef ? (
                <>
                  <button
                    type="button"
                    className={
                      params.kategori
                        ? "truncate text-muted-foreground hover:text-foreground"
                        : "truncate font-medium"
                    }
                    onClick={() =>
                      onSec({ mukellef: mukellef.mukellefId, cop: false })
                    }
                  >
                    {mukellef.unvan}
                  </button>
                  {params.kategori && (
                    <>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="size-3.5 text-muted-foreground"
                      />
                      <span className="font-medium">
                        {ARSIV_KATEGORI_ETIKET[params.kategori]}
                      </span>
                    </>
                  )}
                  <Link
                    to={`/mukellefler/${mukellef.mukellefId}/arsiv`}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Mükellef kartında aç
                  </Link>
                </>
              ) : (
                <span className="font-medium">Tüm dosyalar</span>
              )}
              {params.gecerlilik && !params.cop && (
                <Badge
                  variant="secondary"
                  render={
                    <button
                      type="button"
                      aria-label={`${GECERLILIK_FILTRE_ETIKET[params.gecerlilik]} filtresini kaldır`}
                      onClick={() => update({ gecerlilik: null })}
                    />
                  }
                  className="ml-1 gap-1 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                >
                  {GECERLILIK_FILTRE_ETIKET[params.gecerlilik]}
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </Badge>
              )}
            </nav>

            {params.eksik && !mukellef && !params.cop && agac.data && (
              <EksikEvrakOzeti
                mukellefler={agac.data.mukellefler}
                onAc={(id) => onSec({ mukellef: id, cop: false })}
                onEvrakIste={(mukellefId, kategoriler) =>
                  setTalepHedef({
                    mukellefId,
                    istenenler: kategorilerdenIstenen(kategoriler),
                  })
                }
              />
            )}

            {mukellef && !params.kategori && (
              <EksikEvraklar
                eksikler={mukellef.eksikZorunlu}
                onYukle={(kategori) =>
                  setYukleHedef({ mukellefId: mukellef.mukellefId, kategori })
                }
                onEvrakIste={(kategoriler) =>
                  setTalepHedef({
                    mukellefId: mukellef.mukellefId,
                    istenenler: kategorilerdenIstenen(kategoriler),
                  })
                }
              />
            )}

            <ArsivAraclari
              params={params}
              update={update}
              baslangic={
                <Button
                  variant="outline"
                  className="lg:hidden"
                  onClick={() => setKlasorlerAcik(true)}
                >
                  <HugeiconsIcon
                    icon={SidebarLeftIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Klasörler
                </Button>
              }
            />

            <DosyaAlani
              params={params}
              mukellefId={params.cop ? undefined : params.mukellef}
              islemler={islemler}
              gosterMukellef={!mukellef}
              onYukle={yukle}
              onSayfa={(sayfa) => update({ sayfa })}
              onDonemKaldir={() => update({ donem: null })}
            />
          </section>
        </div>
      )}

      <Sheet open={klasorlerAcik} onOpenChange={setKlasorlerAcik}>
        <SheetContent side="left" className="w-80 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Klasörler</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{agacBileseni}</div>
        </SheetContent>
      </Sheet>

      <YukleDialog hedef={yukleHedef} onClose={() => setYukleHedef(null)} />
      <TalepOlusturDialog
        hedef={talepHedef}
        onClose={() => setTalepHedef(null)}
      />
      {dialoglar}
    </>
  )
}
