import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  InformationCircleIcon,
  Invoice01Icon,
} from "@hugeicons/core-free-icons"

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FisDuzenleyici } from "@/features/fis-aktarimi/components/fis-duzenleyici"
import { FisTablosu } from "@/features/fis-aktarimi/components/fis-tablosu"
import { OkumaListesi } from "@/features/fis-aktarimi/components/okuma-listesi"
import { useFisParams } from "@/features/fis-aktarimi/hooks/use-fis-params"
import { AktarimlarPage } from "@/features/fis-aktarimi/pages/aktarimlar-page"
import {
  useFisHesaplari,
  useFisHesaplariKaydet,
  useFisler,
  useOkumalar,
} from "@/features/fis-aktarimi/queries"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import type { FisHesapAyari, HesapEslemesi } from "@prime/shared/types/domain"

const TEMEL_HESAPLAR = [
  { alan: "gider", etiket: "Gider (fiş matrahı)" },
  { alan: "kasa", etiket: "Kasa (nakit ödeme)" },
  { alan: "banka", etiket: "Banka (kart / ekstre)" },
  { alan: "satici", etiket: "Satıcılar (veresiye)" },
] as const

const KDV_ORANLARI = ["1", "10", "20"]

function HesapAyarlariFormu({ ayar }: { ayar: FisHesapAyari }) {
  const kaydet = useFisHesaplariKaydet(ayar.id)
  const [taslak, setTaslak] = useState(ayar)
  const [yeni, setYeni] = useState<HesapEslemesi>({
    anahtar: "",
    hesapKodu: "",
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const { id: _, ...govde } = taslak
    kaydet.mutate(govde, {
      onSuccess: () => toast.success("Hesap ayarları kaydedildi"),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TEMEL_HESAPLAR.map((h) => (
          <Field key={h.alan}>
            <FieldLabel htmlFor={`hesap-${h.alan}`}>{h.etiket}</FieldLabel>
            <Input
              id={`hesap-${h.alan}`}
              value={taslak[h.alan]}
              className="font-mono tabular-nums"
              onChange={(e) =>
                setTaslak({ ...taslak, [h.alan]: e.target.value })
              }
            />
          </Field>
        ))}
        {KDV_ORANLARI.map((oran) => (
          <Field key={oran}>
            <FieldLabel htmlFor={`hesap-kdv-${oran}`}>
              İndirilecek KDV %{oran}
            </FieldLabel>
            <Input
              id={`hesap-kdv-${oran}`}
              value={taslak.kdv[oran] ?? ""}
              className="font-mono tabular-nums"
              onChange={(e) =>
                setTaslak({
                  ...taslak,
                  kdv: { ...taslak.kdv, [oran]: e.target.value },
                })
              }
            />
          </Field>
        ))}
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Öğrenilen eşlemeler</h3>
        <p className="text-xs text-muted-foreground">
          Satıcı VKN'si ya da ekstre açıklamasında geçen kelime → hesap. Fiş
          düzenlerken karşı hesabı değiştirdiğinizde otomatik eklenir.
        </p>
        {taslak.eslemeler.length > 0 && (
          <ul
            aria-label="Hesap eşlemeleri"
            className="divide-y rounded-2xl border px-3"
          >
            {taslak.eslemeler.map((e, i) => (
              <li
                key={`${e.anahtar}-${i}`}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{e.anahtar}</span>
                <span className="font-mono tabular-nums">{e.hesapKodu}</span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${e.anahtar} eşlemesini sil`}
                  onClick={() =>
                    setTaslak({
                      ...taslak,
                      eslemeler: taslak.eslemeler.filter((_, j) => j !== i),
                    })
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-full sm:w-auto sm:flex-1">
            <FieldLabel htmlFor="esleme-anahtar">
              Anahtar (VKN ya da kelime)
            </FieldLabel>
            <Input
              id="esleme-anahtar"
              value={yeni.anahtar}
              onChange={(e) => setYeni({ ...yeni, anahtar: e.target.value })}
            />
          </Field>
          <Field className="w-full sm:w-40">
            <FieldLabel htmlFor="esleme-hesap">Hesap kodu</FieldLabel>
            <Input
              id="esleme-hesap"
              value={yeni.hesapKodu}
              className="font-mono"
              onChange={(e) => setYeni({ ...yeni, hesapKodu: e.target.value })}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={!yeni.anahtar.trim() || !yeni.hesapKodu.trim()}
            onClick={() => {
              setTaslak({
                ...taslak,
                eslemeler: [
                  ...taslak.eslemeler,
                  {
                    anahtar: yeni.anahtar.trim().toLocaleUpperCase("tr-TR"),
                    hesapKodu: yeni.hesapKodu.trim(),
                  },
                ],
              })
              setYeni({ anahtar: "", hesapKodu: "" })
            }}
          >
            Ekle
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={kaydet.isPending}>
          Kaydet
        </Button>
      </div>
    </form>
  )
}

export function MukellefFisTab() {
  const { mukellef } = useMukellefKart()
  const { fis, set } = useFisParams()
  const hesaplar = useFisHesaplari(mukellef.id)
  const fisler = useFisler({ mukellefId: mukellef.id })
  const okumalar = useOkumalar({ mukellefId: mukellef.id })

  if (hesaplar.isPending) return <LoadingState />
  if (hesaplar.isError)
    return (
      <ErrorState error={hesaplar.error} onRetry={() => hesaplar.refetch()} />
    )

  if (!hesaplar.data.destekli)
    return (
      <Alert>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
        <AlertTitle>Şimdilik yalnızca bilanço esası</AlertTitle>
        <AlertDescription>
          Bu mükellef işletme defteri tutuyor. Fiş ve ekstre okuma ile Luca
          aktarımı şimdilik bilanço esasına göre defter tutan mükellefler için
          çalışıyor; gelen fişler arşive kaydedilmeye devam eder.
        </AlertDescription>
      </Alert>
    )

  return (
    <div className="grid gap-4">
      {okumalar.data && (
        <OkumaListesi okumalar={okumalar.data} gosterMukellef={false} />
      )}

      <section aria-label="Fişler" className="grid gap-2">
        {fisler.isPending ? (
          <LoadingState />
        ) : fisler.isError ? (
          <ErrorState error={fisler.error} onRetry={() => fisler.refetch()} />
        ) : fisler.data.length === 0 ? (
          <EmptyState
            icon={Invoice01Icon}
            title="Henüz fiş yok"
            description="Mükelleften fiş / fatura veya banka ekstresi isteyin; onayladığınız belgeler okunup burada fişe dönüşür."
          />
        ) : (
          <FisTablosu
            fisler={fisler.data}
            onAc={(id) => set({ fis: id })}
            gosterMukellef={false}
            gosterDurum
          />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hesap ayarları</CardTitle>
          <CardDescription>
            Okunan belgelerden fiş taslağı üretilirken kullanılan hesaplar.
            Luca'daki hesap planınızla aynı kodları girin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HesapAyarlariFormu
            key={JSON.stringify(hesaplar.data.ayar)}
            ayar={hesaplar.data.ayar}
          />
        </CardContent>
      </Card>

      <section aria-label="Luca aktarımları" className="grid gap-2">
        <h2 className="text-sm font-medium">Luca aktarımları</h2>
        <AktarimlarPage mukellefId={mukellef.id} />
      </section>

      <FisDuzenleyici fisId={fis} onClose={() => set({ fis: null })} />
    </div>
  )
}
