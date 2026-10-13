import { useState } from "react"
import { toast } from "sonner"

import { ButtonLink } from "@/components/shared/button-link"
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
import { BorcBolumu } from "@/features/borc/components/borc-detay-sheet"
import { BorcuYokturBadge } from "@/features/borc/components/borc-rozetleri"
import {
  BorcuYokturDialog,
  BorcuYokturIslem,
} from "@/features/borc/components/borcu-yoktur"
import { DogrulamaDialog } from "@/features/borc/components/dogrulama"
import { SgkErisimKarti } from "@/features/borc/components/sgk-erisim"
import { useKamuIslem } from "@/features/borc/hooks"
import { beklenenLevhaYili, levhaGuncelMi } from "@prime/shared/borc/kurallar"
import { useLevhaSorgula, useMukellefBorc } from "@/features/borc/queries"
import { KAMU_KURUM_ETIKET, levhaArsivYolu } from "@prime/shared/borc/sabitler"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { formatDate, formatDateTime, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"

export function MukellefBorcTab() {
  const { mukellef } = useMukellefKart()
  const borc = useMukellefBorc(mukellef.id)
  const levhaSorgula = useLevhaSorgula()
  const islem = useKamuIslem()
  const [yaziIste, setYaziIste] = useState(false)

  if (borc.isError)
    return <ErrorState error={borc.error} onRetry={() => borc.refetch()} />
  if (!borc.data) return <LoadingState />
  const { gib, sgk, levhalar, borcuYoktur } = borc.data
  const bugunYmd = bugun()
  const levhaGuncel = levhaGuncelMi(levhalar, bugunYmd)
  const gibErisimVar =
    gib.satir.erisimDurumu === "AKTIF" || gib.satir.erisimDurumu === "DOGRULAMA"

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Vergi borcu (GİB)</CardTitle>
          <CardDescription>
            e-Tebligat için tanımlı İnteraktif VD erişimiyle her gece
            sorgulanır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BorcBolumu mukellefId={mukellef.id} kurum="GIB" detay={gib} />
        </CardContent>
      </Card>

      {sgk && (
        <>
          <SgkErisimKarti mukellefId={mukellef.id} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>SGK prim borcu</CardTitle>
            </CardHeader>
            <CardContent>
              <BorcBolumu mukellefId={mukellef.id} kurum="SGK" detay={sgk} />
            </CardContent>
          </Card>
        </>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Vergi levhası</CardTitle>
          <CardDescription>
            {levhaGuncel
              ? "Güncel levha arşivde."
              : `${beklenenLevhaYili(bugunYmd)} levhası henüz alınmadı; gece sorgusunda alınır.`}
          </CardDescription>
          {!levhaGuncel && gibErisimVar && (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                disabled={levhaSorgula.isPending}
                onClick={() =>
                  levhaSorgula.mutate(mukellef.id, {
                    onSuccess: (r) =>
                      islem.sonuc(r, "Vergi levhası sorgulandı"),
                    onError: (error) => toast.error(error.message),
                  })
                }
              >
                {levhaSorgula.isPending ? "Alınıyor…" : "GİB'den al"}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {levhalar.length > 0 && (
          <CardContent>
            <ul
              className="divide-y rounded-2xl border"
              aria-label="Vergi levhaları"
            >
              {levhalar.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="grid">
                    <span className="font-medium">
                      {l.yil} · {l.vergiTuru}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {l.matrah !== undefined &&
                        `Matrah ${formatTRY(l.matrah)} · `}
                      Onay kodu {l.onayKodu} · {formatDateTime(l.sorguTarihi)}
                    </span>
                  </span>
                  <ButtonLink
                    size="sm"
                    variant="ghost"
                    to={levhaArsivYolu(mukellef.id)}
                  >
                    Arşivde aç
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Borcu yoktur yazıları</CardTitle>
          <CardDescription>Hazır yazılar arşive kaydedilir.</CardDescription>
          {mukellef.aktif && (
            <CardAction>
              <Button size="sm" onClick={() => setYaziIste(true)}>
                Yazı iste
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {borcuYoktur.length > 0 && (
          <CardContent>
            <ul
              className="divide-y rounded-2xl border"
              aria-label="Borcu yoktur talepleri"
            >
              {borcuYoktur.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {KAMU_KURUM_ETIKET[t.kurum]}
                      </span>
                      <BorcuYokturBadge gorunum={t.gorunum} />
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(t.talepTarihi)}
                      {t.gecerlilikTarihi &&
                        ` · son geçerlilik ${formatDate(t.gecerlilikTarihi)}`}
                      {t.aciklama && ` · ${t.aciklama}`}
                    </span>
                  </span>
                  <BorcuYokturIslem t={t} onDogrulama={islem.sonuc} />
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <BorcuYokturDialog
        open={yaziIste}
        mukellefId={mukellef.id}
        sgkVar={Boolean(sgk)}
        onClose={() => setYaziIste(false)}
      />
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </div>
  )
}
