import type { HTMLAttributes, Ref } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DragDropVerticalIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  GorevTipBadge,
  OncelikIsareti,
  SonTarih,
} from "@/features/gorev/components/gorev-rozetleri"
import { checklistIlerleme } from "@prime/shared/gorev/kurallar"
import {
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
} from "@prime/shared/gorev/sabitler"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { cn } from "@/lib/utils"
import type { GorevView } from "@prime/shared/types/api"
import type { GorevDurum, Personel } from "@prime/shared/types/domain"

export interface GorevKartiProps {
  gorev: GorevView
  atanan: Personel | undefined
  onAc: (id: string) => void
  onTasi: (gorev: GorevView, durum: GorevDurum) => void
  /** "Tamam"a taşıma yetkisi */
  tamamlayabilir: boolean
  /** Sürükleme — kanban panosu verir */
  nodeRef?: Ref<HTMLElement>
  kartOlaylari?: HTMLAttributes<HTMLElement>
  /** Klavye ile sürükleme tutamağı; verilmezse tutamak gösterilmez */
  tutamakRef?: Ref<HTMLButtonElement>
  tutamakProps?: HTMLAttributes<HTMLButtonElement>
  surukleniyor?: boolean
  /** DragOverlay içindeki kopya */
  kopya?: boolean
}

export function GorevKarti({
  gorev,
  atanan,
  onAc,
  onTasi,
  tamamlayabilir,
  nodeRef,
  kartOlaylari,
  tutamakRef,
  tutamakProps,
  surukleniyor,
  kopya,
}: GorevKartiProps) {
  const ilerleme = checklistIlerleme(gorev.checklist)

  return (
    <article
      ref={nodeRef}
      {...kartOlaylari}
      aria-label={`${gorev.baslik} · ${gorev.mukellefUnvan}`}
      className={cn(
        "group/kart grid gap-2 rounded-2xl border bg-card p-3 text-sm shadow-xs transition-shadow",
        gorev.gecikti && "border-destructive/40",
        surukleniyor && "opacity-40",
        kopya && "rotate-1 shadow-lg ring-2 ring-ring/40"
      )}
    >
      <div className="flex items-start gap-1">
        {tutamakProps && (
          <button
            ref={tutamakRef}
            type="button"
            {...tutamakProps}
            aria-label={`${gorev.baslik} (${gorev.mukellefUnvan}) görevini taşı`}
            className="-ml-1 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          >
            <HugeiconsIcon
              icon={DragDropVerticalIcon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        )}
        <button
          type="button"
          onClick={() => onAc(gorev.id)}
          className="min-w-0 flex-1 rounded-md text-left font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {gorev.baslik}
        </button>
        {!kopya && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-mt-0.5 -mr-1 shrink-0"
                  aria-label={`${gorev.baslik} işlemleri`}
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onClick={() => onAc(gorev.id)}>
                Ayrıntılar
              </DropdownMenuItem>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Taşı</DropdownMenuLabel>
                {GOREV_DURUM_SIRASI.filter((d) => d !== gorev.durum).map(
                  (d) => (
                    <DropdownMenuItem
                      key={d}
                      disabled={d === "TAMAM" && !tamamlayabilir}
                      onClick={() => onTasi(gorev, d)}
                    >
                      {GOREV_DURUM_ETIKET[d]}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {gorev.mukellefUnvan}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <GorevTipBadge tip={gorev.tip} />
        {gorev.donem && (
          <span className="text-xs text-muted-foreground">
            {donemEtiketi(gorev.donem)}
          </span>
        )}
        <OncelikIsareti oncelik={gorev.oncelik} />
      </div>

      {ilerleme.toplam > 0 && (
        <div className="flex items-center gap-2">
          <Progress
            value={ilerleme.yuzde}
            aria-label={`Kontrol listesi ilerlemesi: ${ilerleme.tamam}/${ilerleme.toplam}`}
            className="flex-1 [&_[data-slot=progress-track]]:h-1"
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {ilerleme.tamam}/{ilerleme.toplam}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <SonTarih sonTarih={gorev.sonTarih} gecikti={gorev.gecikti} />
        {atanan && (
          <span title={`${atanan.ad} ${atanan.soyad}`}>
            <PersonelAvatar personel={atanan} size="sm" />
          </span>
        )}
      </div>
    </article>
  )
}
