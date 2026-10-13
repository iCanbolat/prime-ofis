import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  TelegramIcon,
  WhatsappBusinessIcon,
} from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KanalDialog } from "@/features/kanal/components/kanal-dialog"
import {
  useKanalKaldir,
  useKanalTest,
  useKanallar,
} from "@/features/kanal/queries"
import { KULLANILAN_KANALLAR } from "@/features/kanal/api"
import {
  KANAL_DURUM_ETIKET,
  KANAL_ETIKET,
  WHATSAPP_SABLON_ETIKET,
} from "@prime/shared/kanal/sabitler"
import { formatDateTime } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type {
  KanalAyari,
  KanalDurumu,
  KanalTip,
  WhatsappSablon,
} from "@prime/shared/types/domain"

const IKON = {
  EPOSTA: Mail01Icon,
  TELEGRAM: TelegramIcon,
  WHATSAPP: WhatsappBusinessIcon,
}

const ACIKLAMA: Record<KanalTip, string> = {
  EPOSTA:
    "Personel hatırlatmaları, mükellefe evrak talebi, tahakkuk ve borç hatırlatma e-postaları",
  TELEGRAM: "Personelin kendi Telegram'ına anlık hatırlatma (ücretsiz)",
  WHATSAPP:
    "Mükellefe onaylı şablonlarla WhatsApp mesajı (Meta, mesaj başına ücretli)",
}

function DurumBadge({ durum }: { durum: KanalDurumu }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        durum === "BAGLI" &&
          "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
        durum === "HATA" && "bg-destructive/10 text-destructive",
        durum === "YAPILANDIRILMADI" && "bg-muted text-muted-foreground"
      )}
    >
      {KANAL_DURUM_ETIKET[durum]}
    </Badge>
  )
}

function Satirlar({ satirlar }: { satirlar: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {satirlar.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ayrintilar(a: KanalAyari): [string, ReactNode][] {
  const gizli: [string, ReactNode] = [
    "Gizli anahtar",
    a.gizliIpucu ? `••••${a.gizliIpucu}` : "—",
  ]
  const test: [string, ReactNode] = [
    "Son test",
    a.sonTest ? formatDateTime(a.sonTest) : "—",
  ]
  if (a.tip === "EPOSTA")
    return [
      ["Sunucu", `${a.sunucu}:${a.port} (${a.guvenlik})`],
      ["Gönderen", `${a.gonderenAd} <${a.gonderenAdres}>`],
      gizli,
      test,
    ]
  if (a.tip === "TELEGRAM")
    return [["Bot", `@${a.botKullaniciAdi}`], gizli, test]
  const eslenen = (
    Object.keys(WHATSAPP_SABLON_ETIKET) as WhatsappSablon[]
  ).filter((s) => a.sablonlar[s])
  return [
    ["Numara", a.gorunenNumara],
    ["Şablonlar", `${eslenen.length}/5 eşlendi`],
    gizli,
    test,
  ]
}

function KanalKarti({
  tip,
  ayar,
  onDuzenle,
  onKaldir,
}: {
  tip: KanalTip
  ayar: KanalAyari | null
  onDuzenle: () => void
  onKaldir: () => void
}) {
  const test = useKanalTest()
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={IKON[tip]} strokeWidth={2} className="size-5" />
          {KANAL_ETIKET[tip]}
        </CardTitle>
        <CardDescription>{ACIKLAMA[tip]}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {ayar && !ayar.aktif && <Badge variant="outline">Pasif</Badge>}
          <DurumBadge durum={ayar?.durum ?? "YAPILANDIRILMADI"} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {ayar ? (
          <Satirlar satirlar={ayrintilar(ayar)} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {tip === "WHATSAPP"
              ? 'Yapılandırılmadığında mükellef mesajları "WhatsApp\'ta aç" bağlantısıyla elle gönderilir.'
              : tip === "EPOSTA"
                ? "Yapılandırılmadığında e-postalar kullanıcının e-posta istemcisinde açılır."
                : "Yapılandırılmadığında Telegram bildirimi gönderilmez."}
          </p>
        )}
        {ayar?.hataMesaji && (
          <p className="text-sm text-destructive">{ayar.hataMesaji}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={ayar ? "outline" : "default"}
          onClick={onDuzenle}
        >
          {ayar ? "Düzenle" : "Yapılandır"}
        </Button>
        {ayar && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={test.isPending}
              onClick={() =>
                test.mutate(tip, {
                  onSuccess: ({ gonderim }) =>
                    gonderim.durum === "GONDERILDI"
                      ? toast.success(
                          `Test mesajı gönderildi: ${gonderim.adres}`
                        )
                      : toast.error(
                          gonderim.hataMesaji ?? "Test mesajı gönderilemedi"
                        ),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              Test gönder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={onKaldir}
            >
              Kaldır
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}

export function KanallarPage() {
  const kanallar = useKanallar()
  const kaldir = useKanalKaldir()
  const [duzenlenen, setDuzenlenen] = useState<KanalTip | null>(null)
  const [kaldirilacak, setKaldirilacak] = useState<KanalTip | null>(null)

  if (kanallar.isError)
    return (
      <ErrorState error={kanallar.error} onRetry={() => kanallar.refetch()} />
    )
  if (!kanallar.data) return <LoadingState />
  const k = kanallar.data

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Şifre ve anahtarlar sunucuda şifreli saklanır; bu ekranda yalnızca son 4
        karakteri görünür. SMS kullanılmaz.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {KULLANILAN_KANALLAR.map((tip) => (
          <KanalKarti
            key={tip}
            tip={tip}
            ayar={k[tip]}
            onDuzenle={() => setDuzenlenen(tip)}
            onKaldir={() => setKaldirilacak(tip)}
          />
        ))}
      </div>
      <KanalDialog
        tip={duzenlenen}
        mevcut={duzenlenen ? k[duzenlenen] : null}
        onClose={() => setDuzenlenen(null)}
      />
      <ConfirmDialog
        open={Boolean(kaldirilacak)}
        onOpenChange={(o) => !o && setKaldirilacak(null)}
        title={`${kaldirilacak ? KANAL_ETIKET[kaldirilacak] : ""} kanalı kaldırılsın mı?`}
        description="Kayıtlı anahtar silinir; bu kanaldan gönderim yapılmaz."
        confirmLabel="Kaldır"
        destructive
        pending={kaldir.isPending}
        onConfirm={() =>
          kaldirilacak &&
          kaldir.mutate(kaldirilacak, {
            onSuccess: () => {
              toast.success("Kanal kaldırıldı")
              setKaldirilacak(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </>
  )
}
