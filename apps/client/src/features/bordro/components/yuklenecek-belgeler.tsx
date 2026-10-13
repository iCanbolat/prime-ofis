import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

import { FileDropzone } from "@/components/shared/file-dropzone"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DosyaIkonu } from "@/features/arsiv/components/dosya-gorsel"
import { formatBoyut } from "@prime/shared/arsiv/kurallar"
import { BordroBelgeSelect } from "@/features/bordro/components/bordro-belge-select"
import {
  BORDRO_BELGE_ACCEPT,
  belgelereCevir,
  yuklemeyeCevir,
  type YuklenecekBelge,
} from "@/features/bordro/belge-yukleme"
import { useBordroBelgeEkle } from "@/features/bordro/queries"
import { formatDonem } from "@prime/shared/lib/format"

/** Yüklenecek dosyalar: her satırda tür seçimi ve kaldır düğmesi */
export function YuklenecekBelgeListesi({
  belgeler,
  onChange,
  aciklama,
  disabled,
}: {
  belgeler: YuklenecekBelge[]
  onChange: (belgeler: YuklenecekBelge[]) => void
  /** Satır altına not (ör. "Toplamlar bu dosyadan okunur") */
  aciklama?: (belge: YuklenecekBelge) => string | undefined
  disabled?: boolean
}) {
  if (belgeler.length === 0) return null
  return (
    <ul className="grid gap-2" aria-label="Yüklenecek dosyalar">
      {belgeler.map((b) => {
        const not = aciklama?.(b)
        return (
          <li
            key={b.key}
            aria-label={b.dosya.name}
            className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-center"
          >
            <div className="flex min-w-0 items-center gap-3">
              <DosyaIkonu mimeType={b.dosya.type} className="size-8" />
              <div className="grid min-w-0 leading-snug">
                <span className="truncate text-sm font-medium">
                  {b.dosya.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatBoyut(b.dosya.size)}
                  {not && ` · ${not}`}
                </span>
              </div>
            </div>
            <BordroBelgeSelect
              aria-label={`${b.dosya.name} belge türü`}
              value={b.tur}
              onValueChange={(tur) =>
                tur &&
                onChange(
                  belgeler.map((x) => (x.key === b.key ? { ...x, tur } : x))
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${b.dosya.name} kaldır`}
              disabled={disabled}
              className="justify-self-end"
              onClick={() => onChange(belgeler.filter((x) => x.key !== b.key))}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function BelgeEkleForm({
  mukellefId,
  donem,
  mukellefUnvan,
  onClose,
}: {
  mukellefId: string
  donem: string
  mukellefUnvan: string
  onClose: () => void
}) {
  const ekle = useBordroBelgeEkle()
  const [belgeler, setBelgeler] = useState<YuklenecekBelge[]>([])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (belgeler.length === 0) return
    // mutateAsync: kayıttan sonra detay paneli yeniden kurulur; mutate'in çağrı yeri
    // callback'leri bileşen kalkınca çalışmaz
    try {
      await ekle.mutateAsync({
        mukellefId,
        donem,
        dosyalar: await yuklemeyeCevir(belgeler),
      })
      toast.success(`${belgeler.length} belge arşive eklendi`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eklenemedi")
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Döneme belge ekle</DialogTitle>
        <DialogDescription>
          {mukellefUnvan} · {formatDonem(donem)}
        </DialogDescription>
      </DialogHeader>
      <FileDropzone
        accept={BORDRO_BELGE_ACCEPT}
        disabled={ekle.isPending}
        onFiles={(f) => setBelgeler((l) => [...l, ...belgelereCevir(f)])}
        hint="Ücret hesap pusulaları, tahakkuk, imzalı bordro veya dekont. Dosyalar okunmaz; arşive bu dönemle kaydedilir."
      />
      <YuklenecekBelgeListesi
        belgeler={belgeler}
        onChange={setBelgeler}
        disabled={ekle.isPending}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          disabled={belgeler.length === 0 || ekle.isPending}
        >
          Arşive ekle
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BordroBelgeEkleDialog({
  hedef,
  onClose,
}: {
  hedef: { mukellefId: string; donem: string; mukellefUnvan: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(hedef)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        {hedef && (
          <BelgeEkleForm
            key={`${hedef.mukellefId}:${hedef.donem}`}
            {...hedef}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
