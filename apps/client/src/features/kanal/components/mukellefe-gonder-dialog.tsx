import { useEffect, useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useMukellefeGonder } from "@/features/kanal/queries"
import {
  GONDERIM_DURUM_ETIKET,
  MUKELLEF_KANAL_ETIKET,
} from "@prime/shared/kanal/sabitler"
import { cn } from "@/lib/utils"
import type { MukellefGonderHedef, MukellefGonderSonucu } from "@prime/shared/types/api"
import type { MesajSablonTip, MukellefKanal } from "@prime/shared/types/domain"

type KanalSecim = MukellefKanal | "TERCIH"

const DURUM_RENK: Record<string, string> = {
  GONDERILDI: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  KUYRUKTA: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  ELLE: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  HATA: "bg-destructive/10 text-destructive",
}

function SonucSatiri({
  s,
  tekli,
}: {
  s: MukellefGonderSonucu
  tekli: boolean
}) {
  return (
    <li className="grid gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{s.unvan}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">
            <HugeiconsIcon
              icon={s.kanal === "WHATSAPP" ? WhatsappIcon : Mail01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {MUKELLEF_KANAL_ETIKET[s.kanal]}
          </Badge>
          {s.durum && (
            <Badge variant="secondary" className={DURUM_RENK[s.durum]}>
              {s.durum === "ELLE"
                ? "Elle gönderilecek"
                : GONDERIM_DURUM_ETIKET[s.durum]}
            </Badge>
          )}
        </span>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {s.adres || "Adres yok"}
        {!s.durum &&
          !s.sunucudan &&
          " · kanal yapılandırılmadı, bağlantı açılacak"}
      </span>
      {s.hataMesaji && (
        <span className="text-xs text-destructive">{s.hataMesaji}</span>
      )}
      {!tekli && !s.durum && !s.hataMesaji && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{s.mesaj}</p>
      )}
      {s.link && (
        <a
          href={s.link}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "justify-self-start"
          )}
        >
          {s.kanal === "WHATSAPP" ? "WhatsApp'ta aç" : "E-postada aç"}
        </a>
      )}
    </li>
  )
}

function Icerik({
  sablon,
  hedefler,
  baslik,
  onClose,
}: {
  sablon: MesajSablonTip
  hedefler: MukellefGonderHedef[]
  baslik: string
  onClose: () => void
}) {
  const [kanal, setKanal] = useState<KanalSecim>("TERCIH")
  const onizleme = useMukellefeGonder()
  const gonder = useMukellefeGonder()
  const [metin, setMetin] = useState<string | null>(null)
  const tekli = hedefler.length === 1
  const istenen = kanal === "TERCIH" ? undefined : kanal
  const { mutate } = onizleme
  // Çağıranın her render'da yeni dizi vermesi önizlemeyi yeniden tetiklemesin
  const anahtar = JSON.stringify(hedefler)
  const sabitHedefler = useMemo(
    () => JSON.parse(anahtar) as MukellefGonderHedef[],
    [anahtar]
  )

  useEffect(() => {
    mutate(
      { sablon, kanal: istenen, hedefler: sabitHedefler, onizleme: true },
      { onSuccess: ({ sonuclar }) => setMetin(sonuclar[0]?.mesaj ?? "") }
    )
  }, [mutate, sablon, istenen, sabitHedefler])

  const on = onizleme.data?.sonuclar ?? []
  const sonuclar = gonder.data?.sonuclar
  const ilk = on[0]
  // WhatsApp Business onaylı şablonla gider; serbest metin yalnızca e-posta / wa.me'de
  const duzenlenebilir =
    tekli && ilk && !(ilk.kanal === "WHATSAPP" && ilk.sunucudan)
  const gonderilebilir = on.filter((s) => !s.hataMesaji).length

  const onayla = () =>
    gonder.mutate(
      {
        sablon,
        kanal: istenen,
        hedefler,
        metin: duzenlenebilir ? (metin ?? undefined) : undefined,
      },
      {
        onSuccess: ({ sonuclar }) => {
          const say = (d: string) =>
            sonuclar.filter((s) => s.durum === d).length
          const parcalar = [
            say("GONDERILDI") && `${say("GONDERILDI")} gönderildi`,
            say("KUYRUKTA") && `${say("KUYRUKTA")} gönderim kuyruğunda`,
            say("ELLE") && `${say("ELLE")} elle gönderilecek`,
            say("HATA") && `${say("HATA")} hatalı`,
          ].filter(Boolean)
          if (say("HATA") && say("HATA") === sonuclar.length)
            toast.error(parcalar.join(", "))
          else toast.success(parcalar.join(", "))
          // Tek ve elle gönderilecekse bağlantı hemen açılır
          if (tekli && sonuclar[0]?.link)
            window.open(sonuclar[0].link, "_blank", "noreferrer")
        },
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <div className="grid gap-6">
      <DialogHeader>
        <DialogTitle>{baslik}</DialogTitle>
        <DialogDescription>
          {tekli
            ? "Kanal yapılandırılmışsa mesaj sunucudan gider; değilse WhatsApp / e-posta bağlantısı açılır."
            : `${hedefler.length} mükellef · kanal yapılandırılmamışsa her satır için bağlantı gösterilir.`}
        </DialogDescription>
      </DialogHeader>

      {!sonuclar && (
        <Field>
          <FieldLabel htmlFor="gonder-kanal">Kanal</FieldLabel>
          <Select
            items={{
              TERCIH: "Mükellef tercihi",
              WHATSAPP: "WhatsApp",
              EPOSTA: "E-posta",
            }}
            value={kanal}
            onValueChange={(v) => v && setKanal(v as KanalSecim)}
          >
            <SelectTrigger id="gonder-kanal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TERCIH">Mükellef tercihi</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="EPOSTA">E-posta</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      {onizleme.isError ? (
        <ErrorState error={onizleme.error} onRetry={() => onizleme.reset()} />
      ) : !onizleme.data ? (
        <LoadingState />
      ) : sonuclar ? (
        <ul
          className="max-h-80 divide-y overflow-y-auto"
          aria-label="Gönderim sonuçları"
        >
          {sonuclar.map((s) => (
            <SonucSatiri key={s.mukellefId} s={s} tekli={tekli} />
          ))}
        </ul>
      ) : (
        <>
          {tekli && ilk && (
            <Field>
              <FieldLabel htmlFor="gonder-metin">Mesaj</FieldLabel>
              <Textarea
                id="gonder-metin"
                rows={6}
                value={metin ?? ""}
                readOnly={!duzenlenebilir}
                onChange={(e) => setMetin(e.target.value)}
              />
              {!duzenlenebilir && (
                <FieldDescription>
                  WhatsApp Business onaylı şablonla gönderir; metin Mesaj
                  Şablonları'ndan gelir.
                </FieldDescription>
              )}
            </Field>
          )}
          <ul
            className="max-h-72 divide-y overflow-y-auto"
            aria-label="Alıcılar"
          >
            {on.map((s) => (
              <SonucSatiri key={s.mukellefId} s={s} tekli={tekli} />
            ))}
          </ul>
        </>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {sonuclar ? "Kapat" : "Vazgeç"}
        </Button>
        {!sonuclar && (
          <Button
            disabled={
              !onizleme.data || gonderilebilir === 0 || gonder.isPending
            }
            onClick={onayla}
          >
            {gonder.isPending
              ? "Gönderiliyor…"
              : tekli
                ? "Gönder"
                : `${gonderilebilir} mükellefe gönder`}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

/** Şablonlu mesajı bir veya birden çok mükellefe gönderir (önizleme → gönder → sonuç) */
export function MukellefeGonderDialog({
  acik,
  sablon,
  hedefler,
  baslik,
  onClose,
}: {
  acik: boolean
  sablon: MesajSablonTip
  hedefler: MukellefGonderHedef[]
  baslik: string
  onClose: () => void
}) {
  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {acik && hedefler.length > 0 && (
          <Icerik
            sablon={sablon}
            hedefler={hedefler}
            baslik={baslik}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
