import { useState } from "react"
import { useSearchParams } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link04Icon, PlugSocketIcon } from "@hugeicons/core-free-icons"

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { BaglantiDialog } from "@/features/e-belge/components/baglanti-dialog"
import { BeratMatrisi } from "@/features/e-belge/components/berat-matrisi"
import { BaglantiDurumBadge } from "@/features/e-belge/components/ebelge-rozetleri"
import { FaturaListesi } from "@/features/e-belge/components/fatura-listesi"
import { SenkronButonu } from "@/features/e-belge/components/senkron-butonu"
import { useBaglanti } from "@/features/e-belge/queries"
import { EBELGE_TUR_ETIKET, ORTAM_ETIKET } from "@prime/shared/e-belge/sabitler"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { formatDateTime } from "@prime/shared/lib/format"
import type { EBelgeTur } from "@prime/shared/types/domain"

export function MukellefEBelgeTab() {
  const { mukellef } = useMukellefKart()
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])
  const baglanti = useBaglanti(mukellef.id)
  const [dialogAcik, setDialogAcik] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  if (baglanti.isError)
    return (
      <ErrorState error={baglanti.error} onRetry={() => baglanti.refetch()} />
    )
  if (baglanti.isPending) return <LoadingState />
  const b = baglanti.data

  const dialog = (
    <BaglantiDialog
      baglanti={dialogAcik ? b : null}
      onClose={() => setDialogAcik(false)}
    />
  )

  if (b.durum === "BAGLI_DEGIL")
    return (
      <>
        <EmptyState
          icon={PlugSocketIcon}
          title="Luca bağlantısı yok"
          description={
            yonetici
              ? "Mükellefin Luca web servis anahtarıyla bağlanınca e-Fatura, e-Arşiv ve e-Defter berat durumları burada görünür."
              : "Bağlantıyı büro yöneticisi kurabilir."
          }
          action={
            yonetici && (
              <Button onClick={() => setDialogAcik(true)}>
                <HugeiconsIcon
                  icon={Link04Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Luca'ya bağla
              </Button>
            )
          }
        />
        {dialog}
      </>
    )

  const turler = (["E_FATURA", "E_ARSIV"] as EBelgeTur[]).filter((t) =>
    t === "E_FATURA" ? b.eFatura : b.eArsiv
  )
  const turParam = searchParams.get("tur") as EBelgeTur | null
  const tur = turParam && turler.includes(turParam) ? turParam : turler[0]

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Luca
            <BaglantiDurumBadge durum={b.durum} />
          </CardTitle>
          <CardDescription>
            {ORTAM_ETIKET[b.ortam]} ortam
            {b.anahtarIpucu && ` · anahtar ••••${b.anahtarIpucu}`}
            {b.sonSenkron && ` · son senkron ${formatDateTime(b.sonSenkron)}`}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            {b.durum === "BAGLI" && (
              <SenkronButonu mukellefId={mukellef.id} size="sm" />
            )}
            {yonetici && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialogAcik(true)}
              >
                Anahtarı yenile
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1">
          {b.eFatura && <Badge variant="outline">e-Fatura</Badge>}
          {b.eArsiv && <Badge variant="outline">e-Arşiv</Badge>}
          {b.eDefter && <Badge variant="outline">e-Defter</Badge>}
          {b.postaKutusu && (
            <span className="ml-1 truncate font-mono text-xs text-muted-foreground">
              {b.postaKutusu}
            </span>
          )}
        </CardContent>
      </Card>

      {b.durum === "HATA" && (
        <Alert variant="destructive">
          <AlertTitle>Bağlantı hatası</AlertTitle>
          <AlertDescription>
            {b.hataMesaji ?? "Luca'ya bağlanılamıyor."} Aşağıdaki faturalar son
            başarılı senkrona aittir.
          </AlertDescription>
        </Alert>
      )}

      {tur && (
        <section aria-label="Faturalar" className="grid gap-4">
          {turler.length > 1 && (
            <ToggleGroup
              variant="outline"
              spacing={0}
              aria-label="Belge türü"
              value={[tur]}
              onValueChange={(v) =>
                v[0] &&
                setSearchParams(v[0] === "E_FATURA" ? {} : { tur: v[0] }, {
                  replace: true,
                })
              }
            >
              {turler.map((t) => (
                <ToggleGroupItem key={t} value={t}>
                  {EBELGE_TUR_ETIKET[t]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <FaturaListesi key={tur} tur={tur} sabitMukellef={mukellef.id} />
        </section>
      )}

      {b.eDefter && (
        <section aria-labelledby="berat-baslik" className="grid gap-3">
          <h2 id="berat-baslik" className="text-sm font-medium">
            e-Defter beratları (son 12 dönem)
          </h2>
          <BeratMatrisi mukellefId={mukellef.id} />
        </section>
      )}
      {dialog}
    </div>
  )
}
