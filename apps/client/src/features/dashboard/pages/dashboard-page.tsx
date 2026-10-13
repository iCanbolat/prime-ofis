import { useSearchParams } from "react-router"

import { PageHeader } from "@/components/shared/page-header"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useArsivOzet } from "@/features/arsiv/queries"
import { useAuthStore } from "@/features/auth/store"
import { useBordroOzet } from "@/features/bordro/queries"
import { useBorcOzet } from "@/features/borc/queries"
import { DikkatKarti } from "@/features/dashboard/components/dikkat-karti"
import { TahsilatKarti } from "@/features/dashboard/components/tahsilat-karti"
import { YapilacaklarKarti } from "@/features/dashboard/components/yapilacaklar-karti"
import { useEBelgeOzet } from "@/features/e-belge/queries"
import { useGorevList } from "@/features/gorev/queries"
import { useTahsilatOzet } from "@/features/tahsilat/queries"
import { useTebligatOzet } from "@/features/tebligat/queries"
import { useTakvimOzet } from "@/features/takvim/queries"
import { formatDateLong } from "@prime/shared/lib/format"

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const benim = searchParams.get("kapsam") === "benim"
  const sorumlu = benim ? user?.id : undefined

  const ozet = useTakvimOzet({ sorumlu })
  const gorevler = useGorevList({
    atanan: sorumlu ? [sorumlu] : undefined,
    durum: ["YAPILACAK", "DEVAM", "KONTROL"],
  })
  const arsiv = useArsivOzet({ sorumlu })
  const eBelge = useEBelgeOzet({ sorumlu })
  const tahsilat = useTahsilatOzet({ sorumlu })
  const tebligat = useTebligatOzet({ sorumlu })
  const bordro = useBordroOzet({ sorumlu })
  const borc = useBorcOzet({ sorumlu })

  const takvimLinki = (sorgu: string) =>
    `/takvim?gorunum=liste&${sorgu}${sorumlu ? `&sorumlu=${sorumlu}` : ""}`
  const kaynak = <T,>(q: {
    data: T | undefined
    isError: boolean
    error: unknown
    refetch: () => unknown
  }) => ({
    data: q.data,
    hata: q.isError ? q.error : undefined,
    onRetry: () => void q.refetch(),
  })

  return (
    <>
      <PageHeader
        title={`Merhaba, ${user?.ad ?? ""}`}
        description={formatDateLong(new Date())}
        actions={
          <ToggleGroup
            variant="outline"
            spacing={0}
            aria-label="Kapsam"
            value={[benim ? "benim" : "buro"]}
            onValueChange={(v) =>
              v[0] &&
              setSearchParams(v[0] === "benim" ? { kapsam: "benim" } : {}, {
                replace: true,
              })
            }
          >
            <ToggleGroupItem value="buro">Tüm büro</ToggleGroupItem>
            <ToggleGroupItem value="benim">Benim mükelleflerim</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="@container">
        {/*
          Geniş ekranda satır yüksekliğini sağ sütun belirler: Yapılacaklar kartı
          hücreyi mutlak konumla doldurur ve listesi kendi içinde kayar.
        */}
        <div className="grid gap-4 @4xl:grid-cols-3">
          <div className="relative min-w-0 @4xl:col-span-2 @4xl:min-h-[34rem]">
            <YapilacaklarKarti
              className="@4xl:absolute @4xl:inset-0"
              ozet={ozet.data}
              gorevler={gorevler.data}
              hata={
                ozet.isError
                  ? ozet.error
                  : gorevler.isError
                    ? gorevler.error
                    : undefined
              }
              onRetry={() => {
                void ozet.refetch()
                void gorevler.refetch()
              }}
              takvimLinki={takvimLinki}
              sorumlu={sorumlu}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <DikkatKarti
              className="flex-1"
              tebligat={kaynak(tebligat)}
              eBelge={kaynak(eBelge)}
              arsiv={kaynak(arsiv)}
              bordro={kaynak(bordro)}
              borc={kaynak(borc)}
            />
            <TahsilatKarti
              ozet={tahsilat.data}
              hata={tahsilat.isError ? tahsilat.error : undefined}
              onRetry={() => tahsilat.refetch()}
            />
          </div>
        </div>
      </div>
    </>
  )
}
