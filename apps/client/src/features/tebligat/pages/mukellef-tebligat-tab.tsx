import { useState } from "react"
import { useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { ErisimKarti } from "@/features/tebligat/components/erisim-karti"
import { TebligatEkleDialog } from "@/features/tebligat/components/tebligat-ekle-dialog"
import { TebligatListesi } from "@/features/tebligat/components/tebligat-listesi"

export function MukellefTebligatTab() {
  const { mukellef } = useMukellefKart()
  const [ekle, setEkle] = useState(false)
  const [, setSearchParams] = useSearchParams()
  return (
    <>
      {mukellef.aktif && <ErisimKarti mukellefId={mukellef.id} />}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setEkle(true)}>
          e-Tebligat ekle
        </Button>
      </div>
      <TebligatListesi mukellefId={mukellef.id} />
      <TebligatEkleDialog
        open={ekle}
        mukellefId={mukellef.id}
        onClose={() => setEkle(false)}
        onEklendi={(t) =>
          setSearchParams({ tebligat: t.id }, { replace: true })
        }
      />
    </>
  )
}
