import { useMemo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePersonelList } from "@/features/auth/queries"
import { useGorevOzet } from "@/features/gorev/queries"
import { cn } from "@/lib/utils"

/** Yan yana gösterilen en fazla avatar; fazlası "+N" menüsünde */
const GORUNUR_AVATAR = 5

type IsYuku = { acik: number; geciken: number }

/** Avatarın köşesindeki açık görev sayısı; gecikmiş varsa kırmızı. Rozetler üst üste
 * binmesin diye yalnızca kendi avatarının üzerine gelinince (veya klavyeyle odaklanınca) görünür. */
function IsYukuRozeti({ yuk }: { yuk: IsYuku | undefined }) {
  if (!yuk?.acik) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums opacity-0 ring-2 ring-background transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100",
        yuk.geciken > 0
          ? "bg-destructive text-white"
          : "bg-muted text-muted-foreground"
      )}
    >
      {yuk.acik}
    </span>
  )
}

const yukMetni = (yuk: IsYuku | undefined) =>
  `${yuk?.acik ?? 0} açık${yuk?.geciken ? `, ${yuk.geciken} gecikmiş` : ""}`

/**
 * Jira tarzı atanan filtresi: üst üste binen personel avatarları, her biri aç/kapa.
 * Birden çok kişi seçilebilir; oturumdaki kullanıcı başta gelir. `value` içindeki
 * "benim" oturumdaki kullanıcıya çözülür; değişiklikte gerçek id'ler yazılır.
 * Avatar rozetleri filtreden bağımsız büro geneli iş yükünü (açık/gecikmiş) gösterir.
 */
export function AtananFiltresi({
  kullaniciId,
  value,
  onChange,
}: {
  kullaniciId: string | undefined
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const personel = usePersonelList()
  const ozet = useGorevOzet()
  const yukler = useMemo(
    () => new Map(ozet.data?.personel.map((x) => [x.personelId, x])),
    [ozet.data]
  )
  const liste = useMemo(() => {
    const aktifler = (personel.data ?? []).filter((p) => p.aktif)
    return [
      ...aktifler.filter((p) => p.id === kullaniciId),
      ...aktifler.filter((p) => p.id !== kullaniciId),
    ]
  }, [personel.data, kullaniciId])

  const secili = new Set(
    value.map((v) => (v === "benim" ? (kullaniciId ?? v) : v))
  )
  const degistir = (id: string, sec: boolean) => {
    const next = new Set(secili)
    if (sec) next.add(id)
    else next.delete(id)
    onChange([...next])
  }

  const gorunur = liste.slice(0, GORUNUR_AVATAR)
  const fazla = liste.slice(GORUNUR_AVATAR)
  const fazlaSecili = fazla.filter((p) => secili.has(p.id)).length

  if (liste.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Atanan kişiye göre filtrele"
      className="flex shrink-0 items-center gap-1"
    >
      <div className="flex items-center -space-x-1.5">
        {gorunur.map((p) => {
          const ad = `${p.ad} ${p.soyad}${p.id === kullaniciId ? " (siz)" : ""}`
          const aktif = secili.has(p.id)
          const yuk = yukler.get(p.id)
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={aktif}
                    aria-label={ad}
                    aria-describedby={`is-yuku-${p.id}`}
                    onClick={() => degistir(p.id, !aktif)}
                    className={cn(
                      "group/avatar relative rounded-full ring-2 ring-background transition outline-none hover:z-20 hover:-translate-y-0.5 hover:opacity-100 focus-visible:z-20 focus-visible:ring-ring/60",
                      aktif &&
                        "z-10 ring-primary ring-offset-2 ring-offset-background",
                      // Seçim varken seçilmeyenler soluklaşır
                      secili.size > 0 && !aktif && "opacity-50"
                    )}
                  />
                }
              >
                <PersonelAvatar personel={p} />
                <IsYukuRozeti yuk={yuk} />
                <span id={`is-yuku-${p.id}`} className="sr-only">
                  {yukMetni(yuk)} görev
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {ad} · {yukMetni(yuk)} görev
              </TooltipContent>
            </Tooltip>
          )
        })}
        {fazla.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Diğer ${fazla.length} kişi`}
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background outline-none hover:z-20 focus-visible:ring-ring/60",
                    fazlaSecili > 0 && "z-10 ring-primary"
                  )}
                />
              }
            >
              +{fazla.length}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-48">
              {fazla.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={secili.has(p.id)}
                  onCheckedChange={(c) => degistir(p.id, c)}
                >
                  <PersonelAvatar personel={p} size="sm" />
                  <span className="flex-1">
                    {p.ad} {p.soyad}
                  </span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      yukler.get(p.id)?.geciken
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {yukMetni(yukler.get(p.id))}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {secili.size > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Atanan filtresini temizle"
          onClick={() => onChange([])}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}
