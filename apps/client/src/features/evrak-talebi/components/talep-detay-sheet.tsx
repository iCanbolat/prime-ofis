import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  CancelCircleIcon,
  Clock01Icon,
  InboxUploadIcon,
  LinkSquare02Icon,
  SentIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { PersonelAvatar } from "@/components/shared/personel-avatar"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { GelenEvrakListesi } from "@/features/evrak-talebi/components/gelen-inceleme"
import { GonderPaneli } from "@/features/evrak-talebi/components/gonder-paneli"
import { TalepDurumBadge } from "@/features/evrak-talebi/components/talep-rozetleri"
import { portalLinki } from "@prime/shared/evrak-talebi/mesaj"
import {
  ISTENEN_EVRAKLAR,
  KANAL_ETIKET,
} from "@prime/shared/evrak-talebi/sabitler"
import {
  useTalepDetay,
  useTalepIptal,
  useTalepUzat,
  useTalepYenidenAc,
} from "@/features/evrak-talebi/queries"
import { useGorevGuncelle, useGorevList } from "@/features/gorev/queries"
import { formatDateTime, formatDonem } from "@prime/shared/lib/format"
import type { GorevView, TalepDetay } from "@prime/shared/types/api"
import type { GorevDurum } from "@prime/shared/types/domain"

function Bilgi({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiket}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

const ACIK_GOREV: GorevDurum[] = ["YAPILACAK", "DEVAM", "KONTROL"]

/** Talebi mükellefin açık görevlerinden birine bağlar / bağlantıyı kaldırır. */
function GoreveBagla({ talep }: { talep: TalepDetay }) {
  const gorevler = useGorevList({
    mukellefId: talep.mukellefId,
    durum: ACIK_GOREV,
  })
  const guncelle = useGorevGuncelle()
  const bagli = (gorevler.data ?? []).filter((g) =>
    g.bagliTalepIdler.includes(talep.id)
  ).length

  const degistir = (g: GorevView, bagla: boolean) =>
    guncelle.mutate(
      {
        id: g.id,
        bagliTalepIdler: bagla
          ? [...g.bagliTalepIdler, talep.id]
          : g.bagliTalepIdler.filter((id) => id !== talep.id),
      },
      {
        onSuccess: () =>
          toast.success(
            bagla ? `“${g.baslik}” görevine bağlandı` : "Bağlantı kaldırıldı"
          ),
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
        <HugeiconsIcon
          icon={Task01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {bagli ? `${bagli} göreve bağlı` : "Göreve bağla"}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mükellefin açık görevleri</DropdownMenuLabel>
          {gorevler.data?.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Açık görev yok
            </p>
          )}
          {gorevler.data?.map((g) => (
            <DropdownMenuCheckboxItem
              key={g.id}
              checked={g.bagliTalepIdler.includes(talep.id)}
              disabled={guncelle.isPending}
              onCheckedChange={(checked) => degistir(g, checked)}
            >
              <span className="truncate">{g.baslik}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Icerik({ talep }: { talep: TalepDetay }) {
  const [gonderAcik, setGonderAcik] = useState(false)
  const [iptalOnay, setIptalOnay] = useState(false)
  const uzat = useTalepUzat()
  const iptal = useTalepIptal()
  const yenidenAc = useTalepYenidenAc()
  const sonGonderim = talep.gonderimler.at(-1)
  const uzatilabilir = talep.durum === "AKTIF" || talep.durum === "SURESI_DOLDU"

  const hata = (error: Error) => toast.error(error.message)

  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <div className="flex flex-wrap gap-2">
        {talep.durum === "AKTIF" && (
          <Button
            size="sm"
            onClick={() => setGonderAcik((v) => !v)}
            aria-expanded={gonderAcik}
          >
            <HugeiconsIcon
              icon={SentIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {talep.gonderimler.length ? "Yeniden gönder" : "Gönder"}
          </Button>
        )}
        {uzatilabilir && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" variant="outline" />}
            >
              <HugeiconsIcon
                icon={Clock01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Süre uzat
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {[3, 7, 14].map((gun) => (
                <DropdownMenuItem
                  key={gun}
                  onClick={() =>
                    uzat.mutate(
                      { id: talep.id, gun },
                      {
                        onSuccess: () =>
                          toast.success(`Süre ${gun} gün uzatıldı`),
                        onError: hata,
                      }
                    )
                  }
                >
                  +{gun} gün
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {talep.durum === "TAMAMLANDI" && (
          <Button
            size="sm"
            variant="outline"
            disabled={yenidenAc.isPending}
            onClick={() =>
              yenidenAc.mutate(talep.id, {
                onSuccess: () => toast.success("Talep yeniden açıldı"),
                onError: hata,
              })
            }
          >
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Yeniden aç
          </Button>
        )}
        <GoreveBagla talep={talep} />
        {talep.durum !== "IPTAL" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setIptalOnay(true)}
          >
            <HugeiconsIcon
              icon={CancelCircleIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            İptal et
          </Button>
        )}
      </div>

      {gonderAcik && talep.durum === "AKTIF" && (
        <section
          aria-label="Gönderim"
          className="rounded-2xl border bg-muted/30 p-4"
        >
          <GonderPaneli talep={talep} />
        </section>
      )}

      <dl className="grid grid-cols-2 gap-4">
        <Bilgi etiket="İstenen evraklar">
          <span className="flex flex-wrap gap-1">
            {talep.istenenler.map((i) => (
              <Badge key={i} variant="outline">
                {ISTENEN_EVRAKLAR[i].ad}
              </Badge>
            ))}
          </span>
        </Bilgi>
        <Bilgi etiket="Dönem">
          {talep.donem ? formatDonem(talep.donem) : "—"}
        </Bilgi>
        <Bilgi etiket="Son kullanma">
          {formatDateTime(talep.sonKullanma)}
          <span className="block text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(talep.sonKullanma), {
              addSuffix: true,
              locale: tr,
            })}
          </span>
        </Bilgi>
        <Bilgi etiket="Gönderim">
          {sonGonderim
            ? `${KANAL_ETIKET[sonGonderim.kanal]} · ${formatDateTime(sonGonderim.zaman)}`
            : "Henüz gönderilmedi"}
          {talep.gonderimler.length > 1 && (
            <span className="block text-xs text-muted-foreground">
              {talep.gonderimler.length} kez gönderildi
            </span>
          )}
        </Bilgi>
        <Bilgi etiket="Oluşturan">
          {talep.olusturan ? (
            <span className="flex items-center gap-1.5">
              <PersonelAvatar personel={talep.olusturan} size="sm" />
              {talep.olusturan.ad} {talep.olusturan.soyad}
            </span>
          ) : (
            "—"
          )}
        </Bilgi>
        <Bilgi etiket="Portal">
          <a
            href={portalLinki(talep.token, window.location.origin)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-link hover:underline"
          >
            Müşteri görünümü
            <HugeiconsIcon
              icon={LinkSquare02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </a>
        </Bilgi>
        {talep.aciklama && (
          <div className="col-span-2">
            <Bilgi etiket="Müşteriye not">{talep.aciklama}</Bilgi>
          </div>
        )}
        {talep.musteriNotu && (
          <div className="col-span-2 rounded-xl bg-muted/50 p-3">
            <Bilgi etiket="Müşterinin notu">{talep.musteriNotu}</Bilgi>
          </div>
        )}
      </dl>

      <Separator />

      <section aria-label="Gelen dosyalar" className="grid gap-2">
        <h3 className="flex items-center justify-between text-sm font-medium">
          Gelen dosyalar
          {talep.bekleyenSayisi > 0 && (
            <Badge
              variant="secondary"
              className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
            >
              {talep.bekleyenSayisi} inceleme bekliyor
            </Badge>
          )}
        </h3>
        {talep.gelenler.length === 0 ? (
          <EmptyState icon={InboxUploadIcon} title="Henüz dosya yüklenmedi" />
        ) : (
          <GelenEvrakListesi
            gelenler={talep.gelenler.map((g) => ({
              ...g,
              mukellefUnvan: talep.mukellefUnvan,
            }))}
          />
        )}
      </section>

      <ConfirmDialog
        open={iptalOnay}
        onOpenChange={setIptalOnay}
        title="Talep iptal edilsin mi?"
        description="Müşteri bağlantıyı açtığında talebin iptal edildiğini görür ve dosya yükleyemez."
        confirmLabel="İptal et"
        destructive
        pending={iptal.isPending}
        onConfirm={() =>
          iptal.mutate(talep.id, {
            onSuccess: () => {
              toast.success("Talep iptal edildi")
              setIptalOnay(false)
            },
            onError: hata,
          })
        }
      />
    </div>
  )
}

export function TalepDetaySheet({
  talepId,
  onClose,
}: {
  talepId: string | undefined
  onClose: () => void
}) {
  const detay = useTalepDetay(talepId)
  return (
    <Sheet open={Boolean(talepId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>
            {detay.data ? (
              <Link
                to={`/mukellefler/${detay.data.mukellefId}/evrak-talepleri`}
                className="hover:underline"
              >
                {detay.data.mukellefUnvan}
              </Link>
            ) : (
              "Evrak talebi"
            )}
          </SheetTitle>
          <SheetDescription
            render={<div />}
            className="flex items-center gap-2"
          >
            {detay.data && <TalepDurumBadge durum={detay.data.durum} />}
            {detay.data &&
              `Oluşturma: ${formatDateTime(detay.data.olusturmaTarihi)}`}
          </SheetDescription>
        </SheetHeader>
        {detay.isError ? (
          <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
        ) : detay.data ? (
          <Icerik key={detay.data.id} talep={detay.data} />
        ) : (
          <LoadingState />
        )}
      </SheetContent>
    </Sheet>
  )
}
