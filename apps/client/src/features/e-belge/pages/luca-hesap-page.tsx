import { useState } from "react"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LucaDogrulamaDialog } from "@/features/e-belge/components/luca-dogrulama"
import { LucaFirmaAktarimDialog } from "@/features/e-belge/components/luca-firma-aktarim"
import {
  lucaDogrulamaBekliyor,
  useLucaHesap,
  useLucaHesapKaldir,
  useLucaHesapKaydet,
} from "@/features/e-belge/queries"
import { ApiError } from "@/lib/http"
import { formatDateTime } from "@prime/shared/lib/format"
import type { LucaHesapDurumu, LucaHesapView } from "@prime/shared/types/api"

const DURUM: Record<
  LucaHesapDurumu,
  { etiket: string; variant: "default" | "destructive" | "secondary" }
> = {
  BAGLI: { etiket: "Bağlı", variant: "default" },
  DOGRULAMA: { etiket: "Doğrulama kodu bekleniyor", variant: "secondary" },
  HATA: { etiket: "Giriş başarısız", variant: "destructive" },
}

function HesapFormu({
  hesap,
  onDogrulama,
}: {
  hesap: LucaHesapView | null
  onDogrulama: () => void
}) {
  const kaydet = useLucaHesapKaydet()
  const [kullanici, setKullanici] = useState(hesap?.kullanici ?? "")
  const [sifre, setSifre] = useState("")
  const [hata, setHata] = useState<{ kullanici?: string; sifre?: string }>({})

  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    const k = kullanici.trim()
    const yeni: typeof hata = {}
    if (!k) yeni.kullanici = "Kullanıcı adı zorunludur"
    if (!sifre && k !== hesap?.kullanici) yeni.sifre = "Şifre zorunludur"
    setHata(yeni)
    if (yeni.kullanici || yeni.sifre) return
    kaydet.mutate(
      { kullanici: k, ...(sifre ? { sifre } : {}) },
      {
        onSuccess: () => {
          setSifre("")
          toast.success("Luca hesabına bağlanıldı")
        },
        onError: (error) => {
          setSifre("")
          if (lucaDogrulamaBekliyor(error)) onDogrulama()
          else if (error instanceof ApiError && error.status === 422)
            setHata({ sifre: error.message })
          else toast.error(error.message)
        },
      }
    )
  }

  return (
    <form onSubmit={gonder} noValidate className="grid gap-4">
      <FieldGroup>
        <Field data-invalid={Boolean(hata.kullanici) || undefined}>
          <FieldLabel htmlFor="luca-kullanici">Luca kullanıcı adı</FieldLabel>
          <Input
            id="luca-kullanici"
            autoComplete="off"
            spellCheck={false}
            value={kullanici}
            onChange={(e) => setKullanici(e.target.value)}
            aria-invalid={Boolean(hata.kullanici) || undefined}
            className="max-w-sm"
          />
          <FieldError>{hata.kullanici}</FieldError>
        </Field>
        <Field data-invalid={Boolean(hata.sifre) || undefined}>
          <FieldLabel htmlFor="luca-sifre">Şifre</FieldLabel>
          <Input
            id="luca-sifre"
            type="password"
            autoComplete="new-password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            aria-invalid={Boolean(hata.sifre) || undefined}
            className="max-w-sm"
          />
          <FieldDescription>
            Şifre sunucuda şifreli saklanır ve bir daha görüntülenemez.
            {hesap && (
              <>
                {" "}
                Mevcut şifre: ••••{hesap.sifreIpucu}. Değiştirmeyecekseniz boş
                bırakın.
              </>
            )}
          </FieldDescription>
          <FieldError>{hata.sifre}</FieldError>
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending ? "Bağlanılıyor…" : "Kaydet ve bağlan"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Ayarlar → Luca hesabı. Büronun tek Luca kullanıcısı: mükellefler bu hesaptaki firmalardan
 * oluşturulur ya da firmalara eşlenir, senkron bu oturumla okunur. Luca doğrulama kodu isterse
 * personel kodu girer; uygulama kodu kendisi çözmez.
 */
export function LucaHesapPage() {
  const hesap = useLucaHesap()
  const kaldir = useLucaHesapKaldir()
  const [dogrulama, setDogrulama] = useState(false)
  const [silOnay, setSilOnay] = useState(false)
  const [aktarim, setAktarim] = useState(false)

  if (hesap.isError)
    return <ErrorState error={hesap.error} onRetry={() => hesap.refetch()} />
  if (hesap.data === undefined) return <LoadingState />
  const h = hesap.data

  return (
    <div className="grid max-w-3xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Luca hesabı
            {h && (
              <Badge variant={DURUM[h.durum].variant}>
                {DURUM[h.durum].etiket}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            e-Fatura, e-Arşiv, e-Defter beratları ve kontör bakiyesi bu Luca
            kullanıcısıyla okunur. Uygulama Luca'ya yalnızca okumak için
            bağlanır; kabul / red ve fatura kesme Luca'da yapılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {h && (
            <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Son giriş</dt>
              <dd>{h.sonGiris ? formatDateTime(h.sonGiris) : "—"}</dd>
              {h.kontorBakiye !== undefined && (
                <>
                  <dt className="text-muted-foreground">
                    Luca kontör bakiyesi
                  </dt>
                  <dd>
                    {h.kontorBakiye.toLocaleString("tr-TR")}
                    {h.kontorTarihi && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({formatDateTime(h.kontorTarihi)})
                      </span>
                    )}
                  </dd>
                </>
              )}
              {h.hataMesaji && (
                <>
                  <dt className="text-muted-foreground">Hata</dt>
                  <dd className="text-destructive">{h.hataMesaji}</dd>
                </>
              )}
            </dl>
          )}
          {h?.durum === "DOGRULAMA" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm">
              <span>Luca girişinde doğrulama kodu bekleniyor.</span>
              <Button size="sm" onClick={() => setDogrulama(true)}>
                Kodu gir
              </Button>
            </div>
          )}
          <HesapFormu
            key={h?.guncellemeTarihi ?? "yeni"}
            hesap={h}
            onDogrulama={() => setDogrulama(true)}
          />
        </CardContent>
      </Card>

      {h && (
        <div className="flex flex-wrap gap-2">
          {h.durum === "BAGLI" && (
            <Button onClick={() => setAktarim(true)}>
              Luca'dan mükellef aktar
            </Button>
          )}
          <Button variant="outline" onClick={() => setSilOnay(true)}>
            Luca hesabını kaldır
          </Button>
        </div>
      )}

      <LucaFirmaAktarimDialog
        open={aktarim}
        onClose={() => setAktarim(false)}
      />

      <LucaDogrulamaDialog
        open={dogrulama}
        onClose={() => setDogrulama(false)}
      />
      <AlertDialog open={silOnay} onOpenChange={setSilOnay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Luca hesabı kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Kayıtlı kullanıcı adı ve şifre silinir. Senkron, hesap yeniden
              tanımlanana kadar çalışmaz; eşlenmiş mükellefler ve alınmış
              faturalar korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                kaldir.mutate(undefined, {
                  onSuccess: () => toast.success("Luca hesabı kaldırıldı"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              Kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
