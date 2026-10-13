import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { useTakvimParams } from "@/features/takvim/hooks/use-takvim-params"
import {
  YUKUMLULUK_SIRASI,
  YUKUMLULUK_TANIMLARI,
} from "@prime/shared/takvim/kurallar"
import { TAKVIM_DURUM_FILTRE_ETIKET } from "@prime/shared/takvim/sabitler"
import type { TakvimDurumFiltre } from "@prime/shared/types/api"
import {
  MUKELLEF_TUR_ETIKET,
  type MukellefTur,
  type YukumlulukTip,
} from "@prime/shared/types/domain"

export function TakvimFiltreleri() {
  const p = useTakvimParams()
  const tipEtiketi =
    p.tip.length === 0
      ? "Tüm yükümlülükler"
      : p.tip.length === 1
        ? YUKUMLULUK_TANIMLARI[p.tip[0]].ad
        : `${p.tip.length} yükümlülük seçili`

  const tipDegistir = (tip: YukumlulukTip, secili: boolean) =>
    p.update({ tip: secili ? [...p.tip, tip] : p.tip.filter((t) => t !== tip) })

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="search"
      aria-label="Takvim filtreleri"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Yükümlülük filtresi: ${tipEtiketi}`}
            />
          }
        >
          {tipEtiketi}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            strokeWidth={2}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56">
          {YUKUMLULUK_SIRASI.map((tip) => (
            <DropdownMenuCheckboxItem
              key={tip}
              checked={p.tip.includes(tip)}
              onCheckedChange={(checked) => tipDegistir(tip, checked)}
            >
              {YUKUMLULUK_TANIMLARI[tip].ad}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Mükellef türü"
        value={p.tur}
        onValueChange={(value) => p.update({ tur: value as MukellefTur[] })}
      >
        {(Object.keys(MUKELLEF_TUR_ETIKET) as MukellefTur[]).map((tur) => (
          <ToggleGroupItem key={tur} value={tur}>
            {MUKELLEF_TUR_ETIKET[tur]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <PersonelSelect
        aria-label="Sorumlu personel"
        bosSecenek="Tüm personel"
        value={p.sorumlu ?? ""}
        onValueChange={(sorumlu) => p.update({ sorumlu: sorumlu || undefined })}
        className="w-44"
      />

      {p.aralik !== "geciken" && (
        <Select
          items={TAKVIM_DURUM_FILTRE_ETIKET}
          value={p.durum ?? "tumu"}
          onValueChange={(d) =>
            p.update({
              durum: d && d !== "tumu" ? (d as TakvimDurumFiltre) : undefined,
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Beyan durumu" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TAKVIM_DURUM_FILTRE_ETIKET).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      )}

      {p.filtreVar && (
        <Button variant="ghost" size="sm" onClick={p.filtreleriTemizle}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          Filtreleri temizle
        </Button>
      )}
    </div>
  )
}
