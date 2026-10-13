import { useState, type ReactNode } from "react"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { MukellefeGonderDialog } from "@/features/kanal/components/mukellefe-gonder-dialog"
import { BorcDialog } from "@/features/tahsilat/components/borc-dialog"
import { CariEkstre } from "@/features/tahsilat/components/cari-ekstre"
import { OdemeDialog } from "@/features/tahsilat/components/odeme-dialog"
import { CariDurumBadge } from "@/features/tahsilat/components/tahsilat-rozetleri"
import { UcretDialog } from "@/features/tahsilat/components/ucret-dialog"
import { ucretHesapla } from "@prime/shared/tahsilat/kurallar"
import { useCariEkstre } from "@/features/tahsilat/queries"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { Mukellef } from "@prime/shared/types/domain"

function Gosterge({
  etiket,
  deger,
  alt,
  className,
}: {
  etiket: string
  deger: ReactNode
  alt?: ReactNode
  className?: string
}) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-muted/40 px-4 py-3">
      <span className="text-xs text-muted-foreground">{etiket}</span>
      <span
        className={cn(
          "font-heading text-xl font-semibold tabular-nums",
          className
        )}
      >
        {deger}
      </span>
      {alt && <span className="text-xs text-muted-foreground">{alt}</span>}
    </div>
  )
}

/**
 * Bir mükellefin cari hesabı: özet, aylık ücret, işlemler ve ekstre.
 * Mükellef kartının Tahsilat sekmesi ve cari listesindeki yan panel kullanır.
 */
export function CariPanel({ mukellef }: { mukellef: Mukellef }) {
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])
  const ekstre = useCariEkstre(mukellef.id)
  const [odeme, setOdeme] = useState(false)
  const [borc, setBorc] = useState(false)
  const [ucret, setUcret] = useState(false)
  const [hatirlat, setHatirlat] = useState(false)

  if (ekstre.isError)
    return <ErrorState error={ekstre.error} onRetry={() => ekstre.refetch()} />
  if (!ekstre.data) return <LoadingState />
  const e = ekstre.data
  const u = mukellef.ucret
  const net = u ? ucretHesapla(u.aylikBrut, u.kdvOrani, u.stopajVar).net : 0

  return (
    <div className="grid gap-4">
      <section
        aria-label="Cari özet"
        className="grid grid-cols-2 gap-3 @2xl:grid-cols-4"
      >
        <Gosterge
          etiket="Bakiye"
          deger={formatTRY(e.durum.bakiye)}
          alt={<CariDurumBadge durum={e.durum} />}
          className={cn(
            e.durum.geciken && "text-destructive",
            e.durum.bakiye < 0 && "text-sky-700 dark:text-sky-300"
          )}
        />
        <Gosterge
          etiket="Açık borç"
          deger={formatTRY(e.durum.acikBorc)}
          alt={
            e.durum.enEskiAcik
              ? `En eskisi ${formatDate(e.durum.enEskiAcik)}`
              : "Açık borç yok"
          }
        />
        <Gosterge
          etiket="Aylık ücret"
          deger={u ? formatTRY(u.aylikBrut) : "—"}
          alt={
            u
              ? `+ KDV %${u.kdvOrani}${u.stopajVar ? ", stopajlı" : ""} · net ${formatTRY(net)}`
              : "Tanımlı değil"
          }
        />
        <Gosterge
          etiket="Avans"
          deger={formatTRY(e.avans)}
          alt={
            u
              ? `${formatDonem(u.baslangicDonem)} ayından beri`
              : "Dağıtılmamış ödeme"
          }
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOdeme(true)}>
          Ödeme al
        </Button>
        <Button size="sm" variant="outline" onClick={() => setBorc(true)}>
          Ek hizmet borcu
        </Button>
        {yonetici && (
          <Button size="sm" variant="outline" onClick={() => setUcret(true)}>
            {u ? "Ücreti düzenle" : "Aylık ücret tanımla"}
          </Button>
        )}
        {e.durum.acikBorc > 0 && (
          <Button size="sm" variant="outline" onClick={() => setHatirlat(true)}>
            Borç hatırlat
          </Button>
        )}
      </div>

      <CariEkstre ekstre={e} />

      <OdemeDialog
        mukellefId={odeme ? mukellef.id : null}
        onClose={() => setOdeme(false)}
      />
      <BorcDialog
        mukellef={borc ? mukellef : null}
        onClose={() => setBorc(false)}
      />
      <UcretDialog
        mukellef={ucret ? mukellef : null}
        onClose={() => setUcret(false)}
      />
      <MukellefeGonderDialog
        acik={hatirlat}
        sablon="BORC_HATIRLATMA"
        hedefler={[{ mukellefId: mukellef.id }]}
        baslik="Borç hatırlatması"
        onClose={() => setHatirlat(false)}
      />
    </div>
  )
}
