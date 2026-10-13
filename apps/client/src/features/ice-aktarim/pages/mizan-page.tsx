import { useState } from "react"
import { Link } from "react-router"
import { format, subMonths } from "date-fns"
import { toast } from "sonner"
import { Table02Icon } from "@hugeicons/core-free-icons"

import { MonthPicker } from "@/components/shared/date-picker"
import { FileDropzone } from "@/components/shared/file-dropzone"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  KontrolListesi,
  MizanDetaySheet,
} from "@/features/ice-aktarim/components/mizan-detay-sheet"
import { MizanSonucBadge } from "@/features/ice-aktarim/components/mizan-rozetleri"
import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"
import {
  MizanOkumaHatasi,
  mizanKontrolleri,
  mizanOku,
  mizanOzeti,
  type MizanOkuma,
} from "@prime/shared/ice-aktarim/mizan"
import { useMizanAktar, useMizanlar } from "@/features/ice-aktarim/queries"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { dataUrlOku } from "@/lib/dosya"
import { formatDateTime, formatDonem, formatTRY } from "@prime/shared/lib/format"
import type { MizanView } from "@prime/shared/types/api"

interface Okunan {
  dosya: File
  okuma: MizanOkuma
}

function GecmisTablosu({ onAc }: { onAc: (z: MizanView) => void }) {
  const mizanlar = useMizanlar()
  if (mizanlar.isPending) return <LoadingState />
  if (mizanlar.isError)
    return (
      <ErrorState error={mizanlar.error} onRetry={() => mizanlar.refetch()} />
    )
  if (mizanlar.data.length === 0)
    return (
      <EmptyState
        icon={Table02Icon}
        title="Henüz mizan içe aktarılmadı"
        description="Muhasebe paketinizden aldığınız mizanı yükleyince kontroller burada listelenir."
      />
    )
  return (
    <div className="overflow-x-auto rounded-3xl border">
      <Table aria-label="İçe aktarılan mizanlar">
        <TableHeader>
          <TableRow>
            <TableHead>Mükellef</TableHead>
            <TableHead>Dönem</TableHead>
            <TableHead>Sonuç</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Dönem sonucu
            </TableHead>
            <TableHead className="hidden lg:table-cell">Yüklendi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mizanlar.data.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="max-w-64 whitespace-normal sm:whitespace-nowrap">
                <Link
                  to={`/mukellefler/${z.mukellefId}`}
                  className="line-clamp-2 font-medium hover:underline sm:block sm:truncate"
                >
                  {z.mukellefUnvan}
                </Link>
              </TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  aria-label={`${z.mukellefUnvan} ${formatDonem(z.donem)} mizanını aç`}
                  onClick={() => onAc(z)}
                >
                  {formatDonem(z.donem)}
                </Button>
              </TableCell>
              <TableCell>
                <MizanSonucBadge kontroller={z.kontroller} />
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {z.ozet.donemSonucu < 0 && "−"}
                {formatTRY(Math.abs(z.ozet.donemSonucu))}
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                {formatDateTime(z.yuklemeTarihi)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function MizanPage() {
  const aktar = useMizanAktar()
  const [mukellefId, setMukellefId] = useState("")
  const [donem, setDonem] = useState(() =>
    format(subMonths(new Date(), 1), "yyyy-MM")
  )
  const [okunan, setOkunan] = useState<Okunan | null>(null)
  const [okunuyor, setOkunuyor] = useState(false)
  const [okumaHatasi, setOkumaHatasi] = useState<string>()
  const [acik, setAcik] = useState<MizanView | null>(null)
  const [denendi, setDenendi] = useState(false)

  const dosyaOku = async ([dosya]: File[]) => {
    if (!dosya) return
    setOkunuyor(true)
    setOkumaHatasi(undefined)
    setOkunan(null)
    try {
      setOkunan({ dosya, okuma: mizanOku(await tabloSatirlari(dosya)) })
    } catch (error) {
      setOkumaHatasi(
        error instanceof MizanOkumaHatasi
          ? error.message
          : "Dosya okunamadı. Excel (.xlsx, .xls) veya CSV olmalı."
      )
    } finally {
      setOkunuyor(false)
    }
  }

  const iceAktar = async () => {
    setDenendi(true)
    if (!okunan || !mukellefId || !donem) return
    try {
      const z = await aktar.mutateAsync({
        mukellefId,
        donem,
        dosya: {
          ad: okunan.dosya.name,
          dataUrl: await dataUrlOku(okunan.dosya),
        },
        hesaplar: okunan.okuma.hesaplar,
      })
      toast.success(
        `${z.mukellefUnvan} ${formatDonem(z.donem)} mizanı içe aktarıldı`,
        {
          description: z.isaretlenenGorevId
            ? "Geçici vergi görevinde “Mizan kontrol edildi” işaretlendi."
            : undefined,
        }
      )
      setOkunan(null)
      setDenendi(false)
      setAcik(z)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İçe aktarılamadı")
    }
  }

  const ozet = okunan && mizanOzeti(okunan.okuma.hesaplar)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Mizan yükle</CardTitle>
          <CardDescription>
            Muhasebe paketinden Excel veya CSV olarak aldığınız mizanı yükleyin.
            "Hesap Kodu", "Borç" ve "Alacak" sütunları otomatik bulunur;
            denklik, ters bakiye, KDV ve 360 hesabı kontrol edilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={(denendi && !mukellefId) || undefined}>
              <FieldLabel htmlFor="mizan-mukellef">Mükellef</FieldLabel>
              <MukellefSelect
                id="mizan-mukellef"
                value={mukellefId}
                onValueChange={setMukellefId}
                aria-invalid={(denendi && !mukellefId) || undefined}
              />
              {denendi && !mukellefId && (
                <FieldError>Mükellef seçin</FieldError>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="mizan-donem">Dönem (ay sonu)</FieldLabel>
              <MonthPicker id="mizan-donem" value={donem} onChange={setDonem} />
            </Field>
          </div>

          {okunan && ozet ? (
            <div className="grid gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid gap-0.5">
                  <span className="font-medium">{okunan.dosya.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {okunan.okuma.hesaplar.length} ana hesap okundu
                    {okunan.okuma.atlanan > 0 &&
                      ` · ${okunan.okuma.atlanan} satır (toplam, ara başlık) atlandı`}
                    {` · Borç ${formatTRY(ozet.toplamBorc)} · Alacak ${formatTRY(ozet.toplamAlacak)}`}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOkunan(null)}>
                    Vazgeç
                  </Button>
                  <Button disabled={aktar.isPending} onClick={iceAktar}>
                    {aktar.isPending ? "İçe aktarılıyor…" : "İçe aktar"}
                  </Button>
                </div>
              </div>
              <KontrolListesi
                kontroller={mizanKontrolleri(okunan.okuma.hesaplar)}
              />
              <p className="text-xs text-muted-foreground">
                Ön kontrol. İçe aktarınca 360 hesabı, dönemin içe aktarılmış
                tahakkuklarıyla da karşılaştırılır.
              </p>
            </div>
          ) : okunuyor ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Mizan okunuyor…
            </span>
          ) : (
            <FileDropzone
              accept=".xlsx,.xls,.csv"
              multiple={false}
              onFiles={dosyaOku}
              hint="Excel (.xlsx, .xls) veya CSV · ilk sayfa okunur"
            />
          )}
          {okumaHatasi && <FieldError>{okumaHatasi}</FieldError>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>İçe aktarılan mizanlar</CardTitle>
          <CardDescription>
            Aynı mükellef ve dönem yeniden yüklenirse kayıt güncellenir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GecmisTablosu onAc={setAcik} />
        </CardContent>
      </Card>

      <MizanDetaySheet mizan={acik} onClose={() => setAcik(null)} />
    </>
  )
}
