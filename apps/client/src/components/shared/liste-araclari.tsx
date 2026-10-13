/**
 * Liste ekranlarının ortak araç çubuğu: solda arama, sağda sekme filtre + filtre sheet'i +
 * görünüm toggle'ı. Mükellefler, e-Belge, Görevler ve Arşiv aynı düzeni kullanır.
 */
import { useEffect, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FilterHorizontalIcon,
  GridViewIcon,
  ListViewIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ListeGorunum } from "@/hooks/use-liste-gorunumu"
import { useIsDar } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

const ARAMA_GECIKMESI_MS = 300

/** Yazarken URL'i her tuşta değil, kısa bir beklemeden sonra günceller. */
export function AramaKutusu({
  value,
  onChange,
  placeholder,
  etiket,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  /** Erişilebilir ad */
  etiket: string
  className?: string
}) {
  const [text, setText] = useState(value)

  // URL dışarıdan değişirse (filtreleri temizle, geri tuşu) kutuyu eşitle.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(value)
  }

  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onChange(text), ARAMA_GECIKMESI_MS)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <InputGroup className={cn("w-full sm:w-72", className)}>
      <InputGroupAddon>
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={etiket}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </InputGroup>
  )
}

/** Solda arama, sağda (justify-between) filtre ve görünüm düğmeleri. */
export function ListeAraclari({
  arama,
  children,
  etiket,
}: {
  arama: ReactNode
  children?: ReactNode
  etiket?: string
}) {
  return (
    <div
      role="search"
      aria-label={etiket}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      {arama}
      {children && (
        <div className="flex min-w-0 items-center gap-2 max-sm:w-full max-sm:justify-between">
          {children}
        </div>
      )}
    </div>
  )
}

/** Sekme görünümlü tek seçimli filtre; `null` = "Tümü". */
export function SekmeFiltre<T extends string>({
  etiket,
  secenekler,
  value,
  onChange,
  tumu = "Tümü",
}: {
  etiket: string
  secenekler: Record<T, string>
  value: T | null | undefined
  onChange: (v: T | null) => void
  /** `false`: "Tümü" seçeneği gösterilmez */
  tumu?: string | false
}) {
  const TUMU = "__tumu__"
  return (
    <div className="min-w-0 [scrollbar-width:none] overflow-x-auto">
      <ToggleGroup
        variant="outline"
        spacing={0}
        aria-label={etiket}
        value={[value ?? TUMU]}
        onValueChange={(v) =>
          v[0] && onChange(v[0] === TUMU ? null : (v[0] as T))
        }
      >
        {tumu !== false && (
          <ToggleGroupItem value={TUMU}>{tumu}</ToggleGroupItem>
        )}
        {(Object.entries(secenekler) as [T, string][]).map(([k, ad]) => (
          <ToggleGroupItem key={k} value={k} className="whitespace-nowrap">
            {ad}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Sheet içinde etiketli filtre alanı */
export function FiltreAlani({
  etiket,
  htmlFor,
  children,
}: {
  etiket: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{etiket}</FieldLabel>
      {children}
    </Field>
  )
}

/**
 * Sağdan açılan filtre paneli. Değişiklikler taslakta tutulur; "Uygula" ile URL'e yazılır.
 * `children(taslak, degistir)` alanları çizer.
 */
export function FiltreSheet<T extends object>({
  deger,
  varsayilan,
  onUygula,
  aktifSayi,
  children,
  aciklama = "Seçimleriniz “Uygula” ile listeye yansır.",
}: {
  deger: T
  /** "Temizle" taslağı bu değere döndürür */
  varsayilan: T
  onUygula: (taslak: T) => void
  /** Tetikleyicideki rozet: panelde seçili filtre sayısı */
  aktifSayi: number
  children: (taslak: T, degistir: (patch: Partial<T>) => void) => ReactNode
  aciklama?: string
}) {
  const [acik, setAcik] = useState(false)
  const [taslak, setTaslak] = useState(deger)

  const ac = () => {
    setTaslak(deger)
    setAcik(true)
  }
  const degistir = (patch: Partial<T>) => setTaslak((t) => ({ ...t, ...patch }))
  const uygula = () => {
    onUygula(taslak)
    setAcik(false)
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative shrink-0 max-sm:px-2.5"
        aria-label={
          aktifSayi > 0 ? `Filtreler, ${aktifSayi} filtre seçili` : "Filtreler"
        }
        onClick={ac}
      >
        <HugeiconsIcon
          icon={FilterHorizontalIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className="max-sm:sr-only">Filtreler</span>
        {aktifSayi > 0 && (
          <span
            aria-hidden="true"
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground tabular-nums max-sm:absolute max-sm:-top-1.5 max-sm:-right-1.5 max-sm:h-4 max-sm:min-w-4 max-sm:text-[10px]"
          >
            {aktifSayi}
          </span>
        )}
      </Button>

      <Sheet open={acik} onOpenChange={setAcik}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filtreler</SheetTitle>
            <SheetDescription>{aciklama}</SheetDescription>
          </SheetHeader>
          <form
            id="filtre-sheet"
            className="grid flex-1 content-start gap-5 overflow-y-auto px-4 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              uygula()
            }}
          >
            {children(taslak, degistir)}
          </form>
          <SheetFooter className="flex-row justify-end gap-2 border-t">
            <Button variant="ghost" onClick={() => setTaslak(varsayilan)}>
              Temizle
            </Button>
            <Button type="submit" form="filtre-sheet">
              Uygula
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Izgara / liste görünüm toggle'ı. Tablet ve altında ızgara zorunlu olduğundan gizlenir. */
export function GorunumToggle({
  value,
  onChange,
}: {
  value: ListeGorunum
  onChange: (g: ListeGorunum) => void
}) {
  const dar = useIsDar()
  if (dar) return null
  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      aria-label="Görünüm"
      className="shrink-0"
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as ListeGorunum)}
    >
      <ToggleGroupItem value="grid" aria-label="Izgara görünümü">
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="liste" aria-label="Liste görünümü">
        <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
