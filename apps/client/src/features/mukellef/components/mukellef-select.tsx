import { useMemo } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMukellefList } from "@/features/mukellef/queries"
import { cn } from "@/lib/utils"

const BOS = "__bos__"

/** Aktif mükellefler arasından seçim */
export function MukellefSelect({
  id,
  value,
  onValueChange,
  bosSecenek,
  className,
  size,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string
  onValueChange: (id: string) => void
  /** Verilirse listenin başına boş değerli bir seçenek eklenir (filtrelerde "Tüm mükellefler"). */
  bosSecenek?: string
  className?: string
  size?: "sm" | "default"
  "aria-invalid"?: boolean
  "aria-label"?: string
}) {
  const mukellefler = useMukellefList({ durum: "aktif" })
  const items = useMemo(
    () => ({
      ...(bosSecenek ? { [BOS]: bosSecenek } : {}),
      ...Object.fromEntries(
        (mukellefler.data?.items ?? []).map((m) => [m.id, m.unvan])
      ),
    }),
    [mukellefler.data, bosSecenek]
  )
  return (
    <Select
      items={items}
      value={value || (bosSecenek ? BOS : null)}
      onValueChange={(v) => onValueChange(v && v !== BOS ? String(v) : "")}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={cn("w-full", className)}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder="Mükellef seçin" />
      </SelectTrigger>
      <SelectContent>
        {bosSecenek && <SelectItem value={BOS}>{bosSecenek}</SelectItem>}
        {(mukellefler.data?.items ?? []).map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.unvan}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
