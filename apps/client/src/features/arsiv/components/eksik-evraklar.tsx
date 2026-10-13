import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  Upload04Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import type { ArsivAgacMukellef } from "@prime/shared/types/api"
import { ARSIV_KATEGORI_ETIKET, type ArsivKategori } from "@prime/shared/types/domain"

/** Mükellef türüne göre arşivde olması gereken ama bulunmayan evraklar. */
export function EksikEvraklar({
  eksikler,
  onYukle,
  onEvrakIste,
}: {
  eksikler: ArsivKategori[]
  onYukle: (kategori: ArsivKategori) => void
  /** Müşteriden evrak talebi oluştur (tek tıkla, eksik kategoriler seçili) */
  onEvrakIste: (kategoriler: ArsivKategori[]) => void
}) {
  if (eksikler.length === 0) return null
  return (
    <section
      aria-label="Eksik zorunlu evraklar"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="size-4"
          />
        </span>
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="leading-snug">
              <h2 className="text-sm font-medium">Eksik zorunlu evraklar</h2>
              <p className="text-xs text-muted-foreground">
                Bu mükellef türü için arşivde bulunması gereken belgeler
              </p>
            </div>
            {eksikler.length > 1 && (
              <Button size="xs" onClick={() => onEvrakIste(eksikler)}>
                <HugeiconsIcon
                  icon={WhatsappIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Tümünü müşteriden iste
              </Button>
            )}
          </div>
          <ul className="grid gap-2">
            {eksikler.map((k) => (
              <li key={k} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm">
                  {ARSIV_KATEGORI_ETIKET[k]}
                </span>
                <Button size="xs" variant="outline" onClick={() => onYukle(k)}>
                  <HugeiconsIcon
                    icon={Upload04Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Yükle
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onEvrakIste([k])}
                >
                  Evrak iste
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** Tüm mükelleflerin eksik zorunlu evrakları (panodaki "Eksik zorunlu evrak" bağlantısı). */
export function EksikEvrakOzeti({
  mukellefler,
  onAc,
  onEvrakIste,
}: {
  mukellefler: ArsivAgacMukellef[]
  onAc: (mukellefId: string) => void
  onEvrakIste: (mukellefId: string, kategoriler: ArsivKategori[]) => void
}) {
  const eksikli = mukellefler.filter((m) => m.eksikZorunlu.length > 0)
  if (eksikli.length === 0) return null
  return (
    <section
      aria-label="Eksik zorunlu evrakı olan mükellefler"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="size-4"
          />
        </span>
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="leading-snug">
            <h2 className="text-sm font-medium">
              Eksik zorunlu evrak · {eksikli.length} mükellef
            </h2>
            <p className="text-xs text-muted-foreground">
              Mükellef türüne göre arşivde bulunması gereken ama olmayan
              belgeler
            </p>
          </div>
          <ul className="grid divide-y divide-amber-500/20">
            {eksikli.map((m) => (
              <li
                key={m.mukellefId}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <span className="grid min-w-0 flex-1 leading-snug">
                  <span className="truncate text-sm font-medium">
                    {m.unvan}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.eksikZorunlu
                      .map((k) => ARSIV_KATEGORI_ETIKET[k])
                      .join(", ")}
                  </span>
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onAc(m.mukellefId)}
                >
                  Klasörü aç
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onEvrakIste(m.mukellefId, m.eksikZorunlu)}
                >
                  <HugeiconsIcon
                    icon={WhatsappIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Evrak iste
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
