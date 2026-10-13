import { useState } from "react"
import { format, addDays } from "date-fns"
import { tr } from "date-fns/locale"
import { Link } from "react-router"
import { Calendar03Icon } from "@hugeicons/core-free-icons"

import { ButtonLink } from "@/components/shared/button-link"
import { EmptyState, ErrorState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { YogunlukSeridi } from "@/features/dashboard/components/yogunluk-seridi"
import {
  GorevDurumBadge,
  OncelikIsareti,
} from "@/features/gorev/components/gorev-rozetleri"
import { usePersonelList } from "@/features/auth/queries"
import { OlaySatiri } from "@/features/takvim/components/olay-listesi"
import { formatDate } from "@prime/shared/lib/format"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type { GorevView, TakvimOlayi, TakvimOzetResponse } from "@prime/shared/types/api"

const LISTE_LIMITI = 10

type Sekme = "hafta" | "geciken" | "onay"

type Is =
  | { tur: "beyan"; tarih: string; olay: TakvimOlayi }
  | { tur: "gorev"; tarih: string; gorev: GorevView }

interface SekmeTanimi {
  etiket: string
  aciklama: string
  bos: string
  isler: Is[]
  link: string
}

const beyan = (olay: TakvimOlayi): Is => ({
  tur: "beyan",
  tarih: olay.sonTarih,
  olay,
})
const gorevIsi = (gorev: GorevView): Is => ({
  tur: "gorev",
  tarih: gorev.sonTarih,
  gorev,
})

function GorevSatiri({ gorev }: { gorev: GorevView }) {
  return (
    <li
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]"
      aria-label={`Görev: ${gorev.baslik} ${gorev.mukellefUnvan}`}
    >
      <Badge variant="outline" className="mt-px w-full">
        Görev
      </Badge>
      <div className="grid min-w-0 leading-snug">
        <Link
          to={`/gorevler?gorev=${gorev.id}`}
          className="truncate text-sm font-medium hover:underline"
        >
          {gorev.baslik}
        </Link>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{gorev.mukellefUnvan}</span>
          <OncelikIsareti oncelik={gorev.oncelik} />
        </span>
      </div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-end sm:self-center">
        {gorev.gecikti && <Badge variant="destructive">Gecikti</Badge>}
        <GorevDurumBadge durum={gorev.durum} />
      </div>
    </li>
  )
}

/** Beyan ve görevleri son güne göre gruplar. */
function IsListesi({
  isler,
  bosMesaj,
}: {
  /** `sirala` ile sıralanmış */
  isler: Is[]
  bosMesaj: string
}) {
  const personel = usePersonelList()
  const personelById = new Map((personel.data ?? []).map((p) => [p.id, p]))

  if (isler.length === 0)
    return <EmptyState icon={Calendar03Icon} title={bosMesaj} />

  const gruplar = new Map<string, Is[]>()
  for (const i of isler)
    gruplar.set(i.tarih, [...(gruplar.get(i.tarih) ?? []), i])

  return (
    <div className="grid gap-4">
      {[...gruplar.keys()].map((tarih) => (
        <section key={tarih} aria-label={formatDate(tarih)}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {format(fromYmd(tarih), "d MMMM yyyy, EEEE", { locale: tr })}
          </h3>
          <ul className="divide-y">
            {gruplar
              .get(tarih)!
              .map((i) =>
                i.tur === "beyan" ? (
                  <OlaySatiri
                    key={i.olay.id}
                    olay={i.olay}
                    gosterMukellef
                    personelAdi={personelById.get(i.olay.sorumluPersonelId)}
                  />
                ) : (
                  <GorevSatiri key={i.gorev.id} gorev={i.gorev} />
                )
              )}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Tarihe göre (gecikenlerde yeniden eskiye); aynı gün önce beyanlar. */
function sirala(isler: Is[], tersSira?: boolean) {
  return [...isler].sort((a, b) => {
    const t = tersSira
      ? b.tarih.localeCompare(a.tarih)
      : a.tarih.localeCompare(b.tarih)
    return t || (a.tur === b.tur ? 0 : a.tur === "beyan" ? -1 : 1)
  })
}

/**
 * Panonun ana kartı: takvim yükümlülükleri ve bağımsız görevler tek listede.
 * Beyana bağlı (otomatik) görevler beyan satırında gösterildiği için tekrar listelenmez.
 */
export function YapilacaklarKarti({
  ozet,
  gorevler,
  hata,
  onRetry,
  takvimLinki,
  sorumlu,
  className,
}: {
  ozet: TakvimOzetResponse | undefined
  /** Açık görevler (kapsama göre atanan filtresiyle) */
  gorevler: GorevView[] | undefined
  hata?: unknown
  onRetry: () => void
  /** Takvim liste görünümü sorgusu (sorumlu filtresi dahil) */
  takvimLinki: (sorgu: string) => string
  sorumlu?: string
  className?: string
}) {
  const [sekme, setSekme] = useState<Sekme>("hafta")

  const bugun = ozet?.bugun
  const haftaSonu = bugun ? toYmd(addDays(fromYmd(bugun), 6)) : ""
  const bagimsiz = (gorevler ?? []).filter((g) => !g.otomatikAnahtar)
  const haftaGorev = bugun
    ? bagimsiz.filter((g) => g.sonTarih >= bugun && g.sonTarih <= haftaSonu)
    : []
  const gecikenGorev = bugun ? bagimsiz.filter((g) => g.sonTarih < bugun) : []

  const sekmeler: Record<Sekme, SekmeTanimi> = {
    hafta: {
      etiket: "Bu hafta",
      aciklama: "Önümüzdeki 7 gün içinde son günü olan beyan ve görevler",
      bos: "Bu hafta son günü olan açık iş yok",
      isler: sirala([
        ...(ozet?.buHafta ?? []).map(beyan),
        ...haftaGorev.map(gorevIsi),
      ]),
      link: takvimLinki("aralik=hafta"),
    },
    geciken: {
      etiket: "Gecikenler",
      aciklama: "Son günü geçmiş, tamamlanmamış beyan ve görevler",
      bos: "Gecikmiş iş yok",
      isler: sirala(
        [...(ozet?.geciken ?? []).map(beyan), ...gecikenGorev.map(gorevIsi)],
        true
      ),
      link: takvimLinki("aralik=geciken"),
    },
    onay: {
      etiket: "Onay bekleyen",
      aciklama: "Hazırlanmış, müşteri / yönetici onayı bekleyen beyanlar",
      bos: "Onay bekleyen beyan yok",
      isler: sirala((ozet?.onayBekleyenListe ?? []).map(beyan)),
      link: takvimLinki("durum=hazirlandi"),
    },
  }
  const aktif = sekmeler[sekme]
  const hazir = ozet !== undefined && gorevler !== undefined

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Yapılacaklar</CardTitle>
        <CardDescription>{aktif.aciklama}</CardDescription>
        <CardAction>
          <ButtonLink variant="ghost" size="sm" to={aktif.link}>
            Takvimde aç
          </ButtonLink>
        </CardAction>
      </CardHeader>
      {/* Kart yüksekliği dışarıdan sabitlenirse liste kendi içinde kayar */}
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {hata ? (
          <ErrorState error={hata} onRetry={onRetry} />
        ) : (
          <Tabs
            value={sekme}
            onValueChange={(v) => setSekme(v as Sekme)}
            className="min-h-0 flex-1"
          >
            <TabsList className="max-w-full [scrollbar-width:none] justify-start overflow-x-auto">
              {(Object.keys(sekmeler) as Sekme[]).map((s) => {
                const adet = hazir ? sekmeler[s].isler.length : undefined
                return (
                  <TabsTrigger key={s} value={s} className="flex-none">
                    {sekmeler[s].etiket}
                    {adet !== undefined && (
                      <span
                        className={
                          s === "geciken" && adet > 0
                            ? "rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums"
                            : "rounded-full bg-foreground/5 px-1.5 text-xs tabular-nums"
                        }
                      >
                        {adet}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {(Object.keys(sekmeler) as Sekme[]).map((s) => {
              const tanim = sekmeler[s]
              return (
                <TabsContent
                  key={s}
                  value={s}
                  className="flex min-h-0 flex-col gap-4 pt-3"
                >
                  {s === "hafta" && (
                    <YogunlukSeridi ozet={ozet} sorumlu={sorumlu} />
                  )}
                  {!hazir ? (
                    <div className="grid gap-3" aria-busy="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div
                      data-slot="is-listesi"
                      className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2"
                    >
                      <IsListesi
                        isler={tanim.isler.slice(0, LISTE_LIMITI)}
                        bosMesaj={tanim.bos}
                      />
                      {tanim.isler.length > LISTE_LIMITI && (
                        <div className="mt-3 flex justify-center">
                          <ButtonLink
                            variant="outline"
                            size="sm"
                            to={tanim.link}
                          >
                            {tanim.isler.length - LISTE_LIMITI} iş daha
                          </ButtonLink>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
