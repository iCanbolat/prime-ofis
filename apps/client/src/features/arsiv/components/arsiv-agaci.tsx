import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  Delete02Icon,
  Folder01Icon,
  FolderLibraryIcon,
  FolderOpenIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { turkceIcerir } from "@/features/arsiv/metin"
import { KATEGORI_SIRASI } from "@prime/shared/arsiv/kurallar"
import { cn } from "@/lib/utils"
import { ARSIV_KATEGORI_ETIKET, type ArsivKategori } from "@prime/shared/types/domain"
import type { ArsivAgacResponse } from "@prime/shared/types/api"

export interface AgacSecim {
  mukellef?: string
  kategori?: ArsivKategori
  cop: boolean
}

interface ArsivAgaciProps {
  agac: ArsivAgacResponse | undefined
  secim: AgacSecim
  onSec: (secim: AgacSecim) => void
}

function Satir({
  aktif,
  onClick,
  icon,
  etiket,
  sayi,
  uyari,
  girinti,
  soluk,
}: {
  aktif: boolean
  onClick: () => void
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  etiket: string
  sayi?: number
  uyari?: string
  girinti?: boolean
  soluk?: boolean
}) {
  return (
    <button
      type="button"
      aria-current={aktif ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
        girinti && "pl-8",
        aktif && "bg-muted font-medium",
        soluk && "text-muted-foreground"
      )}
    >
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className={cn("size-4 shrink-0", !aktif && "text-muted-foreground")}
      />
      <span className="min-w-0 flex-1 truncate">{etiket}</span>
      {uyari && (
        <HugeiconsIcon
          icon={Alert02Icon}
          strokeWidth={2}
          aria-label={uyari}
          className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        />
      )}
      {sayi !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {sayi}
        </span>
      )}
    </button>
  )
}

/** Sol panel: Tüm dosyalar → Mükellef → Kategori ağacı + çöp kutusu. */
export function ArsivAgaci({ agac, secim, onSec }: ArsivAgaciProps) {
  const [arama, setArama] = useState("")

  if (!agac) {
    return (
      <div className="grid gap-2" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    )
  }

  const toplam = agac.mukellefler.reduce((t, m) => t + m.toplam, 0)
  const mukellefler = agac.mukellefler.filter(
    (m) => !arama || turkceIcerir(m.unvan, arama)
  )

  return (
    <nav aria-label="Arşiv klasörleri" className="flex min-w-0 flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Mükellef ara"
          aria-label="Klasörlerde mükellef ara"
        />
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
      </InputGroup>

      <div className="flex flex-col gap-0.5">
        <Satir
          aktif={!secim.mukellef && !secim.cop}
          onClick={() => onSec({ cop: false })}
          icon={FolderLibraryIcon}
          etiket="Tüm dosyalar"
          sayi={toplam}
        />
      </div>

      <ul className="flex flex-col gap-0.5" aria-label="Mükellefler">
        {mukellefler.map((m) => {
          const acik = secim.mukellef === m.mukellefId && !secim.cop
          const kategoriler = KATEGORI_SIRASI.filter(
            (k) => (m.kategoriler[k] ?? 0) > 0 || m.eksikZorunlu.includes(k)
          )
          return (
            <li key={m.mukellefId}>
              <Satir
                aktif={acik && !secim.kategori}
                onClick={() => onSec({ mukellef: m.mukellefId, cop: false })}
                icon={acik ? FolderOpenIcon : Folder01Icon}
                etiket={m.unvan}
                sayi={m.toplam}
                uyari={
                  m.eksikZorunlu.length
                    ? `${m.eksikZorunlu.length} zorunlu evrak eksik`
                    : undefined
                }
              />
              {acik && (
                <ul
                  className="mt-0.5 flex flex-col gap-0.5"
                  aria-label={`${m.unvan} kategorileri`}
                >
                  {kategoriler.map((k) => {
                    const eksik = m.eksikZorunlu.includes(k)
                    return (
                      <li key={k}>
                        <Satir
                          girinti
                          aktif={secim.kategori === k}
                          onClick={() =>
                            onSec({
                              mukellef: m.mukellefId,
                              kategori: k,
                              cop: false,
                            })
                          }
                          icon={Folder01Icon}
                          etiket={ARSIV_KATEGORI_ETIKET[k]}
                          sayi={m.kategoriler[k] ?? 0}
                          uyari={eksik ? "Zorunlu evrak eksik" : undefined}
                          soluk={eksik}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
        {mukellefler.length === 0 && (
          <li className="px-2.5 py-1.5 text-sm text-muted-foreground">
            Eşleşen mükellef yok
          </li>
        )}
      </ul>

      <div className="flex flex-col gap-0.5 border-t pt-3">
        <Satir
          aktif={secim.cop}
          onClick={() => onSec({ cop: true })}
          icon={Delete02Icon}
          etiket="Çöp kutusu"
          sayi={agac.copSayisi}
        />
      </div>
    </nav>
  )
}
