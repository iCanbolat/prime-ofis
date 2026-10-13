import { useRef, useState } from "react"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useBuro } from "@/features/ayarlar/queries"
import {
  SABLON_DEGISKENLERI,
  SABLON_KURALLARI,
  SABLON_TIPLERI,
  mesajOlustur,
  sablonHatasi,
  portalLinki,
  talepDegiskenleri,
} from "@prime/shared/evrak-talebi/mesaj"
import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"
import { useSablonlariKaydet } from "@/features/evrak-talebi/queries"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import type { MesajSablonlari } from "@prime/shared/types/api"
import type { Buro, MesajSablonTip } from "@prime/shared/types/domain"

const TANIMLAR: Record<MesajSablonTip, { baslik: string; aciklama: string }> = {
  TALEP: {
    baslik: "Evrak talebi mesajı",
    aciklama: "Yeni talep ve yeniden gönderimde WhatsApp / e-posta metni",
  },
  RED: {
    baslik: "Reddedilen evrak mesajı",
    aciklama: "Evrak reddedilip talep yeniden açıldığında müşteriye gönderilir",
  },
  TAHAKKUK: {
    baslik: "Tahakkuk gönderimi",
    aciklama:
      "Beyanname tahakkuku mükellefe iletilirken (e-postada PDF eklenir)",
  },
  BORC_HATIRLATMA: {
    baslik: "Ücret borcu hatırlatması",
    aciklama: "Tahsilat ekranından açık borcu olan mükelleflere gönderilir",
  },
}

function ornek(buro: Buro, sablon: string) {
  return mesajOlustur(sablon, {
    ...talepDegiskenleri({
      mukellefUnvan: "Çınar Yazılım Ltd. Şti.",
      buroAd: buro.ad,
      donem: "2026-08",
      istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
      link: portalLinki("ornek-baglanti", window.location.origin),
      sonKullanma: new Date(Date.now() + 7 * 864e5).toISOString(),
      neden: "Fotoğraf bulanık, okunmuyor",
    }),
    beyan: "KDV beyannamesi",
    tutar: formatTRY(6749.5),
    vade: formatDate(new Date(Date.now() + 5 * 864e5)),
    bakiye: formatTRY(24_000),
    donemler: "Temmuz 2026, Ağustos 2026",
    iban: buro.iban?.replace(/(.{4})/g, "$1 ").trim() ?? "TR00 0000 …",
  })
}

function SablonKarti({
  tip,
  deger,
  hata,
  buro,
  onChange,
}: {
  tip: MesajSablonTip
  deger: string
  hata?: string
  buro: Buro
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = `sablon-${tip}`

  const ekle = (degisken: string) => {
    const el = ref.current
    const yer = `{${degisken}}`
    if (!el) return onChange(deger + yer)
    const bas = el.selectionStart
    const son = el.selectionEnd
    onChange(deger.slice(0, bas) + yer + deger.slice(son))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(bas + yer.length, bas + yer.length)
    })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{TANIMLAR[tip].baslik}</CardTitle>
        <CardDescription>{TANIMLAR[tip].aciklama}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <Field data-invalid={Boolean(hata) || undefined}>
          <FieldLabel htmlFor={id}>Şablon</FieldLabel>
          <Textarea
            ref={ref}
            id={id}
            rows={6}
            value={deger}
            aria-invalid={Boolean(hata) || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5" aria-label="Değişken ekle">
            {SABLON_DEGISKENLERI.filter((d) =>
              SABLON_KURALLARI[tip].degiskenler.includes(d.ad)
            ).map((d) => (
              <Button
                key={d.ad}
                type="button"
                size="xs"
                variant="outline"
                title={d.aciklama}
                onClick={() => ekle(d.ad)}
                className="font-mono"
              >
                {`{${d.ad}}`}
              </Button>
            ))}
          </div>
          <FieldError>{hata}</FieldError>
        </Field>
        <div className="grid content-start gap-2">
          <span className="text-sm font-medium">Önizleme</span>
          <p
            aria-label={`${TANIMLAR[tip].baslik} önizleme`}
            className="rounded-2xl rounded-tl-sm bg-emerald-500/10 p-3 text-sm leading-relaxed whitespace-pre-wrap"
          >
            {ornek(buro, deger)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Form({ buro }: { buro: Buro }) {
  const kaydet = useSablonlariKaydet()
  const [degerler, setDegerler] = useState<MesajSablonlari>({
    ...VARSAYILAN_SABLONLAR,
    ...buro.mesajSablonlari,
  })
  const [hatalar, setHatalar] = useState<
    Partial<Record<MesajSablonTip, string>>
  >({})

  const gonder = () => {
    const yeni: typeof hatalar = {}
    for (const tip of SABLON_TIPLERI) {
      const hata = sablonHatasi(tip, degerler[tip])
      if (hata) yeni[tip] = hata
    }
    setHatalar(yeni)
    if (Object.keys(yeni).length) return
    kaydet.mutate(degerler, {
      onSuccess: () => toast.success("Mesaj şablonları kaydedildi"),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        WhatsApp Business ile gönderimde metin Meta'da onaylı şablondan gelir;
        buradaki metni onaya gönderdiğiniz şablonla aynı tutun. E-posta ve
        "WhatsApp'ta aç" gönderimlerinde bu metin kullanılır.
      </p>
      {SABLON_TIPLERI.map((tip) => (
        <SablonKarti
          key={tip}
          tip={tip}
          buro={buro}
          deger={degerler[tip]}
          hata={hatalar[tip]}
          onChange={(v) => setDegerler((d) => ({ ...d, [tip]: v }))}
        />
      ))}
      <Card size="sm">
        <CardFooter className="justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setDegerler(VARSAYILAN_SABLONLAR)}
          >
            Varsayılana dön
          </Button>
          <Button onClick={gonder} disabled={kaydet.isPending}>
            Kaydet
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export function SablonlarPage() {
  const buro = useBuro()
  if (buro.isPending) return <LoadingState />
  if (buro.isError)
    return <ErrorState error={buro.error} onRetry={() => buro.refetch()} />
  return <Form buro={buro.data} />
}
