import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DogrulamaDialog } from "@/features/borc/components/dogrulama"
import { useCredentials } from "@/features/kasa/queries"
import { ErisimDialog } from "@/features/tebligat/components/erisim-dialog"
import { useKasadanAktar } from "@/features/tebligat/kasa-aktarim"
import { ErisimDurumBadge } from "@/features/tebligat/components/tebligat-rozetleri"
import {
  useTebligatErisim,
  useTebligatErisimKaldir,
  useTebligatMukellefTara,
} from "@/features/tebligat/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { KamuDogrulamaView } from "@prime/shared/types/api"

/** Kasadaki İnteraktif VD şifresi taramanın kullandığından yeniyse uyarı + tek tıkla güncelleme */
function KasaDahaYeni({
  mukellefId,
  credentialId,
}: {
  mukellefId: string
  credentialId: string
}) {
  const credentials = useCredentials({ mukellefId })
  const { aktar, isPending } = useKasadanAktar()
  const kayit = credentials.data?.find((c) => c.id === credentialId)
  return (
    <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-amber-800 dark:text-amber-300">
        Şifre kasasındaki İnteraktif VD şifresi, taramanın kullandığından daha
        yeni.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={!kayit || isPending}
        onClick={() => kayit && aktar(kayit)}
      >
        Kasadan güncelle
      </Button>
    </CardContent>
  )
}

/** Mükellef kartında GİB e-Tebligat erişimi: durum, son tarama, tanımla / güncelle / şimdi tara */
export function ErisimKarti({ mukellefId }: { mukellefId: string }) {
  const erisim = useTebligatErisim(mukellefId)
  const tara = useTebligatMukellefTara()
  const kaldir = useTebligatErisimKaldir()
  const [duzenle, setDuzenle] = useState(false)
  const [kaldirilacak, setKaldirilacak] = useState(false)
  const [dogrulama, setDogrulama] = useState<KamuDogrulamaView | null>(null)

  if (erisim.isError)
    return <ErrorState error={erisim.error} onRetry={() => erisim.refetch()} />
  if (!erisim.data) return <LoadingState />
  const s = erisim.data
  const e = s.erisim

  const aciklama = !e
    ? "Tanımlanınca mükellefin GİB e-Tebligat kutusu her gece taranır; tanımlanana kadar tebligatlar yalnızca elle girilebilir."
    : e.durum === "HATA"
      ? `${e.hataMesaji ?? "GİB'e giriş yapılamadı"}. Şifre güncellenene kadar gece taramasında atlanır.`
      : s.dogrulama
        ? "GİB girişi doğrulama kodu istedi. Kod girilene kadar kutu taranmaz."
        : "Her gece taranır; yeni tebligatlar sabah listede olur."

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          GİB e-Tebligat kutusu
          <ErisimDurumBadge durum={s.durum} />
        </CardTitle>
        <CardDescription
          className={e?.durum === "HATA" ? "text-destructive" : undefined}
        >
          {aciklama}
          {e && (
            <span className="block text-muted-foreground">
              Kullanıcı {e.kullaniciKodu} · şifre ••••{e.sifreIpucu}
              {e.kasaKaynagi && " (kasadan)"}
              {e.sonTarama &&
                ` · son başarılı tarama ${formatDateTime(e.sonTarama)}`}
            </span>
          )}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          {s.dogrulama && (
            <Button size="sm" onClick={() => setDogrulama(s.dogrulama)}>
              Kodu gir
            </Button>
          )}
          {e && !s.dogrulama && (
            <Button
              size="sm"
              variant="outline"
              disabled={tara.isPending}
              onClick={() =>
                tara.mutate(mukellefId, {
                  onSuccess: (r) =>
                    r.dogrulama
                      ? setDogrulama(r.dogrulama)
                      : toast.success(
                          r.yeni === 0
                            ? "Yeni e-Tebligat yok"
                            : `${r.yeni} yeni e-Tebligat`
                        ),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              {tara.isPending
                ? "Taranıyor…"
                : e.durum === "HATA"
                  ? "Yeniden dene"
                  : "Şimdi tara"}
            </Button>
          )}
          <Button
            size="sm"
            variant={e ? "ghost" : "default"}
            onClick={() => setDuzenle(true)}
          >
            {e ? "Şifreyi güncelle" : "Erişim tanımla"}
          </Button>
          {e && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setKaldirilacak(true)}
            >
              Kaldır
            </Button>
          )}
        </CardAction>
      </CardHeader>
      {s.kasaDahaYeni && s.kasaKaydiId && (
        <KasaDahaYeni mukellefId={mukellefId} credentialId={s.kasaKaydiId} />
      )}
      <ErisimDialog
        satir={duzenle ? s : null}
        onClose={() => setDuzenle(false)}
      />
      <DogrulamaDialog
        dogrulama={dogrulama}
        onClose={() => setDogrulama(null)}
      />
      <ConfirmDialog
        open={kaldirilacak}
        onOpenChange={setKaldirilacak}
        title="GİB erişimi kaldırılsın mı?"
        description="Bu mükellefin e-Tebligat kutusu artık gece taranmaz. Kayıtlı tebligatlar silinmez."
        confirmLabel="Kaldır"
        destructive
        pending={kaldir.isPending}
        onConfirm={() =>
          kaldir.mutate(mukellefId, {
            onSuccess: () => {
              toast.success("GİB erişimi kaldırıldı")
              setKaldirilacak(false)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </Card>
  )
}
