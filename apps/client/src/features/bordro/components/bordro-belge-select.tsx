import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BORDRO_BELGE_SIRASI } from "@prime/shared/bordro/kurallar"
import { BORDRO_BELGE_ETIKET } from "@prime/shared/bordro/sabitler"
import type { BordroBelgeTur } from "@prime/shared/types/domain"

const YOK = "__yok__"

/** Bordro dönem belgesinin türü. `bos` verilirse "tür yok" seçeneği eklenir (değer `null`). */
export function BordroBelgeSelect({
  id,
  value,
  onValueChange,
  bos,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: BordroBelgeTur | null
  onValueChange: (value: BordroBelgeTur | null) => void
  bos?: string
  className?: string
  "aria-label"?: string
}) {
  const items: Record<string, string> = bos
    ? { [YOK]: bos, ...BORDRO_BELGE_ETIKET }
    : BORDRO_BELGE_ETIKET
  return (
    <Select
      items={items}
      value={value ?? YOK}
      onValueChange={(v) =>
        v && onValueChange(v === YOK ? null : (v as BordroBelgeTur))
      }
    >
      <SelectTrigger
        id={id}
        className={className ?? "w-full"}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {bos && <SelectItem value={YOK}>{bos}</SelectItem>}
        {BORDRO_BELGE_SIRASI.map((t) => (
          <SelectItem key={t} value={t}>
            {BORDRO_BELGE_ETIKET[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
