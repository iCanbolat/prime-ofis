import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"
import { FileValidationIcon } from "@hugeicons/core-free-icons"

import { FileDropzone } from "@/components/shared/file-dropzone"
import { SekmeFiltre } from "@/components/shared/liste-araclari"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"
import { KesintiDurumBadge } from "@/features/tahsilat/components/tahsilat-rozetleri"
import {
  KesintiOkumaHatasi,
  kesintiListesiOku,
  type KesintiDurum,
  type KesintiOkuma,
} from "@prime/shared/tahsilat/kurallar"
import {
  useKesintiIceAktar,
  useKesintiRaporu,
} from "@/features/tahsilat/queries"
import {
  KESINTI_DURUM_ACIKLAMA,
  KESINTI_DURUM_ETIKET,
} from "@prime/shared/tahsilat/sabitler"
import { formatDateTime, formatDonem, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { cn } from "@/lib/utils"

const DURUMLAR = Object.keys(KESINTI_DURUM_ETIKET) as KesintiDurum[]

interface Onizleme extends KesintiOkuma {
  dosyaAdi: string
  yil: number
  yilDisi: number
}

function IceAktarKarti({
  yil,
  onAktarildi,
}: {
  yil: number
  onAktarildi: (yil: number) => void
}) {
  const iceAktar = useKesintiIceAktar()
  const [onizleme, setOnizleme] = useState<Onizleme | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const dosyaOku = async ([dosya]: File[]) => {
    if (!dosya) return
    setHata(null)
    setOnizleme(null)
    try {
      const okuma = kesintiListesiOku(await tabloSatirlari(dosya))
      if (okuma.kayitlar.length === 0)
        throw new KesintiOkumaHatasi("Dosyada okunabilir kesinti satırı yok.")
      // Dosyadaki en yaygın yıl esas alınır
      const sayac = new Map<number, number>()
      for (const k of okuma.kayitlar) {
        const y = Number(k.donem.slice(0, 4))
        sayac.set(y, (sayac.get(y) ?? 0) + 1)
      }
      const dosyaYili = [...sayac.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      setOnizleme({
        ...okuma,
        kayitlar: okuma.kayitlar.filter((k) =>
          k.donem.startsWith(`${dosyaYili}-`)
        ),
        yilDisi: okuma.kayitlar.filter(
          (k) => !k.donem.startsWith(`${dosyaYili}-`)
        ).length,
        dosyaAdi: dosya.name,
        yil: dosyaYili,
      })
    } catch (error) {
      setHata(
        error instanceof KesintiOkumaHatasi
          ? error.message
          : "Dosya okunamadı. Excel (.xlsx, .xls) veya CSV yükleyin."
      )
    }
  }

  const onayla = async () => {
    if (!onizleme) return
    try {
      await iceAktar.mutateAsync({
        yil: onizleme.yil,
        dosyaAdi: onizleme.dosyaAdi,
        kayitlar: onizleme.kayitlar,
      })
      toast.success(
        `${onizleme.yil} kesinti listesi içe aktarıldı (${onizleme.kayitlar.length} satır)`
      )
      setOnizleme(null)
      onAktarildi(onizleme.yil)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İçe aktarılamadı")
    }
  }

  const toplam = onizleme?.kayitlar.reduce((t, k) => t + k.kesinti, 0) ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>İVD kesinti listesini yükle</CardTitle>
        <CardDescription>
          İnteraktif Vergi Dairesi → "Hakkımda yapılan kesintiler" listesini
          Excel olarak indirip yükleyin. Aynı yıl yeniden yüklenirse önceki
          listenin yerine geçer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {onizleme ? (
          <div className="grid gap-3">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Dosya</dt>
                <dd className="truncate font-medium">{onizleme.dosyaAdi}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Yıl</dt>
                <dd className="font-medium tabular-nums">{onizleme.yil}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Satır</dt>
                <dd className="font-medium tabular-nums">
                  {onizleme.kayitlar.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Toplam kesinti
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatTRY(toplam)}
                </dd>
              </div>
            </dl>
            {(onizleme.atlanan > 0 || onizleme.yilDisi > 0) && (
              <p className="text-sm text-muted-foreground">
                {onizleme.atlanan > 0 &&
                  `${onizleme.atlanan} satır okunamadığı için atlandı. `}
                {onizleme.yilDisi > 0 &&
                  `${onizleme.yilDisi} satır başka yıla ait olduğu için alınmayacak.`}
              </p>
            )}
            {onizleme.yil !== yil && (
              <p className="text-sm text-muted-foreground">
                Dosya {onizleme.yil} yılına ait; içe aktarınca o yılın raporu
                açılır.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={onayla} disabled={iceAktar.isPending}>
                {iceAktar.isPending ? "Aktarılıyor…" : "İçe aktar"}
              </Button>
              <Button variant="outline" onClick={() => setOnizleme(null)}>
                Vazgeç
              </Button>
            </div>
          </div>
        ) : (
          <FileDropzone
            accept=".xlsx,.xls,.csv"
            multiple={false}
            onFiles={dosyaOku}
            hint="Excel (.xlsx, .xls) veya CSV · VKN, dönem ve kesinti sütunları"
          />
        )}
        {hata && <FieldError>{hata}</FieldError>}
      </CardContent>
    </Card>
  )
}

export function KesintiPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const yilParam = Number(searchParams.get("yil")) || undefined
  const durumParam = searchParams.get("durum") as KesintiDurum | null
  const durum = durumParam && DURUMLAR.includes(durumParam) ? durumParam : null
  const rapor = useKesintiRaporu(yilParam)

  const ayarla = (degisim: Record<string, string | null>) =>
    setSearchParams(
      (onceki) => {
        const yeni = new URLSearchParams(onceki)
        for (const [k, v] of Object.entries(degisim))
          if (v === null) yeni.delete(k)
          else yeni.set(k, v)
        return yeni
      },
      { replace: true }
    )

  if (rapor.isError)
    return <ErrorState error={rapor.error} onRetry={() => rapor.refetch()} />
  if (!rapor.data) return <LoadingState />
  const r = rapor.data
  const buYil = Number(bugun().slice(0, 4))
  const yillar = [...new Set([buYil, buYil - 1, ...r.yillar, r.yil])].sort(
    (a, b) => b - a
  )
  const yilSecenekleri = Object.fromEntries(
    yillar.map((y) => [String(y), String(y)])
  )
  const gorunen = r.satirlar.filter((s) => !durum || s.durum === durum)
  const sorunlu = r.ozet.EKSIK + r.ozet.FAZLA + r.ozet.BILDIRILMEMIS

  return (
    <>
      <IceAktarKarti
        yil={r.yil}
        onAktarildi={(y) => ayarla({ yil: String(y), durum: null })}
      />

      <Card>
        <CardHeader>
          <CardTitle>{r.yil} kesinti kontrolü</CardTitle>
          <CardDescription>
            {r.iceAktarim
              ? `${r.iceAktarim.dosyaAdi} · ${r.iceAktarim.satirSayisi} satır · ${formatDateTime(r.iceAktarim.zaman)}, ${r.iceAktarim.yukleyenAd}`
              : "Bu yıl için İVD listesi henüz yüklenmedi."}
          </CardDescription>
          <CardAction>
            <Select
              items={yilSecenekleri}
              value={String(r.yil)}
              onValueChange={(v) =>
                v && ayarla({ yil: String(v), durum: null })
              }
            >
              <SelectTrigger size="sm" aria-label="Yıl" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yillar.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!r.iceAktarim ? (
            <EmptyState
              icon={FileValidationIcon}
              title="Karşılaştırılacak liste yok"
              description="İVD listesini yükleyince tahsilattaki ödemelerden beklenen %20 stopaj ile mükellefin bildirdiği kesinti ay ay karşılaştırılır."
            />
          ) : (
            <>
              {sorunlu > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>{sorunlu} satırda uyuşmazlık var</AlertTitle>
                  <AlertDescription>
                    Eksik veya bildirilmemiş kesinti, sene sonunda beyannamede
                    mahsup edilemez. Mükellefin muhtasarını düzeltmesini
                    isteyin.
                  </AlertDescription>
                </Alert>
              )}
              <SekmeFiltre
                etiket="Durum"
                secenekler={
                  Object.fromEntries(
                    DURUMLAR.map((d) => [
                      d,
                      `${KESINTI_DURUM_ETIKET[d]} (${r.ozet[d]})`,
                    ])
                  ) as Record<KesintiDurum, string>
                }
                value={durum}
                onChange={(v) => ayarla({ durum: v })}
              />
              {durum && (
                <p className="text-sm text-muted-foreground">
                  {KESINTI_DURUM_ACIKLAMA[durum]}
                </p>
              )}
              {gorunen.length === 0 ? (
                <EmptyState
                  icon={FileValidationIcon}
                  title="Bu durumda satır yok"
                />
              ) : (
                <div className="overflow-x-auto rounded-3xl border">
                  <Table aria-label="Kesinti karşılaştırması">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mükellef</TableHead>
                        <TableHead>Dönem</TableHead>
                        <TableHead className="text-right">Beklenen</TableHead>
                        <TableHead className="text-right">Bildirilen</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">
                          Fark
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          Durum
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gorunen.map((s) => (
                        <TableRow key={`${s.mukellefId ?? s.vkn}:${s.donem}`}>
                          <TableCell className="max-w-72 whitespace-normal sm:whitespace-nowrap">
                            {s.mukellefId ? (
                              <Link
                                to={`/mukellefler/${s.mukellefId}/tahsilat`}
                                className="line-clamp-2 font-medium hover:underline sm:block sm:truncate"
                              >
                                {s.unvan}
                              </Link>
                            ) : (
                              <span className="line-clamp-2 font-medium sm:block sm:truncate">
                                {s.unvan || "Kayıtsız VKN"}
                              </span>
                            )}
                            <span className="block font-mono text-xs text-muted-foreground">
                              {s.vkn}
                            </span>
                            <KesintiDurumBadge
                              durum={s.durum}
                              className="mt-1 md:hidden"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDonem(s.donem)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatTRY(s.beklenen)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatTRY(s.bildirilen)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "hidden text-right tabular-nums sm:table-cell",
                              s.durum !== "ESLESTI" && "font-medium"
                            )}
                          >
                            {formatTRY(s.fark)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <KesintiDurumBadge durum={s.durum} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
