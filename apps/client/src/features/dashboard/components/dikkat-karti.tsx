import { Link } from "react-router"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  FileNotFoundIcon,
  Invoice03Icon,
  LegalDocument01Icon,
  PlugSocketIcon,
  Refresh01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { EmptyState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type {
  ArsivOzetResponse,
  BorcOzetResponse,
  BordroOzetResponse,
  EBelgeOzetResponse,
  TebligatOzetResponse,
} from "@prime/shared/types/api"

type Ton = "tehlike" | "uyari" | "notr"

const TON_SIRASI: Ton[] = ["tehlike", "uyari", "notr"]

interface Satir {
  etiket: string
  /** 0 ise satır gizlenir */
  deger: number
  /** Sayının yanında gösterilen birim */
  birim?: string
  /** Sayı yerine gösterilecek metin */
  metin?: string
  to: string
  icon: IconSvgElement
  ton: Ton
}

interface Kaynak<T> {
  data: T | undefined
  hata?: unknown
  onRetry: () => void
}

function tebligatSatirlari(o: TebligatOzetResponse): Satir[] {
  return [
    {
      etiket: "Acil / geciken tebligat",
      deger: o.acil + o.geciken,
      to: "/tebligat?kapsam=acil",
      icon: LegalDocument01Icon,
      ton: "tehlike",
    },
    {
      etiket: "GİB girişi başarısız mükellef",
      deger: o.erisim.hatali,
      to: "/tebligat?erisim=",
      icon: LegalDocument01Icon,
      ton: "uyari",
    },
    {
      etiket: "Açık tebligat",
      deger: o.acik,
      to: "/tebligat?kapsam=acik",
      icon: LegalDocument01Icon,
      ton: "notr",
    },
  ]
}

function borcSatirlari(o: BorcOzetResponse): Satir[] {
  return [
    {
      etiket: "Vadesi geçmiş vergi borcu",
      deger: o.gib.vadesiGecmisMukellef,
      birim: "mükellef",
      to: "/borc-levha?sekme=vergi&kapsam=vadesiGecmis",
      icon: Coins01Icon,
      ton: "tehlike",
    },
    {
      etiket: "Vadesi geçmiş SGK prim borcu",
      deger: o.sgk.vadesiGecmisMukellef,
      birim: "mükellef",
      to: "/borc-levha?sekme=sgk&kapsam=vadesiGecmis",
      icon: Coins01Icon,
      ton: "tehlike",
    },
    {
      etiket: "Doğrulama kodu bekleyen GİB / SGK girişi",
      deger: o.dogrulamaBekleyen,
      to: "/borc-levha?dogrulama=",
      icon: Coins01Icon,
      ton: "uyari",
    },
    {
      etiket: "Vergi levhası alınmamış",
      deger: o.levhaEksik,
      birim: "mükellef",
      to: "/borc-levha?sekme=levha&kapsam=eksik",
      icon: Coins01Icon,
      ton: "notr",
    },
  ]
}

function bordroSatirlari(o: BordroOzetResponse): Satir[] {
  return [
    {
      etiket: "Bordro girdisi gelmedi",
      deger: o.girdiBekleyen,
      to: "/bordro?durum=BEKLENIYOR",
      icon: UserMultiple02Icon,
      ton: "uyari",
    },
    {
      etiket: "MUHSGK süresi geçen bordro",
      deger: o.geciken,
      to: "/bordro?uyari=GECIKTI",
      icon: UserMultiple02Icon,
      ton: "tehlike",
    },
    {
      etiket: "Süresi yaklaşan işe giriş / çıkış bildirimi",
      deger: o.hareketYaklasan,
      to: "/bordro?sekme=hareket",
      icon: UserMultiple02Icon,
      ton: "uyari",
    },
    {
      etiket: "Geciken işe giriş / çıkış bildirimi",
      deger: o.hareketGeciken,
      to: "/bordro?sekme=hareket",
      icon: UserMultiple02Icon,
      ton: "tehlike",
    },
  ]
}

function eBelgeSatirlari(o: EBelgeOzetResponse): Satir[] {
  return [
    {
      etiket: "Yanıt süresi dolmak üzere",
      deger: o.yanitSuresiYaklasan.length,
      to: "/e-belge/e-fatura?yon=GELEN&yanitSuresi=yaklasan",
      icon: Invoice03Icon,
      ton: "uyari",
    },
    {
      etiket: "Hatalı e-fatura gönderimi",
      deger: o.hataliGonderim - o.hataliEArsiv,
      to: "/e-belge/e-fatura?gibDurumu=HATA",
      icon: Invoice03Icon,
      ton: "tehlike",
    },
    {
      etiket: "Hatalı e-arşiv gönderimi",
      deger: o.hataliEArsiv,
      to: "/e-belge/e-arsiv?gibDurumu=HATA",
      icon: Invoice03Icon,
      ton: "tehlike",
    },
    {
      etiket: "Geciken e-Defter beratı",
      deger: o.beratGeciken,
      to: "/e-belge/e-defter",
      icon: BookOpen01Icon,
      ton: "tehlike",
    },
    {
      etiket: "Luca bağlantı hatası",
      deger: o.baglantiHatasi,
      to: "/e-belge/baglantilar?durum=HATA",
      icon: PlugSocketIcon,
      ton: "tehlike",
    },
    {
      etiket: "Kontör azaldı",
      deger: o.kontorDusuk ? 1 : 0,
      metin: `${o.kontorKalan} kaldı`,
      to: "/e-belge/kontor",
      icon: Coins01Icon,
      ton: "uyari",
    },
  ]
}

function arsivSatirlari(o: ArsivOzetResponse): Satir[] {
  const doldu = o.gecerlilik.filter((d) => d.gecerlilik === "DOLDU").length
  return [
    {
      etiket: "Süresi dolan belge",
      deger: doldu,
      to: "/arsiv?gecerlilik=doldu&sirala=gecerlilikTarihi&gorunum=liste",
      icon: FileNotFoundIcon,
      ton: "tehlike",
    },
    {
      etiket: "30 gün içinde dolacak belge",
      deger: o.gecerlilik.length - doldu,
      to: "/arsiv?gecerlilik=yakinda&sirala=gecerlilikTarihi&gorunum=liste",
      icon: FileNotFoundIcon,
      ton: "uyari",
    },
    {
      etiket: "Eksik zorunlu evrak",
      deger: o.eksikZorunlu.length,
      birim: "mükellef",
      to:
        o.eksikZorunlu.length === 1
          ? `/arsiv?mukellef=${o.eksikZorunlu[0].mukellefId}`
          : "/arsiv?eksik=1",
      icon: FileNotFoundIcon,
      ton: "uyari",
    },
  ]
}

function SatirOgesi({ s }: { s: Satir }) {
  return (
    <li data-slot="dikkat">
      <Link
        to={s.to}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-2 outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground",
            s.ton === "tehlike" && "bg-destructive/10 text-destructive",
            s.ton === "uyari" &&
              "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          )}
        >
          <HugeiconsIcon icon={s.icon} strokeWidth={2} className="size-4" />
        </span>
        <span className="truncate text-sm">{s.etiket}</span>
        <span
          className={cn(
            "font-heading text-base font-semibold tabular-nums",
            s.ton === "tehlike" && "text-destructive",
            s.ton === "uyari" && "text-amber-800 dark:text-amber-300"
          )}
        >
          {s.metin ?? s.deger}
          {s.birim && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {s.birim}
            </span>
          )}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 text-muted-foreground group-hover:text-foreground"
        />
      </Link>
    </li>
  )
}

function HataSatiri({ ad, onRetry }: { ad: string; onRetry: () => void }) {
  return (
    <li className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
      <span className="flex size-7 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />
      </span>
      <span className="flex-1">{ad} yüklenemedi</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
        Tekrar dene
      </Button>
    </li>
  )
}

/**
 * Tebligat, e-Belge ve arşivdeki bekleyen sorunların tek listesi.
 * Yalnızca sıfırdan büyük satırlar, önem sırasına göre gösterilir.
 */
export function DikkatKarti({
  tebligat,
  eBelge,
  arsiv,
  bordro,
  borc,
  className,
}: {
  tebligat: Kaynak<TebligatOzetResponse>
  eBelge: Kaynak<EBelgeOzetResponse>
  arsiv: Kaynak<ArsivOzetResponse>
  bordro: Kaynak<BordroOzetResponse>
  borc: Kaynak<BorcOzetResponse>
  className?: string
}) {
  const kaynaklar: { ad: string; k: Kaynak<unknown> }[] = [
    { ad: "e-Tebligat", k: tebligat },
    { ad: "e-Belge", k: eBelge },
    { ad: "Arşiv", k: arsiv },
    { ad: "Bordro", k: bordro },
    { ad: "Borç ve levha", k: borc },
  ]
  const yukleniyor = kaynaklar.some(({ k }) => !k.hata && !k.data)
  const hatalar = kaynaklar.filter(({ k }) => k.hata)
  const satirlar = [
    ...(tebligat.data ? tebligatSatirlari(tebligat.data) : []),
    ...(eBelge.data ? eBelgeSatirlari(eBelge.data) : []),
    ...(arsiv.data ? arsivSatirlari(arsiv.data) : []),
    ...(bordro.data ? bordroSatirlari(bordro.data) : []),
    ...(borc.data ? borcSatirlari(borc.data) : []),
  ]
    .filter((s) => s.deger > 0)
    .sort((a, b) => TON_SIRASI.indexOf(a.ton) - TON_SIRASI.indexOf(b.ton))

  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle>Dikkat gerektirenler</CardTitle>
        <CardDescription>
          Tebligat, e-Belge, belge, bordro ve borç uyarıları
        </CardDescription>
      </CardHeader>
      <CardContent>
        {yukleniyor && satirlar.length === 0 && hatalar.length === 0 ? (
          <div className="grid gap-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : satirlar.length === 0 && hatalar.length === 0 ? (
          <EmptyState
            icon={CheckmarkCircle02Icon}
            title="Dikkat gerektiren bir şey yok"
          />
        ) : (
          <ul className="grid gap-0.5" aria-label="Dikkat gerektirenler">
            {satirlar.map((s) => (
              <SatirOgesi key={s.etiket} s={s} />
            ))}
            {hatalar.map(({ ad, k }) => (
              <HataSatiri key={ad} ad={ad} onRetry={k.onRetry} />
            ))}
            {yukleniyor && (
              <li aria-busy="true">
                <Skeleton className="h-9 w-full" />
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
