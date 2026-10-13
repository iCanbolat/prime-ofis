import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Tick02Icon, ViewIcon } from "@hugeicons/core-free-icons"

import { DatePicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DosyaIkonu } from "@/features/arsiv/components/dosya-gorsel"
import { KategoriSelect } from "@/features/arsiv/components/kategori-select"
import {
  OnizlemeDialog,
  type OnizlenecekDosya,
} from "@/features/arsiv/components/onizleme-dialog"
import { GECERLILIK_GEREKEN, formatBoyut } from "@prime/shared/arsiv/kurallar"
import { GonderPaneli } from "@/features/evrak-talebi/components/gonder-paneli"
import { GelenDurumBadge } from "@/features/evrak-talebi/components/talep-rozetleri"
import { ISTENEN_EVRAKLAR } from "@prime/shared/evrak-talebi/sabitler"
import {
  useGelenOnayla,
  useGelenReddet,
  useTalepDetay,
} from "@/features/evrak-talebi/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { ArsivKategori, GelenEvrak } from "@prime/shared/types/domain"

type Incelenecek = GelenEvrak & { mukellefUnvan?: string }

/** Onay: dosya önerilen kategoriyle arşive kaydedilir */
function OnaylaForm({
  gelen,
  onClose,
}: {
  gelen: Incelenecek
  onClose: () => void
}) {
  const onayla = useGelenOnayla()
  const [ad, setAd] = useState(gelen.ad)
  const [kategori, setKategori] = useState<ArsivKategori>(
    ISTENEN_EVRAKLAR[gelen.istenen].kategori
  )
  const [gecerlilik, setGecerlilik] = useState("")
  const sureli = GECERLILIK_GEREKEN.includes(kategori)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    onayla.mutate(
      {
        id: gelen.id,
        ad,
        kategori,
        gecerlilikTarihi: sureli ? gecerlilik || undefined : undefined,
      },
      {
        onSuccess: (sonuc) => {
          toast.success(
            "Evrak onaylandı ve arşive kaydedildi",
            sonuc.okumaId
              ? {
                  description:
                    "Belge okunuyor; fiş taslağı Fiş Aktarımı'nda hazırlanacak.",
                }
              : undefined
          )
          onClose()
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Onayla ve arşive kaydet</DialogTitle>
        <DialogDescription>
          {gelen.mukellefUnvan ? `${gelen.mukellefUnvan} · ` : ""}
          {ISTENEN_EVRAKLAR[gelen.istenen].ad}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="onay-ad">Arşivdeki adı</FieldLabel>
          <Input
            id="onay-ad"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="onay-kategori">Arşiv kategorisi</FieldLabel>
          <KategoriSelect
            id="onay-kategori"
            value={kategori}
            onValueChange={setKategori}
          />
        </Field>
        {sureli && (
          <Field>
            <FieldLabel htmlFor="onay-gecerlilik">
              Son geçerlilik tarihi
            </FieldLabel>
            <DatePicker
              id="onay-gecerlilik"
              value={gecerlilik}
              onChange={setGecerlilik}
              clearable
            />
          </Field>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={onayla.isPending || !ad.trim()}>
          Onayla
        </Button>
      </DialogFooter>
    </form>
  )
}

const HAZIR_NEDENLER = [
  "Fotoğraf bulanık, okunmuyor",
  "Eksik sayfa var",
  "Yanlış döneme ait",
  "Yanlış evrak",
]

/** Red: neden zorunlu; istenirse talep yeniden açılır ve tekrar yükleme mesajı hazırlanır */
function ReddetForm({
  gelen,
  onClose,
}: {
  gelen: Incelenecek
  onClose: () => void
}) {
  const reddet = useGelenReddet()
  const [neden, setNeden] = useState("")
  const [yenidenAc, setYenidenAc] = useState(true)
  const [hata, setHata] = useState<string>()
  const [gonderilecek, setGonderilecek] = useState<string | null>(null)
  const talep = useTalepDetay(gonderilecek ? gelen.talepId : undefined)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!neden.trim()) {
      setHata("Red nedeni zorunludur")
      return
    }
    reddet.mutate(
      { id: gelen.id, neden, yenidenAc },
      {
        onSuccess: () => {
          toast.success("Evrak reddedildi")
          if (yenidenAc) setGonderilecek(neden.trim())
          else onClose()
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  if (gonderilecek) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Müşteriye tekrar yükleme mesajı</DialogTitle>
          <DialogDescription>
            Talep yeniden açıldı; müşteri aynı bağlantıdan tekrar yükleyebilir.
          </DialogDescription>
        </DialogHeader>
        {talep.data ? (
          <GonderPaneli talep={talep.data} sablon="RED" neden={gonderilecek} />
        ) : (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Kapat
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Evrakı reddet</DialogTitle>
        <DialogDescription>{gelen.ad}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(hata) || undefined}>
          <FieldLabel htmlFor="red-neden">Red nedeni</FieldLabel>
          <Textarea
            id="red-neden"
            rows={2}
            value={neden}
            aria-invalid={Boolean(hata) || undefined}
            onChange={(e) => {
              setNeden(e.target.value)
              setHata(undefined)
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {HAZIR_NEDENLER.map((n) => (
              <Button
                key={n}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setNeden(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <FieldDescription>
            Neden müşteriye portalda gösterilir.
          </FieldDescription>
          <FieldError>{hata}</FieldError>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="red-yeniden"
            checked={yenidenAc}
            onCheckedChange={setYenidenAc}
          />
          <FieldLabel htmlFor="red-yeniden" className="font-normal">
            Talebi yeniden aç ve müşteriye tekrar yükleme mesajı hazırla
          </FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" variant="destructive" disabled={reddet.isPending}>
          Reddet
        </Button>
      </DialogFooter>
    </form>
  )
}

type Aktif = { islem: "onayla" | "reddet"; gelen: Incelenecek } | null

/** Gelen evrak satırları + önizleme/onay/red pencereleri */
export function GelenEvrakListesi({
  gelenler,
  gosterMukellef = false,
  onTalepAc,
}: {
  gelenler: Incelenecek[]
  gosterMukellef?: boolean
  /** Verilirse satırda "Talep" bağlantısı gösterilir */
  onTalepAc?: (talepId: string) => void
}) {
  const [aktif, setAktif] = useState<Aktif>(null)
  const [onizlenen, setOnizlenen] = useState<OnizlenecekDosya | null>(null)
  const kapat = () => setAktif(null)

  return (
    <>
      <ul className="divide-y" aria-label="Gelen evraklar">
        {gelenler.map((g) => (
          <li
            key={g.id}
            aria-label={g.ad}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <DosyaIkonu mimeType={g.mimeType} />
            <div className="grid min-w-0 gap-0.5 leading-snug">
              <button
                type="button"
                className="truncate text-left text-sm font-medium hover:underline"
                onClick={() =>
                  setOnizlenen({
                    id: g.id,
                    ad: g.ad,
                    mimeType: g.mimeType,
                    aciklama: `${ISTENEN_EVRAKLAR[g.istenen].ad} · ${formatBoyut(g.boyut)}`,
                    kaynak: "gelen",
                  })
                }
              >
                {g.ad}
              </button>
              <span className="truncate text-xs text-muted-foreground">
                {gosterMukellef && g.mukellefUnvan
                  ? `${g.mukellefUnvan} · `
                  : ""}
                {ISTENEN_EVRAKLAR[g.istenen].ad} ·{" "}
                {formatDateTime(g.yuklemeTarihi)}
              </span>
              {onTalepAc && (
                <button
                  type="button"
                  className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onTalepAc(g.talepId)}
                >
                  Talebi aç
                </button>
              )}
              {g.durum === "REDDEDILDI" && g.redNedeni && (
                <span className="text-xs text-destructive">
                  Red nedeni: {g.redNedeni}
                </span>
              )}
              {g.durum === "ONAYLANDI" && g.arsivDosyaId && (
                <Link
                  to={`/mukellefler/${g.mukellefId}/arsiv`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Arşivde görüntüle
                </Link>
              )}
              {g.durum === "ONAYLANDI" && g.okumaId && (
                <Link
                  to={`/fis-aktarimi/taslaklar?gelen=${g.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Muhasebe fişini aç
                </Link>
              )}
            </div>
            <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3 sm:justify-end">
              {g.durum === "BEKLIYOR" ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${g.ad} önizle`}
                    onClick={() =>
                      setOnizlenen({
                        id: g.id,
                        ad: g.ad,
                        mimeType: g.mimeType,
                        aciklama: `${ISTENEN_EVRAKLAR[g.istenen].ad} · ${formatBoyut(g.boyut)}`,
                        kaynak: "gelen",
                      })
                    }
                  >
                    <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAktif({ islem: "reddet", gelen: g })}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Reddet
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setAktif({ islem: "onayla", gelen: g })}
                  >
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Onayla
                  </Button>
                </>
              ) : (
                <GelenDurumBadge durum={g.durum} />
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(aktif)} onOpenChange={(open) => !open && kapat()}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          {aktif?.islem === "onayla" && (
            <OnaylaForm
              key={aktif.gelen.id}
              gelen={aktif.gelen}
              onClose={kapat}
            />
          )}
          {aktif?.islem === "reddet" && (
            <ReddetForm
              key={aktif.gelen.id}
              gelen={aktif.gelen}
              onClose={kapat}
            />
          )}
        </DialogContent>
      </Dialog>
      <OnizlemeDialog dosya={onizlenen} onClose={() => setOnizlenen(null)} />
    </>
  )
}
