import {
  useMemo,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"

import { Button } from "@/components/ui/button"
import {
  GorevKarti,
  type GorevKartiProps,
} from "@/features/gorev/components/gorev-karti"
import {
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
  KANBAN_YUKSEKLIGI,
} from "@prime/shared/gorev/sabitler"
import { cn } from "@/lib/utils"
import type { GorevView } from "@prime/shared/types/api"
import type { GorevDurum, Personel } from "@prime/shared/types/domain"

/** "Tamam" sütununda başlangıçta gösterilen kart sayısı */
const TAMAM_ILK_GOSTERIM = 12

type KartOrtak = Pick<GorevKartiProps, "onAc" | "onTasi">

interface KanbanPanosuProps extends KartOrtak {
  gorevler: GorevView[]
  personelById: Map<string, Personel>
  tamamlayabilirMi: (g: GorevView) => boolean
}

/**
 * Sütunlar arası klavye hareketi: sağ/sol ok bir sonraki/önceki sütunun ortasına götürür.
 * (Varsayılan getter piksel piksel kaydırır; sütun panosunda sezgisel değil.)
 */
const sutunKoordinati: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates }
) => {
  const yon =
    event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0
  if (!yon) return undefined
  event.preventDefault()
  const mevcut = (context.over?.id ??
    context.active?.data.current?.durum) as GorevDurum
  const hedef = GOREV_DURUM_SIRASI[GOREV_DURUM_SIRASI.indexOf(mevcut) + yon]
  const rect = hedef ? context.droppableRects.get(hedef) : undefined
  if (!rect) return currentCoordinates
  return {
    x: rect.left + rect.width / 2 - (context.collisionRect?.width ?? 0) / 2,
    y: currentCoordinates.y,
  }
}

/** İmleç (fare) ya da sürüklenen kartın yatay merkezi hangi sütundaysa o sütun. */
const sutunCarpismasi: CollisionDetection = ({
  collisionRect,
  droppableRects,
  droppableContainers,
  pointerCoordinates,
}) => {
  const x =
    pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2
  const sutun = droppableContainers.find((c) => {
    const r = droppableRects.get(c.id)
    return r && x >= r.left && x <= r.right
  })
  return sutun ? [{ id: sutun.id }] : []
}

function SuruklenebilirKart({
  gorev,
  atanan,
  tamamlayabilir,
  ...ortak
}: KartOrtak & {
  gorev: GorevView
  atanan: Personel | undefined
  tamamlayabilir: boolean
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({ id: gorev.id, data: { durum: gorev.durum } })

  return (
    <GorevKarti
      {...ortak}
      gorev={gorev}
      atanan={atanan}
      tamamlayabilir={tamamlayabilir}
      nodeRef={setNodeRef}
      // Fareyle kartın herhangi bir yerinden, klavyeyle tutamaktan sürüklenir
      kartOlaylari={{
        onPointerDown: listeners?.onPointerDown as
          PointerEventHandler<HTMLElement> | undefined,
      }}
      tutamakRef={setActivatorNodeRef}
      tutamakProps={{
        ...attributes,
        role: undefined,
        "aria-roledescription": "sürüklenebilir görev",
        onKeyDown: listeners?.onKeyDown as
          KeyboardEventHandler<HTMLButtonElement> | undefined,
      }}
      surukleniyor={isDragging}
    />
  )
}

function Sutun({
  durum,
  gorevler,
  children,
  vurgulu,
}: {
  durum: GorevDurum
  gorevler: GorevView[]
  children: ReactNode
  vurgulu: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: durum })
  const geciken = gorevler.filter((g) => g.gecikti).length
  return (
    <section
      ref={setNodeRef}
      data-kanban-sutun={durum}
      aria-label={`${GOREV_DURUM_ETIKET[durum]} sütunu`}
      className={cn(
        "flex min-h-0 flex-col gap-2 overflow-hidden rounded-3xl bg-muted/50 py-2 transition-colors",
        vurgulu && "ring-1 ring-border",
        isOver && "bg-muted ring-2 ring-ring/40"
      )}
    >
      <h2 className="flex shrink-0 items-center justify-between px-4 pt-1 text-sm font-medium">
        {GOREV_DURUM_ETIKET[durum]}
        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground tabular-nums">
          {geciken > 0 && (
            <span className="text-destructive">{geciken} gecikmiş ·</span>
          )}
          {gorevler.length}
        </span>
      </h2>
      {/* Kartlar sütun içinde kayar; pano sayfayı uzatmaz */}
      <ul
        className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain px-2 pb-1"
        role="list"
      >
        {children}
      </ul>
    </section>
  )
}

export function KanbanPanosu({
  gorevler,
  personelById,
  tamamlayabilirMi,
  onAc,
  onTasi,
}: KanbanPanosuProps) {
  const [aktifId, setAktifId] = useState<string | null>(null)
  const [tamamHepsi, setTamamHepsi] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sutunKoordinati })
  )

  const sutunlar = useMemo(() => {
    const map = new Map<GorevDurum, GorevView[]>(
      GOREV_DURUM_SIRASI.map((d) => [d, []])
    )
    for (const g of gorevler) map.get(g.durum)!.push(g)
    // Tamamlananlar: en son tamamlanan üstte
    map
      .get("TAMAM")!
      .sort((a, b) =>
        (b.tamamlanmaTarihi ?? "").localeCompare(a.tamamlanmaTarihi ?? "")
      )
    return map
  }, [gorevler])

  const byId = useMemo(
    () => new Map(gorevler.map((g) => [g.id, g])),
    [gorevler]
  )
  const aktif = aktifId ? byId.get(aktifId) : undefined
  const baslik = (id: string | number) => byId.get(String(id))?.baslik ?? ""
  const sutunAdi = (id: string | number | undefined) =>
    id ? GOREV_DURUM_ETIKET[id as GorevDurum] : ""

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `${baslik(active.id)} tutuldu. Sütun değiştirmek için sağ ve sol ok, bırakmak için boşluk, vazgeçmek için Escape.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${baslik(active.id)} ${sutunAdi(over.id)} sütunu üzerinde.`
        : `${baslik(active.id)} bir sütun üzerinde değil.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${baslik(active.id)} ${sutunAdi(over.id)} sütununa bırakıldı.`
        : `${baslik(active.id)} bırakıldı.`,
    onDragCancel: ({ active }) => `${baslik(active.id)} taşınmadı, vazgeçildi.`,
  }

  const onDragStart = ({ active }: DragStartEvent) =>
    setAktifId(String(active.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setAktifId(null)
    const g = byId.get(String(active.id))
    if (!g || !over || over.id === g.durum) return
    onTasi(g, over.id as GorevDurum)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sutunCarpismasi}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setAktifId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Görevi taşımak için boşluk veya Enter'a basın. Sağ ve sol ok ile sütun değiştirin, boşlukla bırakın, Escape ile vazgeçin.",
        },
      }}
    >
      <div
        className={cn(
          "-mx-1 grid auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-2",
          KANBAN_YUKSEKLIGI
        )}
        aria-label="Görev panosu"
        role="region"
      >
        {GOREV_DURUM_SIRASI.map((durum) => {
          const liste = sutunlar.get(durum)!
          const kisalt =
            durum === "TAMAM" &&
            !tamamHepsi &&
            liste.length > TAMAM_ILK_GOSTERIM
          const gorunen = kisalt ? liste.slice(0, TAMAM_ILK_GOSTERIM) : liste
          return (
            <Sutun
              key={durum}
              durum={durum}
              gorevler={liste}
              vurgulu={Boolean(aktif)}
            >
              {gorunen.map((g) => (
                <li key={g.id}>
                  <SuruklenebilirKart
                    gorev={g}
                    atanan={personelById.get(g.atananId)}
                    tamamlayabilir={tamamlayabilirMi(g)}
                    onAc={onAc}
                    onTasi={onTasi}
                  />
                </li>
              ))}
              {liste.length === 0 && (
                <li className="rounded-2xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Görev yok
                </li>
              )}
              {kisalt && (
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setTamamHepsi(true)}
                  >
                    {liste.length - TAMAM_ILK_GOSTERIM} görev daha göster
                  </Button>
                </li>
              )}
            </Sutun>
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {aktif && (
          <GorevKarti
            gorev={aktif}
            atanan={personelById.get(aktif.atananId)}
            tamamlayabilir={tamamlayabilirMi(aktif)}
            onAc={onAc}
            onTasi={onTasi}
            kopya
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
