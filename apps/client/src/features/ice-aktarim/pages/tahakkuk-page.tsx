import { useRef, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, FileImportIcon } from "@hugeicons/core-free-icons"

import { FileDropzone } from "@/components/shared/file-dropzone"
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { pdfMetni } from "@/features/ice-aktarim/dosya-oku"
import { hucreSayi } from "@prime/shared/ice-aktarim/mizan"
import {
  useTahakkukAktar,
  useTahakkuklar,
} from "@/features/ice-aktarim/queries"
import {
  donemGecerliMi,
  tahakkukOku,
  type TahakkukOkuma,
} from "@prime/shared/ice-aktarim/tahakkuk"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { MukellefeGonderDialog } from "@/features/kanal/components/mukellefe-gonder-dialog"
import { useMukellefList } from "@/features/mukellef/queries"
import {
  YUKUMLULUK_SIRASI,
  YUKUMLULUK_TANIMLARI,
} from "@prime/shared/takvim/kurallar"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { dataUrlOku } from "@/lib/dosya"
import { formatDate, formatDateTime, formatTRY } from "@prime/shared/lib/format"
import type { TahakkukIceAktarKalem, TahakkukView } from "@prime/shared/types/api"
import type { YukumlulukTip } from "@prime/shared/types/domain"

/** e-Defter beratının tahakkuk fişi yoktur */
const TIPLER = YUKUMLULUK_SIRASI.filter((t) => t !== "E_DEFTER_BERAT")
const TIP_ITEMS = Object.fromEntries(
  TIPLER.map((t) => [t, YUKUMLULUK_TANIMLARI[t].ad])
)
const DONEM_ORNEGI: Partial<Record<YukumlulukTip, string>> = {
  KDV: "2026-08 veya 2026-Q3",
  GECICI_VERGI: "2026-Q2",
  KURUMLAR: "2025",
  GELIR: "2025",
}

interface Onizleme {
  anahtar: string
  dosya: File
  okunuyor: boolean
  okumaHatasi?: string
  okuma?: TahakkukOkuma
  mukellefId: string
  tip: YukumlulukTip | ""
  donem: string
  odenecek: string
  sunucuHatasi?: string
}

const tutarMetni = (n: number | undefined) =>
  n === undefined
    ? ""
    : n.toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

/** Kalem içe aktarılabilir mi? Değilse ilk sorun. */
function kalemSorunu(s: Onizleme): string | null {
  if (s.okunuyor) return "Okunuyor"
  if (s.okumaHatasi) return s.okumaHatasi
  if (!s.mukellefId)
    return s.okuma?.vknTckn
      ? `${s.okuma.vknTckn} ile kayıtlı aktif mükellef yok; elle seçin`
      : "Mükellef seçin"
  if (!s.tip) return "Beyanname türü seçin"
  if (!donemGecerliMi(s.tip, s.donem))
    return `Dönem biçimi: ${DONEM_ORNEGI[s.tip] ?? "2026-08"}`
  if (s.odenecek.trim() && hucreSayi(s.odenecek) === null)
    return "Ödenecek tutar geçersiz"
  return null
}

function OnizlemeKarti({
  s,
  onChange,
  onKaldir,
}: {
  s: Onizleme
  onChange: (patch: Partial<Onizleme>) => void
  onKaldir: () => void
}) {
  const sorun = kalemSorunu(s)
  const id = (alan: string) => `${s.anahtar}-${alan}`
  return (
    <li aria-label={s.dosya.name} className="grid gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{s.dosya.name}</span>
          {s.okuma && (
            <span className="text-xs text-muted-foreground">
              {[
                s.okuma.beyannameKodu,
                s.okuma.tahakkukNo && `Tahakkuk no ${s.okuma.tahakkukNo}`,
                s.okuma.vade && `Vade ${formatDate(s.okuma.vade)}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Fişten bilgi okunamadı"}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${s.dosya.name} listeden çıkar`}
          onClick={onKaldir}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {s.okunuyor ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Okunuyor…
        </span>
      ) : s.okumaHatasi ? null : (
        <>
          {!!s.okuma?.uyarilar.length && (
            <ul className="text-xs text-amber-800 dark:text-amber-300">
              {s.okuma.uyarilar.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor={id("mukellef")}>Mükellef</FieldLabel>
              <MukellefSelect
                id={id("mukellef")}
                value={s.mukellefId}
                onValueChange={(mukellefId) => onChange({ mukellefId })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("tip")}>Beyanname</FieldLabel>
              <Select
                items={TIP_ITEMS}
                value={s.tip || null}
                onValueChange={(v) =>
                  v && onChange({ tip: v as YukumlulukTip })
                }
              >
                <SelectTrigger id={id("tip")} className="w-full">
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TIPLER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIP_ITEMS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={id("donem")}>Dönem</FieldLabel>
              <Input
                id={id("donem")}
                value={s.donem}
                placeholder={(s.tip && DONEM_ORNEGI[s.tip]) || "2026-08"}
                onChange={(e) => onChange({ donem: e.target.value.trim() })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("odenecek")}>Ödenecek (₺)</FieldLabel>
              <Input
                id={id("odenecek")}
                inputMode="decimal"
                value={s.odenecek}
                onChange={(e) => onChange({ odenecek: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}
      {(s.sunucuHatasi ?? (sorun !== "Okunuyor" && sorun)) && (
        <FieldError>{s.sunucuHatasi ?? sorun}</FieldError>
      )}
    </li>
  )
}

function GecmisTablosu() {
  const tahakkuklar = useTahakkuklar()
  const [gonderilen, setGonderilen] = useState<TahakkukView | null>(null)
  if (tahakkuklar.isPending) return <LoadingState />
  if (tahakkuklar.isError)
    return (
      <ErrorState
        error={tahakkuklar.error}
        onRetry={() => tahakkuklar.refetch()}
      />
    )
  if (tahakkuklar.data.length === 0)
    return (
      <EmptyState
        icon={FileImportIcon}
        title="Henüz tahakkuk içe aktarılmadı"
        description="İçe aktarılan fişler takvimde beyanı onaylar ve mükellefin arşivine kaydedilir."
      />
    )
  return (
    <div className="overflow-x-auto rounded-3xl border">
      <Table aria-label="İçe aktarılan tahakkuklar">
        <TableHeader>
          <TableRow>
            <TableHead>Mükellef</TableHead>
            <TableHead>Beyanname</TableHead>
            <TableHead className="text-right">Ödenecek</TableHead>
            <TableHead className="hidden md:table-cell">Vade</TableHead>
            <TableHead className="hidden lg:table-cell">Yüklendi</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">İşlemler</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tahakkuklar.data.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="max-w-64 whitespace-normal sm:whitespace-nowrap">
                <Link
                  to={`/mukellefler/${t.mukellefId}/takvim`}
                  className="line-clamp-2 font-medium hover:underline sm:block sm:truncate"
                >
                  {t.mukellefUnvan}
                </Link>
              </TableCell>
              <TableCell>
                {YUKUMLULUK_TANIMLARI[t.tip].kisaAd}
                <span className="block text-xs text-muted-foreground">
                  {donemEtiketi(t.donem)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t.odenecek === undefined ? "—" : formatTRY(t.odenecek)}
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">
                {t.vade ? formatDate(t.vade) : "—"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                {formatDateTime(t.yuklemeTarihi)}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`${t.mukellefUnvan} ${YUKUMLULUK_TANIMLARI[t.tip].kisaAd} tahakkukunu gönder`}
                  onClick={() => setGonderilen(t)}
                >
                  Gönder
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MukellefeGonderDialog
        acik={Boolean(gonderilen)}
        sablon="TAHAKKUK"
        hedefler={
          gonderilen
            ? [{ mukellefId: gonderilen.mukellefId, tahakkukId: gonderilen.id }]
            : []
        }
        baslik="Tahakkuku mükellefe gönder"
        onClose={() => setGonderilen(null)}
      />
    </div>
  )
}

export function TahakkukPage() {
  const mukellefler = useMukellefList({ durum: "aktif" })
  const aktar = useTahakkukAktar()
  const [satirlar, setSatirlar] = useState<Onizleme[]>([])
  const sayac = useRef(0)

  const guncelle = (anahtar: string, patch: Partial<Onizleme>) =>
    setSatirlar((liste) =>
      liste.map((s) =>
        s.anahtar === anahtar ? { ...s, ...patch, sunucuHatasi: undefined } : s
      )
    )

  const dosyalariOku = (dosyalar: File[]) => {
    const pdfler = dosyalar.filter(
      (d) => d.type === "application/pdf" || /\.pdf$/i.test(d.name)
    )
    if (pdfler.length < dosyalar.length)
      toast.error("Yalnızca PDF tahakkuk fişleri okunabilir")
    const yeni = pdfler.map((dosya): Onizleme => ({
      anahtar: `t${++sayac.current}`,
      dosya,
      okunuyor: true,
      mukellefId: "",
      tip: "",
      donem: "",
      odenecek: "",
    }))
    setSatirlar((liste) => [...liste, ...yeni])

    for (const s of yeni) {
      pdfMetni(s.dosya)
        .then((metin) => {
          const okuma = tahakkukOku(metin)
          const m = mukellefler.data?.items.find(
            (m) => okuma.vknTckn && (m.vkn ?? m.tckn) === okuma.vknTckn
          )
          guncelle(s.anahtar, {
            okunuyor: false,
            okuma,
            mukellefId: m?.id ?? "",
            tip: okuma.tip ?? "",
            donem: okuma.donem ?? "",
            odenecek: tutarMetni(okuma.odenecek),
          })
        })
        .catch(() =>
          guncelle(s.anahtar, {
            okunuyor: false,
            okumaHatasi: "PDF okunamadı. Dosya bozuk veya şifreli olabilir.",
          })
        )
    }
  }

  const hazir = satirlar.filter((s) => !kalemSorunu(s))

  const iceAktar = async () => {
    const kalemler: TahakkukIceAktarKalem[] = await Promise.all(
      hazir.map(async (s) => ({
        mukellefId: s.mukellefId,
        tip: s.tip as YukumlulukTip,
        donem: s.donem,
        beyannameKodu: s.okuma?.beyannameKodu,
        tahakkukNo: s.okuma?.tahakkukNo,
        odenecek: s.odenecek.trim()
          ? (hucreSayi(s.odenecek) ?? undefined)
          : undefined,
        vade: s.okuma?.vade,
        dosya: { ad: s.dosya.name, dataUrl: await dataUrlOku(s.dosya) },
      }))
    )
    try {
      const { sonuclar } = await aktar.mutateAsync({ kalemler })
      const basarili = new Set<string>()
      const hatalar = new Map<string, string>()
      for (const r of sonuclar) {
        const anahtar = hazir[r.sira]!.anahtar
        if (r.durum === "HATA") hatalar.set(anahtar, r.mesaj ?? "Hata")
        else basarili.add(anahtar)
      }
      setSatirlar((liste) =>
        liste
          .filter((s) => !basarili.has(s.anahtar))
          .map((s) =>
            hatalar.has(s.anahtar)
              ? { ...s, sunucuHatasi: hatalar.get(s.anahtar) }
              : s
          )
      )
      if (basarili.size)
        toast.success(
          `${basarili.size} tahakkuk içe aktarıldı; takvimde beyanlar onaylandı`
        )
      if (hatalar.size) toast.error(`${hatalar.size} tahakkuk içe aktarılamadı`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İçe aktarılamadı")
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tahakkuk fişi yükle</CardTitle>
          <CardDescription>
            e-Beyanname'den indirilen tahakkuk PDF'lerini bırakın. Vergi kimlik
            numarasıyla mükellef, fişten tür, dönem ve tutar okunur; içe
            aktarmadan önce düzeltebilirsiniz.
          </CardDescription>
          {satirlar.length > 0 && (
            <CardAction>
              <Button
                disabled={hazir.length === 0 || aktar.isPending}
                onClick={iceAktar}
              >
                {aktar.isPending
                  ? "İçe aktarılıyor…"
                  : `İçe aktar (${hazir.length})`}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <FileDropzone
            accept=".pdf,application/pdf"
            disabled={mukellefler.isPending}
            onFiles={dosyalariOku}
            hint="PDF · birden çok dosya seçebilirsiniz"
          />
          {satirlar.length > 0 && (
            <ul aria-label="Okunan tahakkuklar" className="grid gap-3">
              {satirlar.map((s) => (
                <OnizlemeKarti
                  key={s.anahtar}
                  s={s}
                  onChange={(patch) => guncelle(s.anahtar, patch)}
                  onKaldir={() =>
                    setSatirlar((liste) =>
                      liste.filter((x) => x.anahtar !== s.anahtar)
                    )
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>İçe aktarılan tahakkuklar</CardTitle>
          <CardDescription>
            Aynı mükellef, beyanname ve dönem yeniden yüklenirse kayıt
            güncellenir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GecmisTablosu />
        </CardContent>
      </Card>
    </>
  )
}
