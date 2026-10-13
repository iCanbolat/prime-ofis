import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  BordroDurumBadge,
  BordroUyariBadge,
} from "@/features/bordro/components/bordro-rozetleri"
import { DosyaIkonu } from "@/features/arsiv/components/dosya-gorsel"
import {
  OnizlemeDialog,
  type OnizlenecekDosya,
} from "@/features/arsiv/components/onizleme-dialog"
import { formatBoyut } from "@prime/shared/arsiv/kurallar"
import { BORDRO_DURUM_SIRASI } from "@prime/shared/bordro/kurallar"
import {
  BORDRO_BELGE_ETIKET,
  BORDRO_BELGE_KISA,
  BORDRO_DURUM_ETIKET,
} from "@prime/shared/bordro/sabitler"
import { BordroOzetDialog } from "@/features/bordro/components/bordro-ozet-dialog"
import { BordroBelgeEkleDialog } from "@/features/bordro/components/yuklenecek-belgeler"
import {
  useBordroCalisanUygula,
  useBordroDetay,
  useBordroGuncelle,
} from "@/features/bordro/queries"
import { TalepDurumBadge } from "@/features/evrak-talebi/components/talep-rozetleri"
import { KontrolListesi } from "@/features/ice-aktarim/components/mizan-detay-sheet"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import type { BordroDetay } from "@prime/shared/types/api"
import type { BordroOzeti, BordroSaklananDurum } from "@prime/shared/types/domain"

const DURUM_ITEMS = Object.fromEntries(
  BORDRO_DURUM_SIRASI.map((d) => [d, BORDRO_DURUM_ETIKET[d]])
)

const OZET_ALANLARI: [keyof BordroOzeti, string, boolean][] = [
  ["calisanSayisi", "Çalışan", false],
  ["brutToplam", "Brüt toplam", true],
  ["netToplam", "Net toplam", true],
  ["sgkIsciPayi", "SGK işçi payı", true],
  ["sgkIsverenPayi", "SGK işveren payı", true],
  ["issizlikToplam", "İşsizlik sigortası", true],
  ["gelirVergisi", "Gelir vergisi", true],
  ["damgaVergisi", "Damga vergisi", true],
]

function Icerik({
  detay,
  onPuantajIste,
}: {
  detay: BordroDetay
  onPuantajIste: () => void
}) {
  const { satir } = detay
  const guncelle = useBordroGuncelle()
  const [not, setNot] = useState(satir.not ?? "")
  const [ozetAcik, setOzetAcik] = useState(false)
  const [belgeEkleAcik, setBelgeEkleAcik] = useState(false)
  const [onizlenen, setOnizlenen] = useState<OnizlenecekDosya | null>(null)
  const hedef = {
    mukellefId: satir.mukellefId,
    donem: satir.donem,
    mukellefUnvan: satir.mukellefUnvan,
  }
  const calisanUygula = useBordroCalisanUygula()
  const calisanFarki = detay.kontroller.some(
    (k) => k.kod === "CALISAN" && k.durum === "UYARI"
  )
  const kaydet = (
    degisim: {
      durum?: BordroSaklananDurum
      not?: string
      degisiklikYok?: boolean
    },
    basari?: string
  ) =>
    // mutateAsync: güncellemeden sonra içerik yeniden kurulur (key), çağrı yeri
    // callback'leri çalışmazdı
    guncelle
      .mutateAsync({
        mukellefId: satir.mukellefId,
        donem: satir.donem,
        ...degisim,
      })
      .then(
        () => basari && toast.success(basari),
        (error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Kaydedilemedi")
      )
  const beyanVerildi = satir.durum === "BEYAN_VERILDI"

  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">MUHSGK son gün</dt>
          <dd className="font-medium tabular-nums">
            {formatDate(satir.sonTarih)}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Kalan süre</dt>
          <dd className="font-medium">
            {beyanVerildi
              ? "Beyan verildi"
              : satir.kalanIsGunu < 0
                ? `${-satir.kalanIsGunu} iş günü geçti`
                : `${satir.kalanIsGunu} iş günü`}
          </dd>
        </div>
      </dl>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">Durum</h3>
        {beyanVerildi ? (
          <p className="text-sm text-muted-foreground">
            MUHSGK beyanı takvimde onaylandığı için bordro dönemi tamamlandı.
          </p>
        ) : (
          <Select
            items={DURUM_ITEMS}
            value={satir.durum}
            onValueChange={(v) =>
              v && kaydet({ durum: v as BordroSaklananDurum })
            }
          >
            <SelectTrigger className="w-full" aria-label="Bordro durumu">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BORDRO_DURUM_SIRASI.map((d) => (
                <SelectItem key={d} value={d}>
                  {BORDRO_DURUM_ETIKET[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">Puantaj girdisi</h3>
        {satir.degisiklikYok && (
          <p className="rounded-2xl bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
            Mükellef bu ay puantajda değişiklik olmadığını bildirdi; bordro
            geçen ayın verisiyle hazırlanır.
          </p>
        )}
        {satir.girdiTalepId ? (
          <div className="flex items-center gap-2 text-sm">
            <Link
              to={`/evrak-talepleri?talep=${satir.girdiTalepId}`}
              className="underline"
            >
              Evrak talebini aç
            </Link>
            {satir.girdiTalepDurum && (
              <TalepDurumBadge durum={satir.girdiTalepDurum} />
            )}
          </div>
        ) : (
          !satir.degisiklikYok && (
            <p className="text-sm text-muted-foreground">
              Bu dönem için puantaj talebi yok.
            </p>
          )
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onPuantajIste}>
            Puantaj iste
          </Button>
          {!beyanVerildi && (
            <Button
              variant="outline"
              size="sm"
              disabled={guncelle.isPending}
              onClick={() =>
                satir.degisiklikYok
                  ? kaydet({ degisiklikYok: false })
                  : kaydet(
                      { degisiklikYok: true },
                      "Değişiklik yok olarak işaretlendi"
                    )
              }
            >
              {satir.degisiklikYok
                ? "“Değişiklik yok” işaretini kaldır"
                : "Değişiklik yok"}
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">Not</h3>
        <Textarea
          value={not}
          onChange={(e) => setNot(e.target.value)}
          onBlur={() => not.trim() !== (satir.not ?? "") && kaydet({ not })}
          maxLength={500}
          placeholder="Ör. 2 yeni işe giriş, 1 rapor"
          aria-label="Bordro notu"
        />
      </section>

      <section className="grid gap-2">
        <h3 className="font-heading text-sm font-medium">Dönem özeti</h3>
        {!satir.ozet && (
          <p className="text-sm text-muted-foreground">
            Bordro dökümünü (Excel, CSV veya PDF) yükleyerek dönem toplamlarını
            kaydedin; tahakkuk ve mizanla otomatik karşılaştırılır.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setOzetAcik(true)}
        >
          {satir.ozet ? "Dökümü yeniden yükle" : "Bordro dökümünü yükle"}
        </Button>
        <BordroOzetDialog
          hedef={ozetAcik ? hedef : null}
          onClose={() => setOzetAcik(false)}
        />
      </section>

      {satir.ozet && (
        <section className="grid gap-2">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {OZET_ALANLARI.map(([alan, etiket, para]) => (
              <div
                key={alan}
                className="grid gap-0.5 rounded-2xl bg-muted/40 px-3 py-2"
              >
                <dt className="text-xs text-muted-foreground">{etiket}</dt>
                <dd className="font-medium tabular-nums">
                  {para ? formatTRY(satir.ozet![alan]) : satir.ozet![alan]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="grid gap-2" aria-labelledby="bordro-belgeler">
        <div className="flex items-center justify-between gap-2">
          <h3 id="bordro-belgeler" className="font-heading text-sm font-medium">
            Dönem belgeleri
          </h3>
          <Link
            to={`/arsiv?mukellef=${satir.mukellefId}&kategori=BORDRO&donem=${satir.donem}`}
            className="text-xs underline"
          >
            Arşivde aç
          </Link>
        </div>
        {detay.belgeler.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Bu döneme bağlı belge yok. Bordro dökümü, pusulalar, imzalı bordro
            ve dekontlar arşive bu dönemle kaydedilince burada listelenir.
          </p>
        ) : (
          <ul className="grid gap-1" aria-label="Dönem belgeleri">
            {detay.belgeler.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() =>
                    setOnizlenen({
                      id: b.id,
                      ad: b.ad,
                      mimeType: b.mimeType,
                      kaynak: "arsiv",
                      aciklama: `${satir.mukellefUnvan} · ${formatDonem(satir.donem)} · ${BORDRO_BELGE_ETIKET[b.tur]}`,
                    })
                  }
                >
                  <DosyaIkonu mimeType={b.mimeType} className="size-8" />
                  <span className="grid min-w-0 flex-1 leading-snug">
                    <span className="truncate text-sm">{b.ad}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(b.yuklemeTarihi)} · {formatBoyut(b.boyut)}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0"
                    title={BORDRO_BELGE_ETIKET[b.tur]}
                  >
                    {BORDRO_BELGE_KISA[b.tur]}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setBelgeEkleAcik(true)}
        >
          Belge ekle
        </Button>
        <BordroBelgeEkleDialog
          hedef={belgeEkleAcik ? hedef : null}
          onClose={() => setBelgeEkleAcik(false)}
        />
        <OnizlemeDialog dosya={onizlenen} onClose={() => setOnizlenen(null)} />
      </section>

      {detay.kontroller.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-heading text-sm font-medium">Kontroller</h3>
          <KontrolListesi kontroller={detay.kontroller} />
          {calisanFarki && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={calisanUygula.isPending}
              onClick={() =>
                calisanUygula.mutate(
                  { mukellefId: satir.mukellefId, donem: satir.donem },
                  {
                    onSuccess: () =>
                      toast.success(
                        "Çalışan sayısı mükellef kartına uygulandı"
                      ),
                    onError: (error) => toast.error(error.message),
                  }
                )
              }
            >
              Çalışan sayısını mükellef kartına uygula
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

export function BordroDetaySheet({
  hedef,
  onClose,
  onPuantajIste,
}: {
  hedef: { mukellefId: string; donem: string } | undefined
  onClose: () => void
  onPuantajIste: (hedef: { mukellefId: string; donem: string }) => void
}) {
  const detay = useBordroDetay(hedef?.mukellefId, hedef?.donem)
  return (
    <Sheet open={Boolean(hedef)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        {hedef && (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle>
                {detay.data?.satir.mukellefUnvan ?? "Bordro"} ·{" "}
                {formatDonem(hedef.donem)}
              </SheetTitle>
              <SheetDescription render={<div />}>
                {detay.data && (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <BordroDurumBadge durum={detay.data.satir.durum} />
                    <BordroUyariBadge uyari={detay.data.satir.uyari} />
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>
            {detay.isPending ? (
              <LoadingState />
            ) : detay.isError ? (
              <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
            ) : (
              <Icerik
                key={`${hedef.mukellefId}:${hedef.donem}:${detay.data.satir.guncellemeTarihi ?? ""}`}
                detay={detay.data}
                onPuantajIste={() => onPuantajIste(hedef)}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
