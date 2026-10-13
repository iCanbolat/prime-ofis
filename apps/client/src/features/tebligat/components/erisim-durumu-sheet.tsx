import { useState } from "react"
import { Link } from "react-router"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ErisimDialog } from "@/features/tebligat/components/erisim-dialog"
import { useTebligatErisimleri } from "@/features/tebligat/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { TebligatErisimSatiri } from "@prime/shared/types/api"

function Bolum({
  baslik,
  aciklama,
  satirlar,
  onDuzenle,
}: {
  baslik: string
  aciklama: string
  satirlar: TebligatErisimSatiri[]
  onDuzenle: (s: TebligatErisimSatiri) => void
}) {
  if (satirlar.length === 0) return null
  return (
    <section className="grid gap-2" aria-label={baslik}>
      <div>
        <h3 className="text-sm font-medium">
          {baslik} ({satirlar.length})
        </h3>
        <p className="text-xs text-muted-foreground">{aciklama}</p>
      </div>
      <ul className="divide-y rounded-2xl border">
        {satirlar.map((s) => (
          <li
            key={s.mukellefId}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="grid min-w-0 text-sm">
              <Link
                to={`/mukellefler/${s.mukellefId}/tebligat`}
                className="truncate font-medium hover:underline"
              >
                {s.mukellefUnvan}
              </Link>
              <span className="text-xs text-muted-foreground">
                {s.erisim?.hataMesaji ?? `VKN/TCKN ${s.vkn}`}
              </span>
              {s.erisim?.sonTarama && (
                <span className="text-xs text-muted-foreground">
                  Son başarılı tarama {formatDateTime(s.erisim.sonTarama)}
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => onDuzenle(s)}>
              {s.erisim ? "Şifreyi güncelle" : "Tanımla"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Gece taramasına giremeyen mükellefler: girişi başarısız olanlar ve erişimi tanımsız olanlar */
export function ErisimDurumuSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const erisimler = useTebligatErisimleri({}, open)
  const [duzenlenen, setDuzenlenen] = useState<TebligatErisimSatiri | null>(
    null
  )
  const satirlar = erisimler.data ?? []
  const hatali = satirlar.filter((s) => s.durum === "HATA")
  const tanimsiz = satirlar.filter((s) => s.durum === "TANIMSIZ")
  const aktif = satirlar.length - hatali.length - tanimsiz.length

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>GİB erişim durumu</SheetTitle>
          <SheetDescription>
            Her gece {aktif} mükellefin e-Tebligat kutusu taranıyor. Aşağıdaki
            mükelleflerin tebligatları otomatik gelmez.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 overflow-y-auto px-4 pb-6">
          {erisimler.isError ? (
            <ErrorState
              error={erisimler.error}
              onRetry={() => erisimler.refetch()}
            />
          ) : !erisimler.data ? (
            <LoadingState />
          ) : hatali.length + tanimsiz.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tüm aktif mükelleflerin erişimi çalışıyor.
            </p>
          ) : (
            <>
              <Bolum
                baslik="Giriş başarısız"
                aciklama="Şifre değişmiş ya da süresi dolmuş olabilir; güncel şifreyi girin."
                satirlar={hatali}
                onDuzenle={setDuzenlenen}
              />
              <Bolum
                baslik="Tanımlı değil"
                aciklama="İVD kullanıcı kodu ve şifresi girilince bu geceden itibaren taranır."
                satirlar={tanimsiz}
                onDuzenle={setDuzenlenen}
              />
            </>
          )}
        </div>
      </SheetContent>
      <ErisimDialog satir={duzenlenen} onClose={() => setDuzenlenen(null)} />
    </Sheet>
  )
}
