import { useMemo, useState } from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FileImportIcon,
  LockPasswordIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { ButtonLink } from "@/components/shared/button-link"
import { GorunumToggle } from "@/components/shared/liste-araclari"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { MukellefCredentialKartlari } from "@/features/kasa/components/credential-kartlari"
import { KasaDurumUyarisi } from "@/features/kasa/components/kasa-kilidi"
import { KasaKartlari } from "@/features/kasa/components/kasa-kartlari"
import { KasaTablosu } from "@/features/kasa/components/kasa-tablosu"
import { kasaSatirlari } from "@prime/shared/kasa/matris"
import { useCredentials } from "@/features/kasa/queries"
import { useMukellefList } from "@/features/mukellef/queries"
import { useListeGorunumu } from "@/hooks/use-liste-gorunumu"
import { cn } from "@/lib/utils"
import type { Mukellef } from "@prime/shared/types/domain"

function OzetKarti({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "warn"
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-3xl tabular-nums",
            tone === "warn" && "text-amber-600 dark:text-amber-400"
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

export function KasaPage() {
  const mukellefler = useMukellefList({ durum: "aktif" })
  const credentials = useCredentials()
  const [arama, setArama] = useState("")
  const [yalnizcaEksik, setYalnizcaEksik] = useState(false)
  const [secili, setSecili] = useState<Mukellef | null>(null)
  const [gorunum, setGorunum] = useListeGorunumu("kasa")

  const satirlar = useMemo(
    () =>
      mukellefler.data && credentials.data
        ? kasaSatirlari(mukellefler.data.items, credentials.data)
        : [],
    [mukellefler.data, credentials.data]
  )

  const ozet = useMemo(() => {
    let kayitli = 0
    let eksik = 0
    for (const s of satirlar) {
      for (const h of Object.values(s.hucreler)) {
        if (h === "kayitli") kayitli++
        if (h === "eksik") eksik++
      }
    }
    const oran =
      kayitli + eksik === 0
        ? 100
        : Math.round((kayitli / (kayitli + eksik)) * 100)
    return { kayitli, eksik, oran }
  }, [satirlar])

  const gorunenler = satirlar.filter(
    (s) =>
      (!yalnizcaEksik || s.eksikSayisi > 0) &&
      (!arama ||
        s.mukellef.unvan
          .toLocaleLowerCase("tr-TR")
          .includes(arama.toLocaleLowerCase("tr-TR")))
  )

  const hata = mukellefler.error ?? credentials.error

  return (
    <>
      <PageHeader
        title="Şifre Kasası"
        description="Aktif mükelleflerin GİB, İnteraktif VD, SGK ve e-Bildirge giriş bilgileri"
        actions={
          <ButtonLink variant="outline" to="/ice-aktarim/sifreler">
            <HugeiconsIcon
              icon={FileImportIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Excel'den içe aktar
          </ButtonLink>
        }
      />
      <KasaDurumUyarisi />

      {hata ? (
        <ErrorState
          error={hata}
          onRetry={() => {
            void mukellefler.refetch()
            void credentials.refetch()
          }}
        />
      ) : mukellefler.isPending || credentials.isPending ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <OzetKarti label="Kayıtlı şifre" value={ozet.kayitli} />
            <OzetKarti
              label="Eksik şifre"
              value={ozet.eksik}
              tone={ozet.eksik > 0 ? "warn" : undefined}
            />
            <OzetKarti label="Tamamlanma" value={`%${ozet.oran}`} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Kasada mükellef ara"
                placeholder="Mükellef ara…"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
              />
            </InputGroup>
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id="yalnizca-eksik"
                checked={yalnizcaEksik}
                onCheckedChange={setYalnizcaEksik}
              />
              <FieldLabel htmlFor="yalnizca-eksik">
                Yalnızca eksiği olanlar
              </FieldLabel>
            </Field>
            <div className="ml-auto">
              <GorunumToggle value={gorunum} onChange={setGorunum} />
            </div>
          </div>

          {gorunenler.length === 0 ? (
            <EmptyState
              icon={LockPasswordIcon}
              title={
                yalnizcaEksik
                  ? "Eksik şifresi olan mükellef yok"
                  : "Sonuç bulunamadı"
              }
            />
          ) : gorunum === "grid" ? (
            <KasaKartlari satirlar={gorunenler} onSec={setSecili} />
          ) : (
            <KasaTablosu satirlar={gorunenler} onSec={setSecili} />
          )}
        </>
      )}

      <Sheet
        open={secili !== null}
        onOpenChange={(open) => !open && setSecili(null)}
      >
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {secili && (
            <>
              <SheetHeader>
                <SheetTitle>{secili.unvan}</SheetTitle>
                <SheetDescription>
                  <Link to={`/mukellefler/${secili.id}`} className="underline">
                    Mükellef kartına git
                  </Link>
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <MukellefCredentialKartlari mukellefId={secili.id} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
