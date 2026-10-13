import { useMemo } from "react"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePersonelList } from "@/features/auth/queries"

interface PersonelSelectProps {
  value: string
  onValueChange: (value: string) => void
  /** Verilirse listenin başına "tümü" gibi boş değerli bir seçenek eklenir. */
  bosSecenek?: string
  placeholder?: string
  id?: string
  className?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
}

const BOS = "__bos__"

export function PersonelSelect({
  value,
  onValueChange,
  bosSecenek,
  placeholder = "Personel seçin",
  id,
  className,
  ...aria
}: PersonelSelectProps) {
  const personel = usePersonelList()
  const aktifler = useMemo(
    () => personel.data?.filter((p) => p.aktif) ?? [],
    [personel.data]
  )

  const items = useMemo(() => {
    const map: Record<string, string> = {}
    if (bosSecenek) map[BOS] = bosSecenek
    for (const p of aktifler) map[p.id] = `${p.ad} ${p.soyad}`
    return map
  }, [aktifler, bosSecenek])

  return (
    <Select
      items={items}
      value={value || (bosSecenek ? BOS : null)}
      onValueChange={(next) =>
        onValueChange(next === BOS || !next ? "" : String(next))
      }
    >
      <SelectTrigger id={id} className={className} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {bosSecenek && <SelectItem value={BOS}>{bosSecenek}</SelectItem>}
        {aktifler.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <PersonelAvatar personel={p} size="sm" />
            {p.ad} {p.soyad}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
