import { useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { FileDropzone } from "@/components/shared/file-dropzone"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { BordroOkumaHatasi, bordroOzetiOku } from "@prime/shared/bordro/bordro-oku"
import { bordroKontrolleri } from "@prime/shared/bordro/kontroller"
import { useBordroOku, useBordroOzetiKaydet } from "@/features/bordro/queries"
import {
  BORDRO_BELGE_ACCEPT,
  belgelereCevir,
  yuklemeyeCevir,
  type YuklenecekBelge,
} from "@/features/bordro/belge-yukleme"
import { YuklenecekBelgeListesi } from "@/features/bordro/components/yuklenecek-belgeler"
import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"
import { hucreSayi } from "@prime/shared/ice-aktarim/mizan"
import { dataUrlOku } from "@/lib/dosya"
import { formatDonem } from "@prime/shared/lib/format"
import type { BordroOzeti } from "@prime/shared/types/domain"

type Alan = keyof BordroOzeti

const ALANLAR: { alan: Alan; etiket: string }[] = [
  { alan: "calisanSayisi", etiket: "Çalışan sayısı" },
  { alan: "brutToplam", etiket: "Brüt toplam (TL)" },
  { alan: "netToplam", etiket: "Net toplam (TL)" },
  { alan: "sgkIsciPayi", etiket: "SGK işçi payı (TL)" },
  { alan: "sgkIsverenPayi", etiket: "SGK işveren payı (TL)" },
  { alan: "issizlikToplam", etiket: "İşsizlik sigortası (TL)" },
  { alan: "gelirVergisi", etiket: "Gelir vergisi (TL)" },
  { alan: "damgaVergisi", etiket: "Damga vergisi (TL)" },
]

/** Düzenlenebilir alan değerleri; boş/hatalı olan `null` döner */
function ozeteCevir(alanlar: Record<Alan, string>): BordroOzeti | null {
  const ozet = {} as BordroOzeti
  for (const { alan } of ALANLAR) {
    const n = hucreSayi(alanlar[alan])
    if (n === null || n < 0) return null
    ozet[alan] = n
  }
  return Number.isInteger(ozet.calisanSayisi) && ozet.calisanSayisi >= 1
    ? ozet
    : null
}

const metne = (o: BordroOzeti): Record<Alan, string> =>
  Object.fromEntries(
    ALANLAR.map(({ alan }) => [alan, String(o[alan]).replace(".", ",")])
  ) as Record<Alan, string>

interface Okunan {
  /** Okunan icmal satırının anahtarı */
  key: string
  alanlar: Record<Alan, string>
  notlar: string[]
  /** PDF okumasında 0–1; Excel için tanımsız */
  guven?: number
}

function OzetForm({
  mukellefId,
  donem,
  mukellefUnvan,
  onClose,
}: {
  mukellefId: string
  donem: string
  mukellefUnvan: string
  onClose: () => void
}) {
  const kaydet = useBordroOzetiKaydet()
  const oku = useBordroOku()
  const [belgeler, setBelgeler] = useState<YuklenecekBelge[]>([])
  const [okunan, setOkunan] = useState<Okunan | null>(null)
  const [okunuyor, setOkunuyor] = useState(false)
  const [hata, setHata] = useState<string>()
  // Toplamlar yalnızca ilk icmalden okunur; diğer belgeler okunmadan arşivlenir
  const icmal = belgeler.find((b) => b.tur === "ICMAL")
  /** Okunan / okunmakta olan icmalin anahtarı; geç gelen eski okuma sonucu atılır */
  const okunacak = useRef<string>(undefined)

  const ozet = okunan ? ozeteCevir(okunan.alanlar) : null
  const kontroller = ozet ? bordroKontrolleri(ozet) : []
  const netBrutHata = kontroller.find(
    (k) => k.kod === "NET_BRUT" && k.durum === "HATA"
  )

  const belgeleriDegistir = (yeni: YuklenecekBelge[]) => {
    setBelgeler(yeni)
    const yeniIcmal = yeni.find((b) => b.tur === "ICMAL")
    if (yeniIcmal?.key === okunacak.current) return
    okunacak.current = yeniIcmal?.key
    setOkunan(null)
    setHata(undefined)
    setOkunuyor(false)
    if (yeniIcmal) void icmalOku(yeniIcmal)
  }

  const icmalOku = async ({ key, dosya }: YuklenecekBelge) => {
    const guncel = () => okunacak.current === key
    setOkunuyor(true)
    try {
      if (/\.pdf$/i.test(dosya.name) || dosya.type === "application/pdf") {
        // PDF backend'de Claude ile okunur; sonuç onaydan önce düzenlenebilir
        const sonuc = await oku.mutateAsync({
          dosya: { ad: dosya.name, dataUrl: await dataUrlOku(dosya) },
        })
        if (!guncel()) return
        setOkunan({
          key,
          alanlar: metne(sonuc.ozet),
          guven: sonuc.guven,
          notlar: [],
        })
      } else {
        const okuma = bordroOzetiOku(await tabloSatirlari(dosya))
        if (!guncel()) return
        setOkunan({
          key,
          alanlar: metne(okuma.ozet),
          notlar: [
            `${okuma.satirSayisi} çalışan satırı okundu${okuma.toplamSatirindan ? "; toplamlar dosyadaki TOPLAM satırından alındı" : ""}.`,
            ...(okuma.eksikSutunlar.length
              ? [
                  `Dosyada bulunamayan sütunlar 0 alındı: ${okuma.eksikSutunlar.join(", ")}.`,
                ]
              : []),
          ],
        })
      }
    } catch (e) {
      if (!guncel()) return
      setHata(
        e instanceof BordroOkumaHatasi || e instanceof Error
          ? e.message
          : "Dosya okunamadı"
      )
    } finally {
      if (guncel()) setOkunuyor(false)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!okunan || !ozet || netBrutHata) return
    // mutateAsync: kayıttan sonra detay paneli yeniden kurulur; mutate'in çağrı yeri
    // callback'leri bileşen kalkınca çalışmaz
    try {
      await kaydet.mutateAsync({
        mukellefId,
        donem,
        ozet,
        dosyalar: await yuklemeyeCevir(belgeler),
      })
      toast.success(
        belgeler.length > 1
          ? `Bordro özeti içe aktarıldı, ${belgeler.length} belge arşive eklendi`
          : "Bordro özeti içe aktarıldı"
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İçe aktarılamadı")
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Bordro dökümünü yükle</DialogTitle>
        <DialogDescription>
          {mukellefUnvan} · {formatDonem(donem)}
        </DialogDescription>
      </DialogHeader>

      <FileDropzone
        accept={BORDRO_BELGE_ACCEPT}
        disabled={okunuyor || kaydet.isPending}
        onFiles={(f) => belgeleriDegistir([...belgeler, ...belgelereCevir(f)])}
        hint="Muhasebe programının bordro dökümünü (icmal) ve isterseniz pusula / tahakkuk çıktılarını birlikte bırakın. Toplamlar yalnızca icmalden okunur: Excel / CSV tarayıcıda toplanır, PDF sunucuda okunur."
      />

      <YuklenecekBelgeListesi
        belgeler={belgeler}
        onChange={belgeleriDegistir}
        disabled={okunuyor || kaydet.isPending}
        aciklama={(b) =>
          b.key === icmal?.key ? "Toplamlar bu dosyadan okunur" : undefined
        }
      />
      {belgeler.length > 0 && !icmal && (
        <Alert>
          <AlertTitle>Bordro dökümü (icmal) seçilmedi</AlertTitle>
          <AlertDescription>
            Toplamların okunacağı dosyanın türünü “Bordro dökümü (icmal)” yapın.
          </AlertDescription>
        </Alert>
      )}

      {okunuyor && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Spinner /> Bordro okunuyor…
        </p>
      )}
      {hata && (
        <Alert variant="destructive">
          <AlertTitle>Dosya okunamadı</AlertTitle>
          <AlertDescription>{hata}</AlertDescription>
        </Alert>
      )}

      {okunan && (
        <>
          {okunan.guven !== undefined && okunan.guven < 0.8 && (
            <Alert>
              <AlertTitle>
                Okuma güveni düşük (%{Math.round(okunan.guven * 100)})
              </AlertTitle>
              <AlertDescription>
                Tutarları bordro dökümüyle karşılaştırıp düzeltin.
              </AlertDescription>
            </Alert>
          )}
          {okunan.notlar.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            {ALANLAR.map(({ alan, etiket }) => {
              const gecersiz = hucreSayi(okunan.alanlar[alan]) === null
              return (
                <Field key={alan} data-invalid={gecersiz || undefined}>
                  <FieldLabel htmlFor={`bordro-${alan}`}>{etiket}</FieldLabel>
                  <Input
                    id={`bordro-${alan}`}
                    inputMode="decimal"
                    value={okunan.alanlar[alan]}
                    aria-invalid={gecersiz || undefined}
                    onChange={(e) =>
                      setOkunan({
                        ...okunan,
                        alanlar: { ...okunan.alanlar, [alan]: e.target.value },
                      })
                    }
                  />
                  {gecersiz && <FieldError>Geçerli bir sayı girin</FieldError>}
                </Field>
              )
            })}
          </div>
          {netBrutHata && (
            <p role="alert" className="text-sm text-destructive">
              {netBrutHata.aciklama}
            </p>
          )}
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          disabled={
            !okunan || !ozet || Boolean(netBrutHata) || kaydet.isPending
          }
        >
          İçe aktar
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BordroOzetDialog({
  hedef,
  onClose,
}: {
  hedef: { mukellefId: string; donem: string; mukellefUnvan: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(hedef)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {hedef && (
          <OzetForm
            key={`${hedef.mukellefId}:${hedef.donem}`}
            {...hedef}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
