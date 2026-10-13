import { useState } from "react"
import { useSearchParams } from "react-router"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"

import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErisimDurumuSheet } from "@/features/tebligat/components/erisim-durumu-sheet"
import { TebligatEkleDialog } from "@/features/tebligat/components/tebligat-ekle-dialog"
import { TebligatListesi } from "@/features/tebligat/components/tebligat-listesi"
import { useTebligatOzet } from "@/features/tebligat/queries"

export function TebligatPage() {
  const ozet = useTebligatOzet()
  const [ekle, setEkle] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const erisimAcik = searchParams.get("erisim") !== null
  const tarama = ozet.data?.sonTarama
  const erisim = ozet.data?.erisim
  const sorunlu = erisim ? erisim.hatali + erisim.tanimsiz : 0

  const erisimPaneli = (acik: boolean) =>
    setSearchParams(
      (onceki) => {
        const yeni = new URLSearchParams(onceki)
        if (acik) yeni.set("erisim", "")
        else yeni.delete("erisim")
        return yeni
      },
      { replace: true }
    )

  return (
    <>
      <PageHeader
        title="e-Tebligat"
        description={
          <>
            Mükelleflerin GİB e-Tebligat kutuları her gece taranır; tebligatlar
            sabah süreleriyle hazırdır
            {ozet.isSuccess &&
              (tarama ? (
                <>
                  {" · "}Son tarama{" "}
                  {formatDistanceToNow(new Date(tarama.bitis), {
                    addSuffix: true,
                    locale: tr,
                  })}
                  , {tarama.yeni} yeni
                </>
              ) : (
                " · İlk gece taraması bekleniyor"
              ))}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEkle(true)}>
              Elle ekle
            </Button>
            <Button variant="outline" onClick={() => erisimPaneli(true)}>
              GİB erişimleri
              {sorunlu > 0 && (
                <span className="ml-1 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums">
                  {sorunlu}
                </span>
              )}
            </Button>
          </div>
        }
      />

      {erisim && sorunlu > 0 && (
        <Alert variant={erisim.hatali > 0 ? "destructive" : "default"}>
          <AlertTitle>
            {[
              erisim.hatali > 0 &&
                `${erisim.hatali} mükellefin GİB girişi başarısız`,
              erisim.tanimsiz > 0 &&
                `${erisim.tanimsiz} mükellefin GİB erişimi tanımlı değil`,
            ]
              .filter(Boolean)
              .join(", ")}
          </AlertTitle>
          <AlertDescription>
            Bu mükelleflerin tebligatları gece taramasına girmez.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => erisimPaneli(true)}
            >
              Erişimleri düzenle
            </button>
          </AlertDescription>
        </Alert>
      )}

      {ozet.data && (ozet.data.acil > 0 || ozet.data.geciken > 0) && (
        <Alert variant="destructive">
          <AlertTitle>
            {ozet.data.geciken > 0
              ? `${ozet.data.geciken} tebligatın süresi geçti, ${ozet.data.acil} tebligatın süresi 3 gün içinde doluyor`
              : `${ozet.data.acil} tebligatın süresi 3 gün içinde doluyor`}
          </AlertTitle>
          <AlertDescription>
            <button
              type="button"
              className="underline"
              onClick={() =>
                setSearchParams({ kapsam: "acil" }, { replace: true })
              }
            >
              Acil tebligatları göster
            </button>
          </AlertDescription>
        </Alert>
      )}

      <TebligatListesi />

      <TebligatEkleDialog
        open={ekle}
        onClose={() => setEkle(false)}
        onEklendi={(t) =>
          setSearchParams({ tebligat: t.id }, { replace: true })
        }
      />
      <ErisimDurumuSheet
        open={erisimAcik}
        onClose={() => erisimPaneli(false)}
      />
    </>
  )
}
