import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  FolderOpenIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"

import {
  AramaKutusu,
  FiltreAlani,
  FiltreSheet,
  GorunumToggle,
  ListeAraclari,
} from "@/components/shared/liste-araclari"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DosyaGrid,
  DosyaTablo,
} from "@/features/arsiv/components/dosya-listesi"
import type { DosyaIslemleri } from "@/features/arsiv/components/dosya-islemleri"
import {
  ARSIV_SAYFA_BOYUTU,
  GECERLILIK_FILTRE_ETIKET,
  type ArsivParams,
  type useArsivParams,
} from "@/features/arsiv/hooks/use-arsiv-params"
import { useArsivList } from "@/features/arsiv/queries"
import { formatDonem } from "@prime/shared/lib/format"
import type { ArsivSiralama, SiralamaYonu } from "@prime/shared/types/api"

const SIRALAMA_ETIKET = {
  "ad:asc": "Ad (A → Z)",
  "ad:desc": "Ad (Z → A)",
  "yuklemeTarihi:desc": "Yükleme tarihi (en yeni)",
  "yuklemeTarihi:asc": "Yükleme tarihi (en eski)",
  "boyut:desc": "Boyut (en büyük)",
  "boyut:asc": "Boyut (en küçük)",
  "gecerlilikTarihi:asc": "Geçerlilik (en yakın)",
  "gecerlilikTarihi:desc": "Geçerlilik (en uzak)",
} satisfies Record<`${ArsivSiralama}:${SiralamaYonu}`, string>

type Siralama = keyof typeof SIRALAMA_ETIKET

const TUMU = "__tumu__"

const GECERLILIK_SECENEKLERI = {
  [TUMU]: "Tüm belgeler",
  ...GECERLILIK_FILTRE_ETIKET,
}

type GecerlilikSecimi = keyof typeof GECERLILIK_SECENEKLERI
type Update = ReturnType<typeof useArsivParams>["update"]

/**
 * Arama solda; sağda (varsa) klasör düğmesi, sıralama sheet'i, görünüm toggle'ı ve yükle.
 * Mobilde iki satıra iner: arama / düğmeler.
 */
export function ArsivAraclari({
  params,
  update,
  onYukle,
  baslangic,
}: {
  params: ArsivParams
  update: Update
  /** Verilirse araç çubuğunda "Yükle" düğmesi gösterilir */
  onYukle?: () => void
  /** Düğme grubunun başına eklenen öğe (ör. mobilde klasör düğmesi) */
  baslangic?: ReactNode
}) {
  const siralama = `${params.sirala}:${params.yon}` as Siralama
  return (
    <ListeAraclari
      etiket="Dosya filtreleri"
      arama={
        <AramaKutusu
          etiket="Dosya ara"
          placeholder="Dosya ara"
          value={params.q}
          onChange={(q) => update({ q })}
        />
      }
    >
      <div className="flex items-center gap-2">{baslangic}</div>
      <div className="flex items-center gap-2">
        <FiltreSheet
          deger={{
            siralama,
            gecerlilik: (params.gecerlilik ?? TUMU) as GecerlilikSecimi,
          }}
          varsayilan={{
            siralama: "ad:asc" as Siralama,
            gecerlilik: TUMU as GecerlilikSecimi,
          }}
          // Sıralama "filtre" sayılmaz; rozet yalnızca geçerlilik için
          aktifSayi={params.gecerlilik ? 1 : 0}
          onUygula={({ siralama, gecerlilik }) => {
            const [sirala, yon] = siralama.split(":") as [
              ArsivSiralama,
              SiralamaYonu,
            ]
            update({
              sirala,
              yon,
              gecerlilik: gecerlilik === TUMU ? null : gecerlilik,
            })
          }}
        >
          {(taslak, degistir) => (
            <>
              {!params.cop && (
                <FiltreAlani etiket="Geçerlilik" htmlFor="filtre-gecerlilik">
                  <Select
                    items={GECERLILIK_SECENEKLERI}
                    value={taslak.gecerlilik}
                    onValueChange={(v) =>
                      v && degistir({ gecerlilik: v as GecerlilikSecimi })
                    }
                  >
                    <SelectTrigger id="filtre-gecerlilik" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(GECERLILIK_SECENEKLERI).map(([k, ad]) => (
                        <SelectItem key={k} value={k}>
                          {ad}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FiltreAlani>
              )}
              <FiltreAlani etiket="Sıralama" htmlFor="filtre-siralama">
                <Select
                  items={SIRALAMA_ETIKET}
                  value={taslak.siralama}
                  onValueChange={(v) =>
                    v && degistir({ siralama: v as Siralama })
                  }
                >
                  <SelectTrigger id="filtre-siralama" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SIRALAMA_ETIKET).map(([k, ad]) => (
                      <SelectItem key={k} value={k}>
                        {ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FiltreAlani>
            </>
          )}
        </FiltreSheet>
        <GorunumToggle
          value={params.gorunum}
          onChange={(gorunum) => update({ gorunum })}
        />
        {onYukle && !params.cop && (
          <Button onClick={onYukle} aria-label="Dosya yükle">
            <HugeiconsIcon
              icon={Upload04Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="max-sm:sr-only">Yükle</span>
          </Button>
        )}
      </div>
    </ListeAraclari>
  )
}

/** Seçili klasörün dosyaları: yükleniyor / boş / hata / ızgara / liste. */
export function DosyaAlani({
  params,
  mukellefId,
  islemler,
  gosterMukellef,
  onYukle,
  onSayfa,
  onDonemKaldir,
}: {
  params: ArsivParams
  mukellefId?: string
  islemler: DosyaIslemleri
  gosterMukellef: boolean
  onYukle?: () => void
  onSayfa: (sayfa: number) => void
  onDonemKaldir: () => void
}) {
  const liste = useArsivList({
    mukellefId,
    kategori: params.cop ? undefined : params.kategori,
    q: params.q || undefined,
    sirala: params.sirala,
    yon: params.yon,
    cop: params.cop || undefined,
    gecerlilik: params.cop ? undefined : params.gecerlilik,
    donem: params.cop ? undefined : params.donem,
    sayfa: params.sayfa,
    sayfaBoyutu: ARSIV_SAYFA_BOYUTU,
  })

  const donemFiltresi = params.donem && !params.cop && (
    <p className="text-sm text-muted-foreground">
      Yalnızca {formatDonem(params.donem)} dönemine bağlı belgeler gösteriliyor.{" "}
      <button type="button" className="underline" onClick={onDonemKaldir}>
        Dönem filtresini kaldır
      </button>
    </p>
  )

  if (liste.isError)
    return <ErrorState error={liste.error} onRetry={() => liste.refetch()} />

  if (liste.isPending)
    return (
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
        aria-busy="true"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )

  const { items, total, sayfa } = liste.data
  if (total === 0) {
    if (params.cop)
      return <EmptyState icon={Delete02Icon} title="Çöp kutusu boş" />
    return (
      <>
        {donemFiltresi}
        <EmptyState
          icon={FolderOpenIcon}
          title={
            params.q || params.gecerlilik || params.donem
              ? "Filtreyle eşleşen dosya yok"
              : "Bu klasörde dosya yok"
          }
          action={
            onYukle &&
            !params.q &&
            !params.gecerlilik &&
            !params.donem && (
              <Button size="sm" onClick={onYukle}>
                <HugeiconsIcon
                  icon={Upload04Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Dosya yükle
              </Button>
            )
          }
        />
      </>
    )
  }

  const props = {
    dosyalar: items,
    islemler,
    gosterMukellef,
    cop: params.cop,
  }
  return (
    <>
      {donemFiltresi}
      {params.gorunum === "liste" ? (
        <DosyaTablo {...props} />
      ) : (
        <DosyaGrid {...props} />
      )}
      <Sayfalama
        total={total}
        sayfa={sayfa}
        sayfaBoyutu={ARSIV_SAYFA_BOYUTU}
        birim="dosyadan"
        onChange={(s) => onSayfa(s)}
      />
    </>
  )
}
