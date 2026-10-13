import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon } from "@hugeicons/core-free-icons"

import { FileDropzone } from "@/components/shared/file-dropzone"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"
import { sablonIndir } from "@/features/ice-aktarim/sablon-indir"
import type {
  Hucre,
  OkunanSatir,
  SatirDurumu,
  SutunTanimi,
} from "@prime/shared/ice-aktarim/sutun-eslestir"
import { cn } from "@/lib/utils"
import type { TopluAktarimSonucu } from "@prime/shared/types/api"

const DURUM: Record<SatirDurumu, { etiket: string; className: string }> = {
  aktarilacak: {
    etiket: "Aktarılacak",
    className:
      "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  atlanacak: {
    etiket: "Atlanacak",
    className: "border-transparent bg-muted text-muted-foreground",
  },
  hatali: {
    etiket: "Hatalı",
    className: "border-transparent bg-destructive/10 text-destructive",
  },
}

interface TopluAktarimProps<T> {
  baslik: string
  aciklama: ReactNode
  sablon: { dosyaAdi: string; sutunlar: readonly SutunTanimi[] }
  /** Dosyadan önce seçilecek ayarlar (varsayılan sorumlu, üzerine yaz…) */
  ayarlar?: ReactNode
  /**
   * Satırları önizlemeye çevirir. Ayarlar değişince önizleme yeniden hesaplansın diye
   * çağıran `useCallback` ile bağımlılıklarını vermelidir. Hata atarsa mesajı gösterilir.
   */
  oku: (satirlar: Hucre[][]) => OkunanSatir<T>[]
  /** Eşleştirme için gereken veriler (mükellefler, personel) yüklendi mi */
  hazir: boolean
  aktariliyor: boolean
  aktar: (
    kayitlar: (OkunanSatir<T> & { veri: T })[]
  ) => Promise<TopluAktarimSonucu>
  /** Aktarım bittikten sonra sonuç kutusunda gösterilir */
  sonNot?: ReactNode
}

/**
 * Hızlı başlangıç aktarımlarının ortak akışı: şablon indir → dosya seç → önizle → aktar → sonuç.
 * Dosya tarayıcıda okunur; sunucuya yalnızca "Aktarılacak" satırların verisi gider.
 */
export function TopluAktarim<T>({
  baslik,
  aciklama,
  sablon,
  ayarlar,
  oku,
  hazir,
  aktariliyor,
  aktar,
  sonNot,
}: TopluAktarimProps<T>) {
  const [dosya, setDosya] = useState<{
    ad: string
    satirlar: Hucre[][]
  } | null>(null)
  const [okunuyor, setOkunuyor] = useState(false)
  const [dosyaHatasi, setDosyaHatasi] = useState<string>()
  const [yalnizSorunlu, setYalnizSorunlu] = useState(false)
  const [sonuc, setSonuc] = useState<TopluAktarimSonucu | null>(null)

  const okuma = useMemo(() => {
    if (!dosya) return null
    try {
      return { satirlar: oku(dosya.satirlar) }
    } catch (error) {
      return {
        hata: error instanceof Error ? error.message : "Dosya okunamadı",
      }
    }
  }, [dosya, oku])

  const dosyaSec = async ([f]: File[]) => {
    if (!f) return
    setOkunuyor(true)
    setDosyaHatasi(undefined)
    setSonuc(null)
    try {
      setDosya({ ad: f.name, satirlar: await tabloSatirlari(f) })
    } catch {
      setDosyaHatasi("Dosya okunamadı. Excel (.xlsx, .xls) veya CSV olmalı.")
    } finally {
      setOkunuyor(false)
    }
  }

  const satirlar = okuma?.satirlar ?? []
  const sayi = (d: SatirDurumu) => satirlar.filter((s) => s.durum === d).length
  const aktarilacak = satirlar.filter(
    (s): s is OkunanSatir<T> & { veri: T } =>
      s.durum === "aktarilacak" && s.veri !== undefined
  )
  const gorunen = yalnizSorunlu
    ? satirlar.filter((s) => s.durum !== "aktarilacak" || s.mesajlar.length)
    : satirlar

  const gonder = async () => {
    try {
      const s = await aktar(aktarilacak)
      setSonuc(s)
      setDosya(null)
      toast.success(`${s.olusturulan + s.guncellenen} kayıt aktarıldı`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aktarılamadı")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{baslik}</CardTitle>
        <CardDescription>{aciklama}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sablonIndir(sablon.dosyaAdi, sablon.sutunlar)}
          >
            <HugeiconsIcon
              icon={Download04Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Şablonu indir
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {ayarlar}

        {sonuc && (
          <Alert>
            <AlertTitle>Aktarım tamamlandı</AlertTitle>
            <AlertDescription className="grid gap-2">
              <p>
                {sonuc.olusturulan} yeni kayıt
                {sonuc.guncellenen > 0 && ` · ${sonuc.guncellenen} güncellendi`}
                {sonuc.atlanan > 0 && ` · ${sonuc.atlanan} atlandı`}
                {sonuc.hatalar.length > 0 && ` · ${sonuc.hatalar.length} hata`}
              </p>
              {sonuc.hatalar.length > 0 && (
                <ul className="list-disc pl-5">
                  {sonuc.hatalar.map((h) => (
                    <li key={h.satir}>
                      Satır {h.satir}: {h.mesaj}
                    </li>
                  ))}
                </ul>
              )}
              {sonNot}
            </AlertDescription>
          </Alert>
        )}

        {okuma?.satirlar ? (
          <div className="grid gap-3 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-0.5">
                <span className="font-medium">{dosya?.ad}</span>
                <span
                  className="text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {sayi("aktarilacak")} aktarılacak · {sayi("atlanacak")}{" "}
                  atlanacak · {sayi("hatali")} hatalı
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDosya(null)}>
                  Vazgeç
                </Button>
                <Button
                  disabled={aktarilacak.length === 0 || aktariliyor}
                  onClick={gonder}
                >
                  {aktariliyor && <Spinner data-icon="inline-start" />}
                  {aktarilacak.length} kaydı aktar
                </Button>
              </div>
            </div>
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id="yalniz-sorunlu"
                checked={yalnizSorunlu}
                onCheckedChange={setYalnizSorunlu}
              />
              <FieldLabel htmlFor="yalniz-sorunlu">
                Yalnızca uyarı veya hata içeren satırlar
              </FieldLabel>
            </Field>
            <div className="max-h-[28rem] overflow-auto rounded-xl border">
              <Table aria-label="Aktarım önizlemesi">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Satır</TableHead>
                    <TableHead>Kayıt</TableHead>
                    <TableHead className="w-28">Durum</TableHead>
                    <TableHead>Açıklama</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gorunen.map((s, i) => (
                    <TableRow key={`${s.satir}-${i}`}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {s.satir}
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-medium">
                        {s.etiket}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={DURUM[s.durum].className}
                        >
                          {DURUM[s.durum].etiket}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm whitespace-normal",
                          s.durum === "hatali"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {s.mesajlar.join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : okunuyor || (dosya && !hazir) ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Dosya okunuyor…
          </span>
        ) : (
          <FileDropzone
            accept=".xlsx,.xls,.csv"
            multiple={false}
            disabled={!hazir}
            onFiles={dosyaSec}
            hint="Excel (.xlsx, .xls) veya CSV · ilk sayfa okunur · dosya sunucuya yüklenmez"
          />
        )}
        {(dosyaHatasi || okuma?.hata) && (
          <FieldError>{dosyaHatasi ?? okuma?.hata}</FieldError>
        )}
      </CardContent>
    </Card>
  )
}
