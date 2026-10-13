import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DatePicker } from "@/components/shared/date-picker"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BordroUyariBadge } from "@/features/bordro/components/bordro-rozetleri"
import {
  HAREKET_DURUM_ETIKET,
  HAREKET_TUR_ETIKET,
} from "@prime/shared/bordro/hareket-kurallari"
import {
  useIsHareketiEkle,
  useIsHareketiGuncelle,
  useIsHareketiSil,
  useIsHareketleri,
} from "@/features/bordro/queries"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { formatDate } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import type { IsHareketiView } from "@prime/shared/types/api"
import type { IsHareketiTur } from "@prime/shared/types/domain"

const TUR_ITEMS = HAREKET_TUR_ETIKET

function EkleForm({
  mukellefId: sabitMukellef,
  onClose,
}: {
  mukellefId?: string
  onClose: () => void
}) {
  const ekle = useIsHareketiEkle()
  const [mukellefId, setMukellefId] = useState(sabitMukellef ?? "")
  const [tur, setTur] = useState<IsHareketiTur>("GIRIS")
  const [tarih, setTarih] = useState(bugun())
  const [kisi, setKisi] = useState("")
  const [hatalar, setHatalar] = useState<{ mukellef?: string; kisi?: string }>(
    {}
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const yeni = {
      mukellef: mukellefId ? undefined : "Bir mükellef seçin",
      kisi: kisi.trim() ? undefined : "Ad soyad girin",
    }
    setHatalar(yeni)
    if (yeni.mukellef || yeni.kisi) return
    ekle.mutate(
      { mukellefId, tur, tarih, kisi },
      {
        onSuccess: () => {
          toast.success("Bildirim takibe alındı")
          onClose()
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>İşe giriş / çıkış ekle</DialogTitle>
        <DialogDescription>
          SGK bildirim süresi takip edilir. Kimlik numarası saklanmaz.
        </DialogDescription>
      </DialogHeader>
      {!sabitMukellef && (
        <Field data-invalid={Boolean(hatalar.mukellef) || undefined}>
          <FieldLabel htmlFor="hareket-mukellef">Mükellef</FieldLabel>
          <MukellefSelect
            id="hareket-mukellef"
            value={mukellefId}
            onValueChange={setMukellefId}
            aria-invalid={Boolean(hatalar.mukellef) || undefined}
          />
          <FieldError>{hatalar.mukellef}</FieldError>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="hareket-tur">Tür</FieldLabel>
          <Select
            items={TUR_ITEMS}
            value={tur}
            onValueChange={(v) => v && setTur(v as IsHareketiTur)}
          >
            <SelectTrigger id="hareket-tur" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TUR_ITEMS) as IsHareketiTur[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TUR_ITEMS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="hareket-tarih">
            {tur === "GIRIS" ? "İşe başlama tarihi" : "İşten ayrılma tarihi"}
          </FieldLabel>
          <DatePicker id="hareket-tarih" value={tarih} onChange={setTarih} />
        </Field>
      </div>
      <Field data-invalid={Boolean(hatalar.kisi) || undefined}>
        <FieldLabel htmlFor="hareket-kisi">Ad soyad</FieldLabel>
        <Input
          id="hareket-kisi"
          value={kisi}
          maxLength={80}
          onChange={(e) => setKisi(e.target.value)}
          aria-invalid={Boolean(hatalar.kisi) || undefined}
        />
        <FieldError>{hatalar.kisi}</FieldError>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={ekle.isPending}>
          Ekle
        </Button>
      </DialogFooter>
    </form>
  )
}

export function IsHareketiEkleDialog({
  open,
  mukellefId,
  onClose,
}: {
  open: boolean
  mukellefId?: string
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && <EkleForm mukellefId={mukellefId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function kalanMetin(h: IsHareketiView) {
  if (h.durum === "BILDIRILDI") return "Bildirildi"
  if (h.kalanIsGunu < 0) return `${-h.kalanIsGunu} iş günü geçti`
  if (h.kalanIsGunu === 0) return "Bugün son gün"
  return `${h.kalanIsGunu} iş günü kaldı`
}

/** İşe giriş / çıkış bildirim takibi. `mukellefId` verilirse yalnızca o mükellefinkiler listelenir. */
export function IsHareketleri({ mukellefId }: { mukellefId?: string }) {
  const liste = useIsHareketleri({ mukellefId })
  const guncelle = useIsHareketiGuncelle()
  const sil = useIsHareketiSil()
  const [ekle, setEkle] = useState(false)
  const [silinecek, setSilinecek] = useState<IsHareketiView | null>(null)

  const toggle = (h: IsHareketiView) =>
    guncelle.mutate(
      { id: h.id, durum: h.durum === "BILDIRILDI" ? "BEKLIYOR" : "BILDIRILDI" },
      { onError: (error) => toast.error(error.message) }
    )

  return (
    <section className="grid gap-3" aria-label="İşe giriş / çıkış bildirimleri">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-medium">
          İşe giriş / çıkış bildirimleri
        </h2>
        <Button size="sm" variant="outline" onClick={() => setEkle(true)}>
          <HugeiconsIcon
            icon={UserAdd01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Bildirim ekle
        </Button>
      </div>

      {liste.isPending ? (
        <LoadingState />
      ) : liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : liste.data.length === 0 ? (
        <EmptyState
          icon={UserAdd01Icon}
          title="Takipte işe giriş / çıkış yok"
          description="Yeni işe başlayan veya ayrılan çalışanların SGK bildirim süresi burada izlenir."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <Table aria-label="İşe giriş / çıkış bildirimleri">
            <TableHeader>
              <TableRow>
                <TableHead>Çalışan</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead className="hidden sm:table-cell">Tarih</TableHead>
                <TableHead>Son gün</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liste.data.map((h) => (
                <TableRow
                  key={h.id}
                  aria-label={`${h.kisi} ${HAREKET_TUR_ETIKET[h.tur]}`}
                >
                  <TableCell className="max-w-0 min-w-32">
                    <span className="grid leading-snug">
                      <span className="truncate font-medium">{h.kisi}</span>
                      {!mukellefId && (
                        <span className="truncate text-xs text-muted-foreground">
                          {h.mukellefUnvan}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{HAREKET_TUR_ETIKET[h.tur]}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {formatDate(h.tarih)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="tabular-nums">
                      {formatDate(h.sonTarih)}
                    </span>
                    <span className="block text-xs">{kalanMetin(h)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {h.durum === "BILDIRILDI" ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        >
                          {HAREKET_DURUM_ETIKET[h.durum]}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {HAREKET_DURUM_ETIKET[h.durum]}
                        </Badge>
                      )}
                      <BordroUyariBadge uyari={h.uyari} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={guncelle.isPending}
                        onClick={() => toggle(h)}
                      >
                        {h.durum === "BILDIRILDI" ? "Geri al" : "Bildirildi"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${h.kisi} kaydını sil`}
                        onClick={() => setSilinecek(h)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <IsHareketiEkleDialog
        open={ekle}
        mukellefId={mukellefId}
        onClose={() => setEkle(false)}
      />
      <ConfirmDialog
        open={Boolean(silinecek)}
        onOpenChange={(open) => !open && setSilinecek(null)}
        title="Kayıt silinsin mi?"
        description={
          silinecek &&
          `${silinecek.kisi} için ${HAREKET_TUR_ETIKET[silinecek.tur].toLocaleLowerCase("tr-TR")} takibi silinecek.`
        }
        confirmLabel="Sil"
        destructive
        pending={sil.isPending}
        onConfirm={() =>
          silinecek &&
          sil.mutate(silinecek.id, {
            onSuccess: () => {
              toast.success("Kayıt silindi")
              setSilinecek(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </section>
  )
}
