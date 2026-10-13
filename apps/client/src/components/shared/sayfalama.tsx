import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"

/** Sunucu taraflı sayfalama: "N kayıttan a–b arası" + önceki/sonraki. */
export function Sayfalama({
  total,
  sayfa,
  sayfaBoyutu,
  onChange,
  birim = "kayıttan",
  ek,
}: {
  total: number
  /** 1 tabanlı */
  sayfa: number
  sayfaBoyutu: number
  onChange: (sayfa: number) => void
  /** "kayıttan", "faturadan", "dosyadan" */
  birim?: string
  /** Özet satırına eklenen içerik (ör. toplam tutar) */
  ek?: ReactNode
}) {
  const sonSayfa = Math.max(Math.ceil(total / sayfaBoyutu), 1)
  const ilk = total === 0 ? 0 : (sayfa - 1) * sayfaBoyutu + 1
  const son = Math.min(sayfa * sayfaBoyutu, total)

  return (
    <nav
      aria-label="Sayfalama"
      className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <span aria-live="polite">
        {total} {birim} {ilk}–{son} arası gösteriliyor
        {ek}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={sayfa <= 1}
          onClick={() => onChange(sayfa - 1)}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          Önceki
        </Button>
        <span className="tabular-nums">
          Sayfa {sayfa} / {sonSayfa}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={sayfa >= sonSayfa}
          onClick={() => onChange(sayfa + 1)}
        >
          Sonraki
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            data-icon="inline-end"
            strokeWidth={2}
          />
        </Button>
      </div>
    </nav>
  )
}
