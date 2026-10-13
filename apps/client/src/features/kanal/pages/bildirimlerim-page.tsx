import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BILDIRIM_GORUNUM,
  type BildirimKategori,
} from "@/features/bildirim/gorunum"
import { kanalHazir } from "@prime/shared/kanal/kurallar"
import {
  useBildirimTercihi,
  useKanallar,
  useTelegramBaglantisi,
  useTelegramDogrula,
  useTelegramKaldir,
  useTercihKaydet,
} from "@/features/kanal/queries"
import { KULLANILAN_KANALLAR } from "@/features/kanal/api"
import { KANAL_ETIKET } from "@prime/shared/kanal/sabitler"
import { formatPhone } from "@prime/shared/lib/format"
import type { BildirimTercihView } from "@prime/shared/types/api"
import type { KanalTip } from "@prime/shared/types/domain"

const KATEGORILER = Object.keys(BILDIRIM_GORUNUM) as BildirimKategori[]
const KANALLAR = KULLANILAN_KANALLAR

function TelegramKarti({
  t,
  hazir,
}: {
  t: BildirimTercihView
  hazir: boolean
}) {
  const baglanti = useTelegramBaglantisi()
  const dogrula = useTelegramDogrula()
  const kaldir = useTelegramKaldir()
  const link = baglanti.data?.link
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Telegram hesabım</CardTitle>
        <CardDescription>
          {t.telegramBagli
            ? "Telegram'ınız bağlı; seçtiğiniz bildirimler bot üzerinden gelir."
            : "Bot bağlantısını açıp Başlat'a dokunun, ardından burada doğrulayın."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {!hazir ? (
          <p className="text-sm text-muted-foreground">
            Büronun Telegram botu henüz yapılandırılmadı (Ayarlar → Kanallar).
          </p>
        ) : t.telegramBagli ? (
          <Button
            variant="outline"
            size="sm"
            disabled={kaldir.isPending}
            onClick={() =>
              kaldir.mutate(undefined, {
                onSuccess: () =>
                  toast.success("Telegram bağlantısı kaldırıldı"),
              })
            }
          >
            Bağlantıyı kaldır
          </Button>
        ) : link ? (
          <>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-link underline"
            >
              Botu Telegram'da aç
            </a>
            <Button
              size="sm"
              disabled={dogrula.isPending}
              onClick={() =>
                dogrula.mutate(undefined, {
                  onSuccess: () => toast.success("Telegram bağlandı"),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Başlattım, doğrula
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={baglanti.isPending}
            onClick={() =>
              baglanti.mutate(undefined, {
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Telegram'ı bağla
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function BildirimlerimPage() {
  const tercih = useBildirimTercihi()
  const kanallar = useKanallar()
  const kaydet = useTercihKaydet()

  if (tercih.isError)
    return <ErrorState error={tercih.error} onRetry={() => tercih.refetch()} />
  if (!tercih.data || !kanallar.data) return <LoadingState />
  const t = tercih.data
  const k = kanallar.data

  const degistir = (
    kategori: BildirimKategori,
    kanal: KanalTip,
    secili: boolean
  ) => {
    const onceki = t.kanallar[kategori] ?? []
    const yeni = secili ? [...onceki, kanal] : onceki.filter((x) => x !== kanal)
    kaydet.mutate(
      { kanallar: { ...t.kanallar, [kategori]: yeni } },
      { onError: (e) => toast.error(e.message) }
    )
  }

  const adres: Record<KanalTip, string> = {
    EPOSTA: t.eposta,
    TELEGRAM: t.telegramBagli ? "Bağlı" : "Bağlı değil",
    WHATSAPP: formatPhone(t.telefon),
  }

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Bildirim kanallarım</CardTitle>
          <CardDescription>
            Uygulama içi bildirimler her zaman açıktır. Kaçırmak istemediğiniz
            bildirimleri ayrıca{" "}
            {KANALLAR.includes("TELEGRAM")
              ? "e-posta, Telegram veya WhatsApp'tan"
              : "e-posta veya WhatsApp'tan"}{" "}
            alın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="Bildirim kanal tercihleri">
              <TableHeader>
                <TableRow>
                  <TableHead>Bildirim</TableHead>
                  {KANALLAR.map((kanal) => (
                    <TableHead key={kanal} className="text-center">
                      <span className="block">{KANAL_ETIKET[kanal]}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {kanalHazir(k[kanal])
                          ? adres[kanal]
                          : "Yapılandırılmadı"}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {KATEGORILER.map((kategori) => (
                  <TableRow key={kategori}>
                    <TableCell className="font-medium">
                      {BILDIRIM_GORUNUM[kategori].etiket}
                    </TableCell>
                    {KANALLAR.map((kanal) => {
                      const kullanilamaz =
                        !kanalHazir(k[kanal]) ||
                        (kanal === "TELEGRAM" && !t.telegramBagli) ||
                        (kanal === "WHATSAPP" &&
                          !(
                            k.WHATSAPP?.tip === "WHATSAPP" &&
                            k.WHATSAPP.sablonlar.PERSONEL_HATIRLATMA
                          ))
                      return (
                        <TableCell key={kanal} className="text-center">
                          <Checkbox
                            aria-label={`${BILDIRIM_GORUNUM[kategori].etiket} — ${KANAL_ETIKET[kanal]}`}
                            checked={(t.kanallar[kategori] ?? []).includes(
                              kanal
                            )}
                            disabled={kullanilamaz || kaydet.isPending}
                            onCheckedChange={(v) =>
                              degistir(kategori, kanal, Boolean(v))
                            }
                          />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            WhatsApp bildirimi için yöneticinin "Personel hatırlatması"
            şablonunu eşlemesi gerekir. Telefon ve e-posta personel kaydınızdan
            alınır.
          </p>
        </CardContent>
      </Card>
      {KANALLAR.includes("TELEGRAM") && (
        <TelegramKarti t={t} hazir={kanalHazir(k.TELEGRAM)} />
      )}
    </>
  )
}
