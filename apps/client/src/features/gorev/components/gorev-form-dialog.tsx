import { useMemo, useState, type FormEvent } from "react"
import { addDays } from "date-fns"
import { toast } from "sonner"

import { DatePicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/features/auth/store"
import {
  donemGorevleriniPlanla,
  donemSecenekleri,
  otomatikGorevBasligi,
  tipPeriyotlari,
} from "@prime/shared/gorev/kurallar"
import { useGorevOlustur } from "@/features/gorev/queries"
import {
  CHECKLIST_SABLONLARI,
  GOREV_ONCELIK_ETIKET,
  GOREV_ONCELIK_SIRASI,
  GOREV_TIP_SIRASI,
} from "@prime/shared/gorev/sabitler"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { useMukellefList } from "@/features/mukellef/queries"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type { GorevView } from "@prime/shared/types/api"
import type { GorevOncelik, GorevTip } from "@prime/shared/types/domain"

export interface GorevHedef {
  /** Verilirse mükellef sabittir (mükellef kartı) */
  mukellefId?: string
}

const TIP_ITEMS: Record<GorevTip, string> = {
  ...(Object.fromEntries(
    Object.entries(YUKUMLULUK_TANIMLARI).map(([k, v]) => [k, v.ad])
  ) as Record<Exclude<GorevTip, "DIGER">, string>),
  DIGER: "Diğer (serbest görev)",
}
const DONEMSIZ = "__yok__"

function GorevForm({
  hedef,
  onOlustu,
  onClose,
}: {
  hedef: GorevHedef
  onOlustu: (g: GorevView) => void
  onClose: () => void
}) {
  const user = useAuthStore((s) => s.user)
  const olustur = useGorevOlustur()
  const mukellefler = useMukellefList({ durum: "aktif" })
  const bugunYmd = bugun()

  const [mukellefId, setMukellefId] = useState(hedef.mukellefId ?? "")
  const [tip, setTip] = useState<GorevTip>("DIGER")
  const [donem, setDonem] = useState("")
  const [baslik, setBaslik] = useState("")
  const [baslikElle, setBaslikElle] = useState(false)
  const [aciklama, setAciklama] = useState("")
  const [atananElle, setAtananElle] = useState("")
  const [oncelik, setOncelik] = useState<GorevOncelik>("NORMAL")
  const [sonTarihElle, setSonTarihElle] = useState("")
  const [hatalar, setHatalar] = useState<Record<string, string | undefined>>({})

  const mukellef = mukellefler.data?.items.find((m) => m.id === mukellefId)
  const donemler = useMemo(
    () =>
      tip === "DIGER"
        ? donemSecenekleri(bugunYmd, ["AYLIK"])
        : donemSecenekleri(bugunYmd, tipPeriyotlari(tip)),
    [tip, bugunYmd]
  )
  const donemItems = useMemo(
    () => ({
      ...(tip === "DIGER" ? { [DONEMSIZ]: "Dönemsiz" } : {}),
      ...Object.fromEntries(donemler.map((d) => [d.value, d.label])),
    }),
    [donemler, tip]
  )

  // Beyanname görevinde son gün takvim motorundan önerilir
  const onerilenSonTarih = useMemo(() => {
    if (tip === "DIGER" || !mukellef || !donem) return undefined
    return donemGorevleriniPlanla([mukellef], tip, donem, new Map())[0]
      ?.sonTarih
  }, [tip, mukellef, donem])
  const tabiDegil =
    tip !== "DIGER" && mukellef && donem && !onerilenSonTarih
      ? "Bu mükellef seçilen dönemde bu yükümlülüğe tabi değil"
      : undefined

  const sonTarih =
    sonTarihElle || onerilenSonTarih || toYmd(addDays(fromYmd(bugunYmd), 7))
  const atananId = atananElle || mukellef?.sorumluPersonelId || user?.id || ""
  const gosterilenBaslik =
    baslikElle || tip === "DIGER" || !donem
      ? baslik
      : otomatikGorevBasligi(tip, donem)

  const tipDegistir = (yeni: GorevTip) => {
    setTip(yeni)
    const secenekler =
      yeni === "DIGER" ? [] : donemSecenekleri(bugunYmd, tipPeriyotlari(yeni))
    setDonem(secenekler[0]?.value ?? "")
    setSonTarihElle("")
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const yeniHatalar = {
      mukellef: mukellefId ? undefined : "Bir mükellef seçin",
      baslik: gosterilenBaslik.trim() ? undefined : "Başlık zorunludur",
      donem: tip !== "DIGER" && !donem ? "Dönem seçin" : tabiDegil,
    }
    setHatalar(yeniHatalar)
    if (Object.values(yeniHatalar).some(Boolean)) return

    olustur.mutate(
      {
        baslik: gosterilenBaslik.trim(),
        aciklama: aciklama || undefined,
        mukellefId,
        tip,
        donem: donem || undefined,
        atananId,
        oncelik,
        sonTarih,
        checklist: CHECKLIST_SABLONLARI[tip],
      },
      {
        onSuccess: (g) => {
          toast.success("Görev oluşturuldu")
          onOlustu(g)
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Yeni görev</DialogTitle>
        <DialogDescription>
          Beyanname görevleri takvimdeki yükümlülüğe bağlanır; görev “Kontrol”
          ve “Tamam” sütunlarına geçtikçe beyan durumu da güncellenir.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {!hedef.mukellefId && (
          <Field data-invalid={Boolean(hatalar.mukellef) || undefined}>
            <FieldLabel htmlFor="gorev-mukellef">Mükellef</FieldLabel>
            <MukellefSelect
              id="gorev-mukellef"
              value={mukellefId}
              onValueChange={setMukellefId}
              aria-invalid={Boolean(hatalar.mukellef) || undefined}
            />
            <FieldError>{hatalar.mukellef}</FieldError>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="gorev-tip">Tip</FieldLabel>
            <Select
              items={TIP_ITEMS}
              value={tip}
              onValueChange={(v) => v && tipDegistir(v as GorevTip)}
            >
              <SelectTrigger id="gorev-tip" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOREV_TIP_SIRASI.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIP_ITEMS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={Boolean(hatalar.donem) || undefined}>
            <FieldLabel htmlFor="gorev-donem">Dönem</FieldLabel>
            <Select
              items={donemItems}
              value={donem || (tip === "DIGER" ? DONEMSIZ : null)}
              onValueChange={(v) => {
                setDonem(v && v !== DONEMSIZ ? String(v) : "")
                setSonTarihElle("")
              }}
            >
              <SelectTrigger
                id="gorev-donem"
                className="w-full"
                aria-invalid={Boolean(hatalar.donem) || undefined}
              >
                <SelectValue placeholder="Dönem seçin" />
              </SelectTrigger>
              <SelectContent>
                {tip === "DIGER" && (
                  <SelectItem value={DONEMSIZ}>Dönemsiz</SelectItem>
                )}
                {donemler.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{hatalar.donem ?? tabiDegil}</FieldError>
          </Field>
        </div>

        <Field data-invalid={Boolean(hatalar.baslik) || undefined}>
          <FieldLabel htmlFor="gorev-baslik">Başlık</FieldLabel>
          <Input
            id="gorev-baslik"
            value={gosterilenBaslik}
            maxLength={200}
            onChange={(e) => {
              setBaslik(e.target.value)
              setBaslikElle(true)
            }}
            placeholder="Ör. SGK işe giriş bildirgesi"
            aria-invalid={Boolean(hatalar.baslik) || undefined}
          />
          <FieldError>{hatalar.baslik}</FieldError>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="gorev-atanan">Atanan</FieldLabel>
            <PersonelSelect
              id="gorev-atanan"
              value={atananId}
              onValueChange={setAtananElle}
              className="w-full"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gorev-oncelik">Öncelik</FieldLabel>
            <Select
              items={GOREV_ONCELIK_ETIKET}
              value={oncelik}
              onValueChange={(v) => v && setOncelik(v as GorevOncelik)}
            >
              <SelectTrigger id="gorev-oncelik" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOREV_ONCELIK_SIRASI.map((o) => (
                  <SelectItem key={o} value={o}>
                    {GOREV_ONCELIK_ETIKET[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="gorev-son-tarih">Son tarih</FieldLabel>
            <DatePicker
              id="gorev-son-tarih"
              value={sonTarih}
              onChange={setSonTarihElle}
            />
            {onerilenSonTarih && !sonTarihElle && (
              <FieldDescription>Takvimdeki son gün</FieldDescription>
            )}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="gorev-aciklama">Açıklama (opsiyonel)</FieldLabel>
          <Textarea
            id="gorev-aciklama"
            rows={2}
            maxLength={2000}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
          />
          {CHECKLIST_SABLONLARI[tip].length > 0 && (
            <FieldDescription>
              Kontrol listesi şablondan eklenir:{" "}
              {CHECKLIST_SABLONLARI[tip].join(", ")}.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={olustur.isPending}>
          Görev oluştur
        </Button>
      </DialogFooter>
    </form>
  )
}

export function GorevFormDialog({
  hedef,
  onClose,
  onOlustu,
}: {
  hedef: GorevHedef | null
  onClose: () => void
  onOlustu?: (g: GorevView) => void
}) {
  return (
    <Dialog open={Boolean(hedef)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {hedef && (
          <GorevForm
            hedef={hedef}
            onClose={onClose}
            onOlustu={(g) => {
              onClose()
              onOlustu?.(g)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
