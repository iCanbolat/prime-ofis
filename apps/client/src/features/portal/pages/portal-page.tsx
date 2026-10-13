import { useState } from "react"
import { useParams } from "react-router"
import { differenceInCalendarDays } from "date-fns"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { ErrorState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { dosyaDogrula, dosyaMimeTuru } from "@prime/shared/arsiv/kurallar"
import { portalApi } from "@/features/portal/api"
import { DurumEkrani } from "@/features/portal/components/durum-ekrani"
import {
  IstenenSatiri,
  type YerelYukleme,
} from "@/features/portal/components/istenen-satiri"
import { dataUrlOku } from "@/lib/dosya"
import { formatDate, formatDonem, initials } from "@prime/shared/lib/format"
import { gorselKucult } from "@/lib/gorsel"
import { ApiError } from "@/lib/http"
import type { PortalResponse } from "@prime/shared/types/api"
import type { IstenenEvrak } from "@prime/shared/types/domain"

const portalKey = (token: string) => ["portal", token] as const
let sayac = 0

function YuklemeFormu({
  token,
  portal,
}: {
  token: string
  portal: PortalResponse
}) {
  const queryClient = useQueryClient()
  const [yerel, setYerel] = useState<YerelYukleme[]>([])
  const [not, setNot] = useState("")
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [degisiklikYok, setDegisiklikYok] = useState(false)
  const [bitti, setBitti] = useState<number | null>(null)

  const yenile = () =>
    queryClient.invalidateQueries({ queryKey: portalKey(token) })
  const guncelle = (key: string, patch: Partial<YerelYukleme>) =>
    setYerel((l) => l.map((y) => (y.key === key ? { ...y, ...patch } : y)))

  const yukleTek = async (dosya: File, istenen: IstenenEvrak) => {
    const key = `y${++sayac}`
    setYerel((l) => [
      ...l,
      {
        key,
        istenen,
        ad: dosya.name,
        mimeType: dosyaMimeTuru(dosya) ?? "",
        ilerleme: null,
      },
    ])
    const hazir = await gorselKucult(dosya)
    const hata = dosyaDogrula(hazir)
    if (hata) return guncelle(key, { hata })
    try {
      guncelle(key, { ad: hazir.name, ilerleme: 0 })
      await portalApi.yukle(
        token,
        {
          istenen,
          ad: hazir.name,
          mimeType: dosyaMimeTuru(hazir) ?? hazir.type,
          boyut: hazir.size,
          dataUrl: await dataUrlOku(hazir),
        },
        (ilerleme) => guncelle(key, { ilerleme })
      )
      await yenile()
      setYerel((l) => l.filter((y) => y.key !== key))
    } catch (error) {
      guncelle(key, {
        hata: error instanceof Error ? error.message : "Yüklenemedi",
      })
      // Talep bu sırada kapandıysa durum ekranına geç
      if (error instanceof ApiError && error.status === 410) void yenile()
    }
  }

  const onDosyalar = (files: File[], istenen: IstenenEvrak) =>
    void Promise.all(files.map((f) => yukleTek(f, istenen)))

  const sil = async (id: string) => {
    try {
      await portalApi.sil(token, id)
      await yenile()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Silinemedi")
    }
  }

  const bekleyen = portal.yuklemeler.filter(
    (y) => y.durum === "BEKLIYOR"
  ).length
  const devamEden = yerel.some((y) => !y.hata)
  const tamamlanan = portal.istenenler.filter(
    (i) =>
      (i === "PUANTAJ" && degisiklikYok) ||
      portal.yuklemeler.some((y) => y.istenen === i && y.durum !== "REDDEDILDI")
  ).length
  const gonderilebilir = bekleyen > 0 || degisiklikYok

  const tamamla = async () => {
    setGonderiliyor(true)
    try {
      await portalApi.tamamla(token, {
        not: not.trim() || undefined,
        ...(degisiklikYok && { degisiklikYok: true }),
      })
      setBitti(bekleyen)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gönderilemedi")
      void yenile()
    } finally {
      setGonderiliyor(false)
    }
  }

  if (bitti !== null)
    return <DurumEkrani tip="BASARI" portal={portal} yuklenenSayisi={bitti} />

  const kalanGun = differenceInCalendarDays(
    new Date(portal.sonKullanma),
    new Date()
  )

  return (
    <>
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(portal.buro.ad)}
            </span>
            <span className="text-sm text-muted-foreground">
              {portal.buro.ad}
            </span>
          </div>
          <div className="grid gap-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Merhaba, {portal.mukellefUnvan}
            </h1>
            <p className="text-sm text-muted-foreground">
              Aşağıdaki evrakları fotoğrafını çekerek veya dosya seçerek
              yükleyin. Giriş yapmanız gerekmez.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {portal.donem && (
              <Badge variant="outline">
                Dönem: {formatDonem(portal.donem)}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={
                kalanGun <= 2
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                  : undefined
              }
            >
              Son gün: {formatDate(portal.sonKullanma)}
              {kalanGun >= 0 &&
                ` (${kalanGun === 0 ? "bugün" : `${kalanGun} gün`})`}
            </Badge>
          </div>
          {portal.aciklama && (
            <p className="rounded-xl bg-muted/60 p-3 text-sm">
              <span className="font-medium">Büronuzun notu: </span>
              {portal.aciklama}
            </p>
          )}
          <div className="grid gap-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>İlerleme</span>
              <span className="tabular-nums">
                {tamamlanan} / {portal.istenenler.length} evrak
              </span>
            </div>
            <Progress
              value={(tamamlanan / portal.istenenler.length) * 100}
              aria-label="Evrak ilerlemesi"
            />
          </div>
        </CardContent>
      </Card>

      <ul className="grid gap-3" aria-label="İstenen evraklar">
        {portal.istenenler.map((i) => (
          <IstenenSatiri
            key={i}
            istenen={i}
            yuklemeler={portal.yuklemeler.filter((y) => y.istenen === i)}
            yerel={yerel.filter((y) => y.istenen === i)}
            onDosyalar={onDosyalar}
            onSil={(id) => void sil(id)}
            onYerelKaldir={(key) =>
              setYerel((l) => l.filter((y) => y.key !== key))
            }
            degisiklikYok={
              i === "PUANTAJ" && portal.degisiklikYokSecilebilir
                ? { secili: degisiklikYok, onChange: setDegisiklikYok }
                : undefined
            }
          />
        ))}
      </ul>

      <Card>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="portal-not">
              Büronuza not (isteğe bağlı)
            </FieldLabel>
            <Textarea
              id="portal-not"
              rows={2}
              maxLength={500}
              value={not}
              onChange={(e) => setNot(e.target.value)}
              placeholder="Ör. Eksik faturayı haftaya ileteceğim."
            />
          </Field>
          <Button
            size="lg"
            disabled={!gonderilebilir || devamEden || gonderiliyor}
            onClick={() => void tamamla()}
          >
            {gonderiliyor && <Spinner data-icon="inline-start" />}
            {bekleyen > 0
              ? `Gönderimi tamamla (${bekleyen} dosya)`
              : "Gönderimi tamamla"}
          </Button>
          {!gonderilebilir && (
            <p className="text-center text-xs text-muted-foreground">
              {portal.degisiklikYokSecilebilir
                ? "Göndermek için en az bir dosya yükleyin veya puantajda “Bu ay değişiklik yok”u seçin."
                : "Göndermek için en az bir dosya yükleyin."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Müşteri yükleme portalı: /p/:token (girişsiz, mobil öncelikli) */
export function PortalPage() {
  const { token = "" } = useParams()
  const portal = useQuery({
    queryKey: portalKey(token),
    queryFn: () => portalApi.get(token),
    retry: (sayi, error) =>
      !(error instanceof ApiError && error.status === 404) && sayi < 2,
  })

  if (portal.isPending)
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  if (portal.isError) {
    if (portal.error instanceof ApiError && portal.error.status === 404)
      return <DurumEkrani tip="GECERSIZ" />
    return <ErrorState error={portal.error} onRetry={() => portal.refetch()} />
  }
  if (portal.data.durum !== "AKTIF")
    return <DurumEkrani tip={portal.data.durum} portal={portal.data} />
  return <YuklemeFormu token={token} portal={portal.data} />
}
