import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, Invoice01Icon } from "@hugeicons/core-free-icons"

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FisDuzenleyici } from "@/features/fis-aktarimi/components/fis-duzenleyici"
import { FisTablosu } from "@/features/fis-aktarimi/components/fis-tablosu"
import { useFisParams } from "@/features/fis-aktarimi/hooks/use-fis-params"
import { useLucaIndir } from "@/features/fis-aktarimi/hooks/use-luca-indir"
import { aktarimPaketleri } from "@prime/shared/fis-aktarimi/kurallar"
import { useFisler, useLucaAktar } from "@/features/fis-aktarimi/queries"
import { MAKS_FIS_DOSYA } from "@prime/shared/fis-aktarimi/sabitler"
import { formatTRY } from "@prime/shared/lib/format"
import type { FisView } from "@prime/shared/types/api"

interface Grup {
  mukellefId: string
  unvan: string
  fisler: FisView[]
}

function gruplar(fisler: FisView[]): Grup[] {
  const harita = new Map<string, Grup>()
  for (const f of fisler) {
    const g = harita.get(f.mukellefId) ?? {
      mukellefId: f.mukellefId,
      unvan: f.mukellefUnvan,
      fisler: [],
    }
    g.fisler.push(f)
    harita.set(f.mukellefId, g)
  }
  return [...harita.values()].sort((a, b) =>
    a.unvan.localeCompare(b.unvan, "tr")
  )
}

function MukellefGrubu({
  grup,
  onAc,
}: {
  grup: Grup
  onAc: (id: string) => void
}) {
  const aktar = useLucaAktar()
  const indir = useLucaIndir()
  const [calisiyor, setCalisiyor] = useState(false)
  const paketler = aktarimPaketleri(grup.fisler)
  const toplam = grup.fisler.reduce((t, f) => t + f.toplam, 0)

  const aktarVeIndir = async () => {
    setCalisiyor(true)
    try {
      // Luca bir dosyada en fazla 50 fiş alır; fazlası ayrı dosyalara bölünür
      for (const paket of paketler) {
        const detay = await aktar.mutateAsync({
          mukellefId: grup.mukellefId,
          fisIdleri: paket.map((f) => f.id),
        })
        await indir(detay)
      }
      toast.success(
        paketler.length > 1
          ? `${paketler.length} Luca dosyası indirildi`
          : "Luca dosyası indirildi",
        {
          description:
            "Luca'da Excel Veri Aktarımı ekranından yükleyin. Hata alırsanız Aktarımlar sekmesinden geri alabilirsiniz.",
        }
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            to={`/mukellefler/${grup.mukellefId}/fis-aktarimi`}
            className="hover:underline"
          >
            {grup.unvan}
          </Link>
        </CardTitle>
        <CardDescription>
          {grup.fisler.length} fiş · {formatTRY(toplam)}
          {paketler.length > 1 &&
            ` · ${MAKS_FIS_DOSYA}'şer fişlik ${paketler.length} dosya`}
        </CardDescription>
        <CardAction>
          <Button onClick={aktarVeIndir} disabled={calisiyor}>
            <HugeiconsIcon
              icon={Download04Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Luca Excel'i indir
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FisTablosu
          fisler={grup.fisler}
          onAc={onAc}
          gosterMukellef={false}
          ariaLabel={`${grup.unvan} aktarıma hazır fişleri`}
        />
      </CardContent>
    </Card>
  )
}

export function HazirPage() {
  const { fis, set } = useFisParams()
  const fisler = useFisler({ durum: "ONAYLANDI" })

  return (
    <div className="grid gap-4">
      {fisler.isPending ? (
        <LoadingState />
      ) : fisler.isError ? (
        <ErrorState error={fisler.error} onRetry={() => fisler.refetch()} />
      ) : fisler.data.length === 0 ? (
        <EmptyState
          icon={Invoice01Icon}
          title="Aktarıma hazır fiş yok"
          description="Taslaklar sekmesinde onayladığınız fişler mükellef bazında burada toplanır."
        />
      ) : (
        gruplar(fisler.data).map((g) => (
          <MukellefGrubu
            key={g.mukellefId}
            grup={g}
            onAc={(id) => set({ fis: id })}
          />
        ))
      )}
      <FisDuzenleyici fisId={fis} onClose={() => set({ fis: null })} />
    </div>
  )
}
