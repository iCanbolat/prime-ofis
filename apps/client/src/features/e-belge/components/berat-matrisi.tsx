import { useMemo, useState } from "react"
import { Link } from "react-router"
import { format } from "date-fns"
import { tr } from "date-fns/locale"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  BookOpen01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  MinusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BeratDurumBadge } from "@/features/e-belge/components/ebelge-rozetleri"
import { useBeratlar } from "@/features/e-belge/queries"
import { BERAT_DURUM_ETIKET } from "@prime/shared/e-belge/sabitler"
import { formatDate, formatDateTime, formatDonem } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { BeratView } from "@prime/shared/types/api"

/** "2026-06" → "Haz 26" */
function kisaDonem(donem: string) {
  return format(new Date(`${donem}-01T00:00:00`), "MMM yy", { locale: tr })
}

function sorunlu(b: BeratView) {
  return b.gecikti || b.durum === "HATA"
}

function HucreIkonu({ b }: { b: BeratView }) {
  if (b.durum === "ONAYLANDI")
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={2}
        className="text-emerald-600 dark:text-emerald-400"
      />
    )
  if (sorunlu(b))
    return (
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        className="text-destructive"
      />
    )
  if (b.durum === "YUKLENDI")
    return (
      <HugeiconsIcon
        icon={Clock01Icon}
        strokeWidth={2}
        className="text-sky-700 dark:text-sky-300"
      />
    )
  return (
    <HugeiconsIcon
      icon={MinusSignIcon}
      strokeWidth={2}
      className="text-muted-foreground"
    />
  )
}

function hucreEtiketi(b: BeratView) {
  if (b.gecikti && b.durum === "YUKLENMEDI") return "Gecikti"
  return BERAT_DURUM_ETIKET[b.durum]
}

/** Mükellef × dönem berat matrisi. `mukellefId` verilirse (mükellef kartı) tek satır. */
export function BeratMatrisi({ mukellefId }: { mukellefId?: string }) {
  const beratlar = useBeratlar(mukellefId ? { mukellefId } : {})
  const [arama, setArama] = useState("")
  const [yalnizcaSorunlu, setYalnizcaSorunlu] = useState(false)
  const [secili, setSecili] = useState<BeratView | null>(null)

  const satirlar = useMemo(() => {
    const gruplar = new Map<string, BeratView[]>()
    for (const b of beratlar.data?.items ?? []) {
      const liste = gruplar.get(b.mukellefId) ?? []
      liste.push(b)
      gruplar.set(b.mukellefId, liste)
    }
    const q = arama.toLocaleLowerCase("tr-TR")
    return [...gruplar.values()].filter(
      (hucreler) =>
        (!q ||
          hucreler[0]!.mukellefUnvan.toLocaleLowerCase("tr-TR").includes(q)) &&
        (!yalnizcaSorunlu || hucreler.some(sorunlu))
    )
  }, [beratlar.data, arama, yalnizcaSorunlu])

  if (beratlar.isError)
    return (
      <ErrorState error={beratlar.error} onRetry={() => beratlar.refetch()} />
    )
  if (beratlar.isPending) return <LoadingState />

  const donemler = beratlar.data.donemler
  const tumu = beratlar.data.items
  if (tumu.length === 0)
    return (
      <EmptyState
        icon={BookOpen01Icon}
        title="e-Defter takibi yapılan mükellef yok"
        description="e-Defter servisi açık Luca bağlantısı olan mükellefler burada görünür."
      />
    )

  return (
    <>
      {!mukellefId && (
        <div className="flex flex-wrap items-center gap-4">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Mükellef ara"
              placeholder="Mükellef ara…"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
            />
          </InputGroup>
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="berat-sorunlu"
              checked={yalnizcaSorunlu}
              onCheckedChange={setYalnizcaSorunlu}
            />
            <FieldLabel htmlFor="berat-sorunlu">
              Yalnızca geciken / hatalı olanlar
            </FieldLabel>
          </Field>
          <p className="text-sm text-muted-foreground">
            {tumu.filter((b) => b.durum === "ONAYLANDI").length} berat alındı ·{" "}
            {tumu.filter((b) => b.durum === "YUKLENDI").length} bekleniyor ·{" "}
            {tumu.filter(sorunlu).length} sorunlu
          </p>
        </div>
      )}

      {satirlar.length === 0 ? (
        <EmptyState icon={BookOpen01Icon} title="Sonuç bulunamadı" />
      ) : (
        <div className="overflow-x-auto rounded-3xl border">
          <Table aria-label="e-Defter berat durumları">
            <TableHeader>
              <TableRow>
                {!mukellefId && (
                  <TableHead className="sticky left-0 z-10 bg-background">
                    Mükellef
                  </TableHead>
                )}
                {donemler.map((d) => (
                  <TableHead key={d} className="px-1 text-center capitalize">
                    <abbr title={formatDonem(d)} className="no-underline">
                      {kisaDonem(d)}
                    </abbr>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((hucreler) => {
                const ilk = hucreler[0]!
                const byDonem = new Map(hucreler.map((h) => [h.donem, h]))
                return (
                  <TableRow key={ilk.mukellefId}>
                    {!mukellefId && (
                      <TableCell className="sticky left-0 z-10 max-w-56 bg-background">
                        <Link
                          to={`/mukellefler/${ilk.mukellefId}/e-belge`}
                          className="block truncate font-medium hover:underline"
                        >
                          {ilk.mukellefUnvan}
                        </Link>
                      </TableCell>
                    )}
                    {donemler.map((d) => {
                      const b = byDonem.get(d)
                      if (!b) return <TableCell key={d} />
                      return (
                        <TableCell key={d} className="px-1 text-center">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${b.mukellefUnvan} ${formatDonem(d)}: ${hucreEtiketi(b)}`}
                            onClick={() => setSecili(b)}
                            className={cn(sorunlu(b) && "bg-destructive/5")}
                          >
                            <HucreIkonu b={b} />
                          </Button>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ul
        aria-label="Açıklama"
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        {(
          [
            ["ONAYLANDI", "Berat alındı"],
            ["YUKLENDI", "Defter yüklendi, berat bekleniyor"],
            ["HATA", "Hatalı / gecikti"],
            ["YUKLENMEDI", "Yüklenmedi"],
          ] as const
        ).map(([durum, etiket]) => (
          <li key={durum} className="flex items-center gap-1 [&_svg]:size-4">
            <HucreIkonu
              b={{
                id: "",
                mukellefId: "",
                mukellefUnvan: "",
                donem: "",
                durum,
                gecikti: false,
              }}
            />
            {etiket}
          </li>
        ))}
      </ul>

      <Sheet
        open={secili !== null}
        onOpenChange={(open) => !open && setSecili(null)}
      >
        <SheetContent className="w-full data-[side=right]:sm:max-w-md">
          {secili && (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle>{formatDonem(secili.donem)} beratı</SheetTitle>
                <SheetDescription>{secili.mukellefUnvan}</SheetDescription>
              </SheetHeader>
              <dl className="grid gap-4 px-4 pb-6 text-sm">
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Durum</dt>
                  <dd>
                    <BeratDurumBadge
                      durum={secili.durum}
                      gecikti={secili.gecikti}
                    />
                  </dd>
                </div>
                {secili.sonTarih && (
                  <div className="grid gap-1">
                    <dt className="text-xs text-muted-foreground">
                      Berat son günü
                    </dt>
                    <dd>
                      {formatDate(secili.sonTarih)}{" "}
                      <Link
                        to={`/mukellefler/${secili.mukellefId}/takvim`}
                        className="text-link hover:underline"
                      >
                        Takvimde gör
                      </Link>
                    </dd>
                  </div>
                )}
                {secili.yuklemeTarihi && (
                  <div className="grid gap-1">
                    <dt className="text-xs text-muted-foreground">
                      Defter yükleme
                    </dt>
                    <dd>{formatDateTime(secili.yuklemeTarihi)}</dd>
                  </div>
                )}
                {secili.onayTarihi && (
                  <div className="grid gap-1">
                    <dt className="text-xs text-muted-foreground">
                      Berat onayı (GİB)
                    </dt>
                    <dd>{formatDateTime(secili.onayTarihi)}</dd>
                  </div>
                )}
                {secili.hataMesaji && (
                  <div className="grid gap-1 rounded-xl bg-destructive/5 p-3">
                    <dt className="text-xs text-muted-foreground">Hata</dt>
                    <dd className="text-destructive">{secili.hataMesaji}</dd>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Berat durumu Luca senkronuyla güncellenir; berat alınınca
                  takvimdeki e-Defter berat yükümlülüğü otomatik olarak
                  onaylanır.
                </p>
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
