import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"

import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BorcListesi } from "@/features/borc/components/borc-listesi"
import { BorcuYokturListesi } from "@/features/borc/components/borcu-yoktur"
import { DogrulamaSheet } from "@/features/borc/components/dogrulama"
import { LevhaListesi } from "@/features/borc/components/levha-listesi"
import { ErisimlerSheet } from "@/features/borc/components/sgk-erisim"
import { useBorcParams } from "@/features/borc/hooks"
import { useBorcOzet } from "@/features/borc/queries"
import { formatTRY } from "@prime/shared/lib/format"

const SEKMELER = {
  vergi: "Vergi borcu",
  sgk: "SGK borcu",
  levha: "Vergi levhası",
  yazi: "Borcu yoktur",
} as const
type Sekme = keyof typeof SEKMELER

export function BorcLevhaPage() {
  const ozet = useBorcOzet()
  const { searchParams, guncelle } = useBorcParams()
  const sekmeParam = searchParams.get("sekme")
  const sekme: Sekme =
    sekmeParam && sekmeParam in SEKMELER ? (sekmeParam as Sekme) : "vergi"
  const dogrulamaAcik = searchParams.get("dogrulama") !== null
  const erisimAcik = searchParams.get("erisim") !== null
  const o = ozet.data
  const tarama = o?.sonTarama
  const erisimSorunlu = o
    ? o.gibErisimSorunlu + o.sgkErisim.hatali + o.sgkErisim.tanimsiz
    : 0

  // Sekme değişince sekmeye özgü filtreler ve panel temizlenir
  const sekmeSec = (s: Sekme) =>
    guncelle({ sekme: s, q: null, kapsam: null, borc: null, yazi: null })

  return (
    <>
      <PageHeader
        title="Borç ve levha"
        description={
          <>
            Vergi ve SGK borçları her gece sorgulanır, eksik vergi levhaları
            alınıp arşive kaydedilir
            {ozet.isSuccess &&
              (tarama ? (
                <>
                  {" · "}Son sorgu{" "}
                  {formatDistanceToNow(new Date(tarama.bitis), {
                    addSuffix: true,
                    locale: tr,
                  })}
                </>
              ) : (
                " · İlk gece sorgusu bekleniyor"
              ))}
          </>
        }
        actions={
          <Button variant="outline" onClick={() => guncelle({ erisim: "" })}>
            Erişimler
            {erisimSorunlu > 0 && (
              <span className="ml-1 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums">
                {erisimSorunlu}
              </span>
            )}
          </Button>
        }
      />

      {o && o.dogrulamaBekleyen > 0 && (
        <Alert>
          <AlertTitle>
            {o.dogrulamaBekleyen} girişte doğrulama kodu bekleniyor
          </AlertTitle>
          <AlertDescription>
            GİB / SGK doğrulama ekranı çıkardı; kod girilene kadar bu
            mükelleflerin sorguları bekler.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => guncelle({ dogrulama: "" })}
            >
              Kodları gir
            </button>
          </AlertDescription>
        </Alert>
      )}
      {o && o.gib.vadesiGecmisMukellef + o.sgk.vadesiGecmisMukellef > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {[
              o.gib.vadesiGecmisMukellef > 0 &&
                `${o.gib.vadesiGecmisMukellef} mükellefin ${formatTRY(o.gib.vadesiGecmisToplam)} vadesi geçmiş vergi borcu`,
              o.sgk.vadesiGecmisMukellef > 0 &&
                `${o.sgk.vadesiGecmisMukellef} mükellefin ${formatTRY(o.sgk.vadesiGecmisToplam)} vadesi geçmiş SGK borcu`,
            ]
              .filter(Boolean)
              .join(", ")}{" "}
            var
          </AlertTitle>
          <AlertDescription>
            <button
              type="button"
              className="underline"
              onClick={() =>
                guncelle({
                  sekme: o.gib.vadesiGecmisMukellef > 0 ? "vergi" : "sgk",
                  kapsam: "vadesiGecmis",
                  q: null,
                })
              }
            >
              Vadesi geçmiş borçları göster
            </button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={sekme} onValueChange={(v) => sekmeSec(v as Sekme)}>
        <TabsList className="max-w-full overflow-x-auto">
          {(Object.keys(SEKMELER) as Sekme[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {SEKMELER[s]}
              {s === "levha" && o && o.levhaEksik > 0 && (
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  ({o.levhaEksik})
                </span>
              )}
              {s === "yazi" && o && o.borcuYokturBekleyen > 0 && (
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  ({o.borcuYokturBekleyen})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value="vergi"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2"
        >
          {sekme === "vergi" && <BorcListesi kurum="GIB" />}
        </TabsContent>
        <TabsContent
          value="sgk"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2"
        >
          {sekme === "sgk" && <BorcListesi kurum="SGK" />}
        </TabsContent>
        <TabsContent
          value="levha"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2"
        >
          {sekme === "levha" && <LevhaListesi />}
        </TabsContent>
        <TabsContent
          value="yazi"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2"
        >
          {sekme === "yazi" && <BorcuYokturListesi />}
        </TabsContent>
      </Tabs>

      <DogrulamaSheet
        open={dogrulamaAcik}
        onClose={() => guncelle({ dogrulama: null })}
      />
      <ErisimlerSheet
        open={erisimAcik}
        gibSorunlu={o?.gibErisimSorunlu ?? 0}
        onClose={() => guncelle({ erisim: null })}
      />
    </>
  )
}
