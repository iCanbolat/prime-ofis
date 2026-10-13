import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  ArsivAraclari,
  DosyaAlani,
} from "@/features/arsiv/components/arsiv-gezgini"
import { useDosyaIslemleri } from "@/features/arsiv/components/dosya-islemleri"
import { EksikEvraklar } from "@/features/arsiv/components/eksik-evraklar"
import {
  YukleDialog,
  type YukleHedef,
} from "@/features/arsiv/components/yukle-dialog"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { kategorilerdenIstenen } from "@prime/shared/evrak-talebi/sabitler"
import { useArsivParams } from "@/features/arsiv/hooks/use-arsiv-params"
import { KATEGORI_SIRASI, eksikZorunlu } from "@prime/shared/arsiv/kurallar"
import { useArsivList } from "@/features/arsiv/queries"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { cn } from "@/lib/utils"
import { ARSIV_KATEGORI_ETIKET, type ArsivKategori } from "@prime/shared/types/domain"

function Cip({
  aktif,
  onClick,
  children,
  sayi,
}: {
  aktif: boolean
  onClick: () => void
  children: string
  sayi?: number
}) {
  return (
    <Button
      variant={aktif ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={aktif}
      onClick={onClick}
      className={cn("rounded-full", aktif && "ring-1 ring-border")}
    >
      {children}
      {sayi !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {sayi}
        </span>
      )}
    </Button>
  )
}

/** Mükellef kartı → Arşiv sekmesi */
export function MukellefArsivTab() {
  const { mukellef } = useMukellefKart()
  const { params, update } = useArsivParams()
  const { islemler, dialoglar } = useDosyaIslemleri()
  const [yukleHedef, setYukleHedef] = useState<YukleHedef | null>(null)
  const [talepHedef, setTalepHedef] = useState<TalepHedef | null>(null)

  // Kategori sayıları ve eksikler için mükellefin tüm (çöp hariç) dosyaları
  const tumu = useArsivList({ mukellefId: mukellef.id }).data?.items
  const sayilar = new Map<ArsivKategori, number>()
  for (const d of tumu ?? [])
    sayilar.set(d.kategori, (sayilar.get(d.kategori) ?? 0) + 1)
  const eksikler = tumu ? eksikZorunlu(mukellef, tumu) : []

  const sec = (kategori: ArsivKategori | null, cop = false) =>
    update({ kategori, cop: cop || null })

  return (
    <div className="grid gap-4">
      <EksikEvraklar
        eksikler={eksikler}
        onYukle={(kategori) =>
          setYukleHedef({ mukellefId: mukellef.id, kategori })
        }
        onEvrakIste={(kategoriler) =>
          setTalepHedef({
            mukellefId: mukellef.id,
            istenenler: kategorilerdenIstenen(kategoriler),
          })
        }
      />

      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Kategori filtresi"
      >
        <Cip
          aktif={!params.kategori && !params.cop}
          onClick={() => sec(null)}
          sayi={tumu?.length}
        >
          Tümü
        </Cip>
        {KATEGORI_SIRASI.filter((k) => sayilar.has(k)).map((k) => (
          <Cip
            key={k}
            aktif={params.kategori === k && !params.cop}
            onClick={() => sec(k)}
            sayi={sayilar.get(k)}
          >
            {ARSIV_KATEGORI_ETIKET[k]}
          </Cip>
        ))}
        <Cip aktif={params.cop} onClick={() => sec(null, true)}>
          Çöp kutusu
        </Cip>
      </div>

      <ArsivAraclari
        params={params}
        update={update}
        onYukle={() =>
          setYukleHedef({ mukellefId: mukellef.id, kategori: params.kategori })
        }
      />

      <DosyaAlani
        params={params}
        mukellefId={mukellef.id}
        islemler={islemler}
        gosterMukellef={false}
        onYukle={() =>
          setYukleHedef({ mukellefId: mukellef.id, kategori: params.kategori })
        }
        onSayfa={(sayfa) => update({ sayfa })}
        onDonemKaldir={() => update({ donem: null })}
      />

      <YukleDialog hedef={yukleHedef} onClose={() => setYukleHedef(null)} />
      <TalepOlusturDialog
        hedef={talepHedef}
        onClose={() => setTalepHedef(null)}
      />
      {dialoglar}
    </div>
  )
}
