import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { DatePicker } from "@/components/shared/date-picker"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { DosyaIkonu } from "@/features/arsiv/components/dosya-gorsel"
import { KategoriSelect } from "@/features/arsiv/components/kategori-select"
import {
  DOSYA_ACCEPT,
  GECERLILIK_GEREKEN,
  dosyaDogrula,
  dosyaMimeTuru,
  formatBoyut,
} from "@prime/shared/arsiv/kurallar"
import { useArsivYukle } from "@/features/arsiv/queries"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { dataUrlOku } from "@/lib/dosya"
import { cn } from "@/lib/utils"
import type { ArsivKategori } from "@prime/shared/types/domain"

export interface YukleHedef {
  mukellefId?: string
  kategori?: ArsivKategori
}

interface Secilen {
  key: string
  file: File
  hata: string | null
  durum: "bekliyor" | "yukleniyor" | "tamam" | "hata"
}

let sayac = 0

function YukleForm({
  hedef,
  onClose,
}: {
  hedef: YukleHedef
  onClose: () => void
}) {
  const yukle = useArsivYukle()
  const [mukellefId, setMukellefId] = useState(hedef.mukellefId ?? "")
  const [kategori, setKategori] = useState<ArsivKategori>(
    hedef.kategori ?? "DIGER"
  )
  const [gecerlilik, setGecerlilik] = useState("")
  const [dosyalar, setDosyalar] = useState<Secilen[]>([])
  const [calisiyor, setCalisiyor] = useState(false)
  const sureli = GECERLILIK_GEREKEN.includes(kategori)

  const gecerliler = dosyalar.filter((d) => !d.hata && d.durum !== "tamam")

  const ekle = (files: File[]) =>
    setDosyalar((onceki) => [
      ...onceki,
      ...files.map((file) => ({
        key: `${++sayac}`,
        file,
        hata: dosyaDogrula(file),
        durum: "bekliyor" as const,
      })),
    ])

  const durumAyarla = (key: string, durum: Secilen["durum"], hata?: string) =>
    setDosyalar((l) =>
      l.map((d) => (d.key === key ? { ...d, durum, hata: hata ?? d.hata } : d))
    )

  const gonder = async () => {
    if (!mukellefId || gecerliler.length === 0) return
    setCalisiyor(true)
    let basarili = 0
    for (const d of gecerliler) {
      durumAyarla(d.key, "yukleniyor")
      try {
        await yukle.mutateAsync({
          mukellefId,
          kategori,
          ad: d.file.name,
          mimeType: dosyaMimeTuru(d.file) ?? d.file.type,
          boyut: d.file.size,
          gecerlilikTarihi: sureli && gecerlilik ? gecerlilik : undefined,
          dataUrl: await dataUrlOku(d.file),
        })
        durumAyarla(d.key, "tamam")
        basarili++
      } catch (error) {
        durumAyarla(
          d.key,
          "hata",
          error instanceof Error ? error.message : "Yüklenemedi"
        )
      }
    }
    setCalisiyor(false)
    if (basarili > 0) toast.success(`${basarili} dosya arşive yüklendi`)
    if (basarili === gecerliler.length) onClose()
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Arşive dosya yükle</DialogTitle>
        <DialogDescription>
          PDF, JPG, PNG veya HEIC · en fazla 10 MB
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {!hedef.mukellefId && (
          <Field>
            <FieldLabel htmlFor="yukle-mukellef">Mükellef</FieldLabel>
            <MukellefSelect
              id="yukle-mukellef"
              value={mukellefId}
              onValueChange={setMukellefId}
            />
          </Field>
        )}
        <div className={cn("grid gap-4", sureli && "sm:grid-cols-2")}>
          <Field>
            <FieldLabel htmlFor="yukle-kategori">Kategori</FieldLabel>
            <KategoriSelect
              id="yukle-kategori"
              value={kategori}
              onValueChange={setKategori}
            />
          </Field>
          {sureli && (
            <Field>
              <FieldLabel htmlFor="yukle-gecerlilik">Son geçerlilik</FieldLabel>
              <DatePicker
                id="yukle-gecerlilik"
                value={gecerlilik}
                onChange={setGecerlilik}
                clearable
              />
            </Field>
          )}
        </div>
        <Field>
          <FileDropzone
            accept={DOSYA_ACCEPT}
            disabled={calisiyor}
            onFiles={ekle}
            hint="Birden fazla dosya seçebilirsiniz"
          />
          {sureli && !gecerlilik && (
            <FieldDescription>
              Geçerlilik tarihi girilirse süre dolmadan 30 gün önce uyarı
              verilir.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>

      {dosyalar.length > 0 && (
        <ul
          className="grid max-h-56 gap-1.5 overflow-y-auto"
          aria-label="Seçilen dosyalar"
        >
          {dosyalar.map((d) => (
            <li
              key={d.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2",
                d.hata && "border-destructive/40 bg-destructive/5"
              )}
            >
              <DosyaIkonu
                mimeType={dosyaMimeTuru(d.file) ?? ""}
                className="size-8"
              />
              <div className="grid min-w-0 flex-1 leading-snug">
                <span className="truncate text-sm font-medium">
                  {d.file.name}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    d.hata ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {d.hata ??
                    (d.durum === "tamam"
                      ? "Yüklendi"
                      : formatBoyut(d.file.size))}
                </span>
              </div>
              {d.durum === "yukleniyor" ? (
                <Spinner />
              ) : (
                d.durum !== "tamam" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${d.file.name} kaldır`}
                    disabled={calisiyor}
                    onClick={() =>
                      setDosyalar((l) => l.filter((x) => x.key !== d.key))
                    }
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="button"
          disabled={!mukellefId || gecerliler.length === 0 || calisiyor}
          onClick={gonder}
        >
          {calisiyor && <Spinner data-icon="inline-start" />}
          {gecerliler.length > 1 ? `${gecerliler.length} dosya yükle` : "Yükle"}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function YukleDialog({
  hedef,
  onClose,
}: {
  hedef: YukleHedef | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(hedef)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {hedef && <YukleForm hedef={hedef} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
