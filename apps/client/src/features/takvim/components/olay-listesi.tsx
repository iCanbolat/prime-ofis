import { format } from "date-fns"
import { tr } from "date-fns/locale"
import { Link } from "react-router"
import { toast } from "sonner"
import { Calendar03Icon } from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { EmptyState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePersonelList } from "@/features/auth/queries"
import { GOREV_DURUM_ETIKET } from "@prime/shared/gorev/sabitler"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { donemEtiketi, kaydirmaNedeni } from "@prime/shared/takvim/motor"
import { useTakvimDurumGuncelle } from "@/features/takvim/queries"
import {
  BEYAN_DURUM_ETIKET,
  BEYAN_DURUM_SIRASI,
} from "@prime/shared/takvim/sabitler"
import { formatDate } from "@prime/shared/lib/format"
import { fromYmd } from "@prime/shared/lib/tarih"
import { cn } from "@/lib/utils"
import type { TakvimOlayi } from "@prime/shared/types/api"
import type { BeyanDurumu, Personel, YukumlulukTip } from "@prime/shared/types/domain"

export function YukumlulukBadge({
  tip,
  className,
}: {
  tip: YukumlulukTip
  className?: string
}) {
  const tanim = YUKUMLULUK_TANIMLARI[tip]
  return (
    <Badge
      variant="secondary"
      title={tanim.ad}
      className={cn(tanim.renk, className)}
    >
      {tanim.kisaAd}
    </Badge>
  )
}

export function DurumSecici({ olay }: { olay: TakvimOlayi }) {
  const guncelle = useTakvimDurumGuncelle()
  const etiket = `${olay.mukellefUnvan} ${YUKUMLULUK_TANIMLARI[olay.tip].kisaAd} ${donemEtiketi(olay.donem)} durumu`

  return (
    <Select
      items={BEYAN_DURUM_ETIKET}
      value={olay.durum}
      disabled={guncelle.isPending}
      onValueChange={(durum) => {
        if (!durum || durum === olay.durum) return
        guncelle.mutate(
          { id: olay.id, durum: durum as BeyanDurumu },
          { onError: (error) => toast.error(error.message) }
        )
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={etiket}
        className={cn(
          "w-32",
          olay.durum === "ONAYLANDI" &&
            "text-emerald-700 dark:text-emerald-300",
          olay.durum === "HAZIRLANDI" && "text-sky-700 dark:text-sky-300"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BEYAN_DURUM_SIRASI.map((d) => (
          <SelectItem key={d} value={d}>
            {BEYAN_DURUM_ETIKET[d]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function OlaySatiri({
  olay,
  gosterMukellef,
  personelAdi,
}: {
  olay: TakvimOlayi
  gosterMukellef: boolean
  personelAdi?: Pick<Personel, "ad" | "soyad" | "renk">
}) {
  const neden = kaydirmaNedeni(olay.yasalSonTarih, olay.sonTarih)
  return (
    <li
      // Sabit rozet sütunu: rozet genişliği (KDV / MUHSGK) metnin hizasını bozmaz
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]"
      aria-label={`${olay.mukellefUnvan} ${YUKUMLULUK_TANIMLARI[olay.tip].ad} ${donemEtiketi(olay.donem)}`}
    >
      <YukumlulukBadge tip={olay.tip} className="mt-px w-full" />
      <div className="grid min-w-0 leading-snug">
        {gosterMukellef ? (
          <Link
            to={`/mukellefler/${olay.mukellefId}/takvim`}
            className="truncate text-sm font-medium hover:underline"
          >
            {olay.mukellefUnvan}
          </Link>
        ) : (
          <span className="text-sm font-medium">
            {YUKUMLULUK_TANIMLARI[olay.tip].ad}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {donemEtiketi(olay.donem)}
          {neden &&
            ` · ${formatDate(olay.yasalSonTarih)} ${neden} olduğu için kaydırıldı`}
          {olay.gorevId && olay.gorevDurum && (
            <>
              {" · "}
              <Link
                to={`/gorevler?gorev=${olay.gorevId}`}
                className="hover:text-foreground hover:underline"
              >
                Görev: {GOREV_DURUM_ETIKET[olay.gorevDurum]}
              </Link>
            </>
          )}
        </span>
      </div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-end sm:self-center">
        {olay.gecikti && <Badge variant="destructive">Gecikti</Badge>}
        {gosterMukellef && personelAdi && (
          <PersonelAvatar
            personel={personelAdi}
            size="sm"
            className="hidden sm:flex"
          />
        )}
        <DurumSecici olay={olay} />
      </div>
    </li>
  )
}

interface OlayListesiProps {
  olaylar: TakvimOlayi[]
  /** Mükellef kartında mükellef adı yerine yükümlülük adı gösterilir */
  gosterMukellef?: boolean
  /** Tarihler yeniden eskiye mi sıralansın */
  tersSira?: boolean
  bosMesaj?: string
}

/** Son güne göre gruplanmış yükümlülük listesi (takvim listesi, gün paneli, mükellef sekmesi). */
export function OlayListesi({
  olaylar,
  gosterMukellef = true,
  tersSira = false,
  bosMesaj = "Bu aralıkta yükümlülük yok",
}: OlayListesiProps) {
  const personel = usePersonelList()
  const personelById = new Map((personel.data ?? []).map((p) => [p.id, p]))

  if (olaylar.length === 0) {
    return <EmptyState icon={Calendar03Icon} title={bosMesaj} />
  }

  const gruplar = new Map<string, TakvimOlayi[]>()
  for (const o of olaylar)
    gruplar.set(o.sonTarih, [...(gruplar.get(o.sonTarih) ?? []), o])
  const tarihler = [...gruplar.keys()].sort()
  if (tersSira) tarihler.reverse()

  return (
    <div className="grid gap-4">
      {tarihler.map((tarih) => (
        <section key={tarih} aria-label={formatDate(tarih)}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {format(fromYmd(tarih), "d MMMM yyyy, EEEE", { locale: tr })}
          </h3>
          <ul className="divide-y">
            {gruplar.get(tarih)!.map((o) => (
              <OlaySatiri
                key={o.id}
                olay={o}
                gosterMukellef={gosterMukellef}
                personelAdi={personelById.get(o.sorumluPersonelId)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
