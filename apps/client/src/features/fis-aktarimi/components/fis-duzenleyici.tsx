import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  Delete02Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons"

import { DatePicker } from "@/components/shared/date-picker"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DosyaIcerigi } from "@/features/arsiv/components/onizleme-dialog"
import { FisDurumBadge } from "@/features/fis-aktarimi/components/fis-rozetleri"
import {
  fisHatalari,
  fisToplamlari,
  tutarOku,
} from "@prime/shared/fis-aktarimi/kurallar"
import {
  useFis,
  useFisGuncelle,
  useFisOnayla,
  useFisTaslagaAl,
  useYenidenOku,
} from "@/features/fis-aktarimi/queries"
import {
  FIS_BELGE_TURU_ETIKET,
  ODEME_ETIKET,
} from "@prime/shared/fis-aktarimi/sabitler"
import { formatDate, formatTRY } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { FisDetay } from "@prime/shared/types/api"
import type { FisBelgeTuru, FisSatiri } from "@prime/shared/types/domain"

/** Düzenleme sırasında tutarlar metin olarak tutulur ("1.250,50" da kabul edilir) */
interface DuzenSatiri {
  hesapKodu: string
  aciklama: string
  borc: string
  alacak: string
  eslemeAnahtari?: string
}

const tutarYaz = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "")

const duzenSatiri = (s: FisSatiri): DuzenSatiri => ({
  hesapKodu: s.hesapKodu,
  aciklama: s.aciklama,
  borc: tutarYaz(s.borc),
  alacak: tutarYaz(s.alacak),
  eslemeAnahtari: s.eslemeAnahtari,
})

const fisSatiri = (s: DuzenSatiri): FisSatiri => ({
  hesapKodu: s.hesapKodu.trim(),
  aciklama: s.aciklama.trim(),
  borc: tutarOku(s.borc) || 0,
  alacak: tutarOku(s.alacak) || 0,
  eslemeAnahtari: s.eslemeAnahtari,
})

function OkumaOzeti({ fis }: { fis: FisDetay }) {
  const { okuma } = fis
  if (okuma.fis)
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Satıcı</dt>
          <dd className="font-medium">{okuma.fis.saticiUnvan}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">VKN</dt>
          <dd className="tabular-nums">{okuma.fis.saticiVkn ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Belge</dt>
          <dd>
            {okuma.fis.belgeNo} · {formatDate(okuma.fis.belgeTarihi)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Toplam</dt>
          <dd className="tabular-nums">{formatTRY(okuma.fis.toplam)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ödeme</dt>
          <dd>{ODEME_ETIKET[okuma.fis.odeme]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Okuma güveni</dt>
          <dd className="tabular-nums">%{Math.round(okuma.fis.guven * 100)}</dd>
        </div>
      </dl>
    )
  if (okuma.ekstre)
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Banka</dt>
          <dd className="font-medium">{okuma.ekstre.banka}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dönem</dt>
          <dd>
            {formatDate(okuma.ekstre.donemBas)} –{" "}
            {formatDate(okuma.ekstre.donemSon)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hareket</dt>
          <dd className="tabular-nums">
            {okuma.ekstre.hareketler.length}
            {fis.parca && ` (parça ${fis.parca})`}
          </dd>
        </div>
      </dl>
    )
  return null
}

function Duzenleyici({ fis, onClose }: { fis: FisDetay; onClose: () => void }) {
  const guncelle = useFisGuncelle()
  const onayla = useFisOnayla()
  const taslagaAl = useFisTaslagaAl()
  const yenidenOku = useYenidenOku()
  const [tarih, setTarih] = useState(fis.tarih)
  const [aciklama, setAciklama] = useState(fis.aciklama)
  const [evrakNo, setEvrakNo] = useState(fis.evrakNo ?? "")
  const [belgeTuru, setBelgeTuru] = useState<FisBelgeTuru>(
    fis.belgeTuru ?? "MF"
  )
  const [satirlar, setSatirlar] = useState(() => fis.satirlar.map(duzenSatiri))
  const [kirli, setKirli] = useState(false)

  const salt = fis.durum !== "TASLAK"
  const temiz = satirlar.map(fisSatiri)
  const gecersizTutar = satirlar.some(
    (s) => Number.isNaN(tutarOku(s.borc)) || Number.isNaN(tutarOku(s.alacak))
  )
  const toplam = fisToplamlari(temiz)
  const hatalar = [
    ...(gecersizTutar ? ["Geçersiz tutar var"] : []),
    ...fisHatalari({ tarih, satirlar: temiz }),
  ]
  const bekliyor = guncelle.isPending || onayla.isPending || taslagaAl.isPending

  const degistir = (i: number, patch: Partial<DuzenSatiri>) => {
    setKirli(true)
    setSatirlar((onceki) =>
      onceki.map((s, j) => (j === i ? { ...s, ...patch } : s))
    )
  }

  const kaydet = async () => {
    await guncelle.mutateAsync({
      id: fis.id,
      tarih,
      aciklama,
      evrakNo: evrakNo || undefined,
      evrakTarihi: fis.evrakTarihi,
      belgeTuru,
      satirlar: temiz,
    })
    setKirli(false)
  }

  const kaydetTikla = () =>
    kaydet().then(
      () => toast.success("Fiş kaydedildi"),
      (e: Error) => toast.error(e.message)
    )

  const onaylaTikla = async () => {
    try {
      if (kirli) await kaydet()
      await onayla.mutateAsync(fis.id)
      toast.success("Fiş onaylandı; Luca aktarımına hazır")
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <div className="@container min-h-0 flex-1 overflow-y-auto px-4">
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-label="Belge" className="grid content-start gap-3">
            <DosyaIcerigi
              dosya={{
                id: fis.gelenId,
                ad: fis.gelenAd,
                mimeType: fis.gelenMimeType,
                aciklama: "",
                kaynak: "gelen",
              }}
            />
            <OkumaOzeti fis={fis} />
          </section>

          <section
            aria-label="Muhasebe fişi"
            className="grid content-start gap-3"
          >
            {fis.uyarilar.length > 0 && (
              <Alert>
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
                <AlertTitle>Kontrol edin</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {fis.uyarilar.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 @xl:grid-cols-[11rem_minmax(0,1fr)_9rem] @4xl:grid-cols-[11rem_minmax(0,1fr)_9rem_12rem]">
              <Field>
                <FieldLabel htmlFor="fis-tarih">Fiş tarihi</FieldLabel>
                <DatePicker
                  id="fis-tarih"
                  value={tarih}
                  disabled={salt}
                  onChange={(v) => {
                    setTarih(v)
                    setKirli(true)
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fis-aciklama">Fiş açıklaması</FieldLabel>
                <Input
                  id="fis-aciklama"
                  value={aciklama}
                  disabled={salt}
                  onChange={(e) => {
                    setAciklama(e.target.value)
                    setKirli(true)
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fis-evrak">Evrak no</FieldLabel>
                <Input
                  id="fis-evrak"
                  value={evrakNo}
                  disabled={salt}
                  onChange={(e) => {
                    setEvrakNo(e.target.value)
                    setKirli(true)
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fis-belge-turu">Belge türü</FieldLabel>
                <Select
                  items={FIS_BELGE_TURU_ETIKET}
                  value={belgeTuru}
                  disabled={salt}
                  onValueChange={(v) => {
                    if (!v) return
                    setBelgeTuru(v as FisBelgeTuru)
                    setKirli(true)
                  }}
                >
                  <SelectTrigger id="fis-belge-turu" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIS_BELGE_TURU_ETIKET) as FisBelgeTuru[]).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {FIS_BELGE_TURU_ETIKET[t]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="overflow-x-auto rounded-2xl border">
              <Table aria-label="Fiş satırları">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Hesap kodu</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead className="w-28 text-right">Borç</TableHead>
                    <TableHead className="w-28 text-right">Alacak</TableHead>
                    {!salt && (
                      <TableHead className="w-10">
                        <span className="sr-only">Sil</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {satirlar.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="p-1">
                        <Input
                          aria-label={`${i + 1}. satır hesap kodu`}
                          value={s.hesapKodu}
                          disabled={salt}
                          placeholder="Hesap"
                          aria-invalid={!s.hesapKodu.trim() || undefined}
                          className="h-8 font-mono tabular-nums"
                          onChange={(e) =>
                            degistir(i, { hesapKodu: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          aria-label={`${i + 1}. satır açıklama`}
                          value={s.aciklama}
                          disabled={salt}
                          className="h-8 min-w-40"
                          onChange={(e) =>
                            degistir(i, { aciklama: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          aria-label={`${i + 1}. satır borç`}
                          inputMode="decimal"
                          value={s.borc}
                          disabled={salt}
                          aria-invalid={
                            Number.isNaN(tutarOku(s.borc)) || undefined
                          }
                          className="h-8 text-right tabular-nums"
                          onChange={(e) =>
                            degistir(i, { borc: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          aria-label={`${i + 1}. satır alacak`}
                          inputMode="decimal"
                          value={s.alacak}
                          disabled={salt}
                          aria-invalid={
                            Number.isNaN(tutarOku(s.alacak)) || undefined
                          }
                          className="h-8 text-right tabular-nums"
                          onChange={(e) =>
                            degistir(i, { alacak: e.target.value })
                          }
                        />
                      </TableCell>
                      {!salt && (
                        <TableCell className="p-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`${i + 1}. satırı sil`}
                            onClick={() => {
                              setKirli(true)
                              setSatirlar((o) => o.filter((_, j) => j !== i))
                            }}
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                            />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-right font-medium">
                      Toplam
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTRY(toplam.borc)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTRY(toplam.alacak)}
                    </TableCell>
                    {!salt && <TableCell />}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {!salt ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setKirli(true)
                    setSatirlar((o) => [
                      ...o,
                      {
                        hesapKodu: "",
                        aciklama: aciklama,
                        borc: "",
                        alacak: "",
                      },
                    ])
                  }}
                >
                  <HugeiconsIcon
                    icon={Add01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Satır ekle
                </Button>
              ) : (
                <span />
              )}
              <p
                role="status"
                className={cn(
                  "text-sm tabular-nums",
                  toplam.fark === 0
                    ? "text-muted-foreground"
                    : "text-destructive"
                )}
              >
                {toplam.fark === 0
                  ? "Borç ve alacak eşit"
                  : `Fark: ${formatTRY(Math.abs(toplam.fark))}`}
              </p>
            </div>

            {!salt && hatalar.length > 0 && (
              <ul
                aria-label="Onayı engelleyen hatalar"
                className="list-disc pl-5 text-sm text-destructive"
              >
                {hatalar.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            {!salt && (
              <p className="text-xs text-muted-foreground">
                Karşı hesabını değiştirdiğiniz satıcı ve ekstre açıklamaları bu
                mükellef için hatırlanır; sonraki belgelerde otomatik gelir.
              </p>
            )}
          </section>
        </div>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
        {fis.durum === "TASLAK" && (
          <Button
            variant="ghost"
            className="mr-auto"
            disabled={yenidenOku.isPending}
            onClick={() =>
              yenidenOku.mutate(fis.okumaId, {
                onSuccess: () => {
                  toast.success("Belge yeniden okunuyor")
                  onClose()
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <HugeiconsIcon
              icon={RepeatIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Yeniden oku
          </Button>
        )}
        {fis.durum === "TASLAK" && (
          <>
            <Button
              variant="outline"
              disabled={!kirli || bekliyor || gecersizTutar}
              onClick={kaydetTikla}
            >
              Kaydet
            </Button>
            <Button
              disabled={hatalar.length > 0 || bekliyor}
              onClick={onaylaTikla}
            >
              Onayla
            </Button>
          </>
        )}
        {fis.durum === "ONAYLANDI" && (
          <Button
            variant="outline"
            disabled={bekliyor}
            onClick={() =>
              taslagaAl.mutate(fis.id, {
                onSuccess: () => toast.success("Fiş taslağa alındı"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Taslağa al
          </Button>
        )}
        {fis.durum === "AKTARILDI" && (
          <p className="text-sm text-muted-foreground">
            {fis.aktarimDosyaAdi} ile Luca'ya aktarıldı. Düzeltmek için aktarımı
            geri alın.
          </p>
        )}
      </SheetFooter>
    </>
  )
}

/** Fiş taslağını belge önizlemesiyle yan yana açar */
export function FisDuzenleyici({
  fisId,
  onClose,
}: {
  fisId: string | null
  onClose: () => void
}) {
  const fis = useFis(fisId ?? undefined)
  return (
    <Sheet open={Boolean(fisId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-6xl">
        <SheetHeader className="pr-14">
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">
              {fis.data?.aciklama ?? "Muhasebe fişi"}
            </span>
            {fis.data && <FisDurumBadge durum={fis.data.durum} />}
          </SheetTitle>
          <SheetDescription>
            {fis.data
              ? `${fis.data.mukellefUnvan} · ${fis.data.gelenAd}`
              : "Yükleniyor…"}
          </SheetDescription>
        </SheetHeader>
        {fis.isError ? (
          <div className="px-4">
            <ErrorState error={fis.error} onRetry={() => fis.refetch()} />
          </div>
        ) : !fis.data ? (
          <LoadingState />
        ) : (
          <Duzenleyici
            key={`${fis.data.id}:${fis.data.durum}`}
            fis={fis.data}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
