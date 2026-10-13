import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { KATEGORI_SIRASI } from "@prime/shared/arsiv/kurallar"
import { ARSIV_KATEGORI_ETIKET, type ArsivKategori } from "@prime/shared/types/domain"

export function KategoriSelect({
  id,
  value,
  onValueChange,
  className,
}: {
  id?: string
  value: ArsivKategori
  onValueChange: (value: ArsivKategori) => void
  className?: string
}) {
  return (
    <Select
      items={ARSIV_KATEGORI_ETIKET}
      value={value}
      onValueChange={(v) => v && onValueChange(v as ArsivKategori)}
    >
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KATEGORI_SIRASI.map((k) => (
          <SelectItem key={k} value={k}>
            {ARSIV_KATEGORI_ETIKET[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
