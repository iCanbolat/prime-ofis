import { useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  InboxUploadIcon,
} from "@hugeicons/core-free-icons"

import { DatePicker } from "@/components/shared/date-picker"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { AktiviteListesi } from "@/features/aktivite/components/aktivite-listesi"
import { usePersonelList } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { TalepOlusturDialog } from "@/features/evrak-talebi/components/talep-olustur-dialog"
import { TalepDurumBadge } from "@/features/evrak-talebi/components/talep-rozetleri"
import { useTalepList } from "@/features/evrak-talebi/queries"
import { ISTENEN_EVRAKLAR } from "@prime/shared/evrak-talebi/sabitler"
import {
  GorevDurumBadge,
  GorevTipBadge,
} from "@/features/gorev/components/gorev-rozetleri"
import {
  checklistIlerleme,
  tamamaTasiyabilirMi,
} from "@prime/shared/gorev/kurallar"
import {
  useGorevDetay,
  useGorevGuncelle,
  useGorevSil,
  useGorevTasi,
  useGorevYorum,
} from "@/features/gorev/queries"
import {
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
  GOREV_ONCELIK_ETIKET,
  GOREV_ONCELIK_SIRASI,
} from "@prime/shared/gorev/sabitler"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { BEYAN_DURUM_ETIKET } from "@prime/shared/takvim/sabitler"
import { formatDateTime, formatDonem } from "@prime/shared/lib/format"
import type { GorevDetay, GorevGuncelleRequest } from "@prime/shared/types/api"
import type {
  GorevChecklistMaddesi,
  GorevDurum,
  GorevOncelik,
  Personel,
} from "@prime/shared/types/domain"

function Bilgi({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-xs text-muted-foreground">{etiket}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Bolum({
  baslik,
  ek,
  children,
}: {
  baslik: string
  ek?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={baslik} className="grid gap-2">
      <h3 className="flex items-center justify-between gap-2 text-sm font-medium">
        {baslik}
        {ek}
      </h3>
      {children}
    </section>
  )
}

function KontrolListesi({
  checklist,
  onKaydet,
  bekliyor,
}: {
  checklist: GorevChecklistMaddesi[]
  onKaydet: (checklist: GorevChecklistMaddesi[]) => void
  bekliyor: boolean
}) {
  const [yeni, setYeni] = useState("")
  const ilerleme = checklistIlerleme(checklist)

  const ekle = () => {
    const metin = yeni.trim()
    if (!metin) return
    onKaydet([
      ...checklist,
      { id: `c_${crypto.randomUUID().slice(0, 8)}`, metin, tamam: false },
    ])
    setYeni("")
  }

  return (
    <Bolum
      baslik="Kontrol listesi"
      ek={
        ilerleme.toplam > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {ilerleme.tamam}/{ilerleme.toplam} · %{ilerleme.yuzde}
          </span>
        )
      }
    >
      {ilerleme.toplam > 0 && (
        <Progress
          value={ilerleme.yuzde}
          aria-label="Kontrol listesi ilerlemesi"
          className="[&_[data-slot=progress-track]]:h-1.5"
        />
      )}
      <ul className="grid gap-1">
        {checklist.map((m) => (
          <li
            key={m.id}
            className="group/madde flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/50"
          >
            <Checkbox
              id={`madde-${m.id}`}
              checked={m.tamam}
              disabled={bekliyor}
              onCheckedChange={(tamam) =>
                onKaydet(
                  checklist.map((x) => (x.id === m.id ? { ...x, tamam } : x))
                )
              }
            />
            <label
              htmlFor={`madde-${m.id}`}
              className={
                m.tamam
                  ? "flex-1 text-sm text-muted-foreground line-through"
                  : "flex-1 text-sm"
              }
            >
              {m.metin}
            </label>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`“${m.metin}” maddesini sil`}
              className="opacity-0 group-hover/madde:opacity-100 focus-visible:opacity-100"
              onClick={() => onKaydet(checklist.filter((x) => x.id !== m.id))}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={yeni}
          onChange={(e) => setYeni(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ekle()
            }
          }}
          placeholder="Yeni madde ekle"
          aria-label="Yeni kontrol maddesi"
          maxLength={200}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Maddeyi ekle"
          disabled={!yeni.trim() || bekliyor}
          onClick={ekle}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
      </div>
    </Bolum>
  )
}

/** Yorum metninde bahsedilen kişileri vurgular */
function YorumMetni({
  metin,
  bahsedilenler,
  personel,
}: {
  metin: string
  bahsedilenler: string[]
  personel: Personel[]
}) {
  const adlar = personel
    .filter((p) => bahsedilenler.includes(p.id))
    .flatMap((p) => [`@${p.ad} ${p.soyad}`, `@${p.ad}`])
  if (adlar.length === 0) return <>{metin}</>
  const kacis = adlar.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parcalar = metin.split(new RegExp(`(${kacis.join("|")})`, "giu"))
  return (
    <>
      {parcalar.map((p, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded bg-blue-500/10 px-0.5 font-medium text-blue-600 dark:text-blue-400"
          >
            {p}
          </mark>
        ) : (
          p
        )
      )}
    </>
  )
}

function Yorumlar({
  gorev,
  personel,
}: {
  gorev: GorevDetay
  personel: Personel[]
}) {
  const yorum = useGorevYorum()
  const [metin, setMetin] = useState("")
  const byId = useMemo(
    () => new Map(personel.map((p) => [p.id, p])),
    [personel]
  )
  // Metnin sonunda yazılmakta olan "@..." → öneri listesi
  const arama = /(?:^|\s)@([\p{L}]*)$/u.exec(metin)?.[1]
  const oneriler =
    arama === undefined
      ? []
      : personel.filter(
          (p) =>
            p.aktif &&
            `${p.ad} ${p.soyad}`
              .toLocaleLowerCase("tr-TR")
              .startsWith(arama.toLocaleLowerCase("tr-TR"))
        )

  const bahset = (p: Personel) =>
    setMetin((m) => m.replace(/@[\p{L}]*$/u, `@${p.ad} ${p.soyad} `))

  const gonder = () =>
    yorum.mutate(
      { id: gorev.id, metin },
      {
        onSuccess: () => setMetin(""),
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <Bolum baslik="Yorumlar">
      {gorev.yorumlar.length > 0 && (
        <ol className="grid gap-3" aria-label="Yorum listesi">
          {gorev.yorumlar.map((y) => {
            const yazar = byId.get(y.yazarId)
            return (
              <li key={y.id} className="flex gap-2">
                {yazar && <PersonelAvatar personel={yazar} size="sm" />}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {yazar ? `${yazar.ad} ${yazar.soyad}` : "—"}
                    </span>{" "}
                    ·{" "}
                    <time dateTime={y.zaman} title={formatDateTime(y.zaman)}>
                      {formatDistanceToNow(new Date(y.zaman), {
                        addSuffix: true,
                        locale: tr,
                      })}
                    </time>
                  </span>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    <YorumMetni
                      metin={y.metin}
                      bahsedilenler={y.bahsedilenler}
                      personel={personel}
                    />
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <div className="grid gap-2">
        <Textarea
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && metin.trim())
              gonder()
          }}
          rows={2}
          maxLength={2000}
          placeholder="Yorum yazın; birini anmak için @ kullanın"
          aria-label="Yorum"
        />
        {oneriler.length > 0 && (
          <ul aria-label="Anılacak personel" className="flex flex-wrap gap-1">
            {oneriler.map((p) => (
              <li key={p.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => bahset(p)}
                >
                  @{p.ad} {p.soyad}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!metin.trim() || yorum.isPending}
            onClick={gonder}
          >
            Yorum ekle
          </Button>
        </div>
      </div>
    </Bolum>
  )
}

function BagliTalepler({
  gorev,
  onKaydet,
}: {
  gorev: GorevDetay
  onKaydet: (ids: string[]) => void
}) {
  const talepler = useTalepList({ mukellefId: gorev.mukellefId })
  const [puantajTalebi, setPuantajTalebi] = useState(false)
  const eklenebilir = (talepler.data ?? []).filter(
    (t) => !gorev.bagliTalepIdler.includes(t.id)
  )
  const items = Object.fromEntries(
    eklenebilir.map((t) => [
      t.id,
      `${t.donem ? `${formatDonem(t.donem)} · ` : ""}${t.istenenler
        .map((i) => ISTENEN_EVRAKLAR[i].ad)
        .join(", ")}`,
    ])
  )

  return (
    <Bolum baslik="Bağlı evrak talepleri">
      {gorev.bagliTalepler.length > 0 ? (
        <ul className="grid gap-1">
          {gorev.bagliTalepler.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-xl border px-3 py-2"
            >
              <HugeiconsIcon
                icon={InboxUploadIcon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Link
                to={`/evrak-talepleri?talep=${t.id}`}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {t.donem && `${formatDonem(t.donem)} · `}
                {t.istenenler.map((i) => ISTENEN_EVRAKLAR[i].ad).join(", ")}
              </Link>
              <TalepDurumBadge durum={t.durum} />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Bağlantıyı kaldır"
                onClick={() =>
                  onKaydet(gorev.bagliTalepIdler.filter((id) => id !== t.id))
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Bu göreve bağlı evrak talebi yok.
        </p>
      )}
      {gorev.tip === "MUHTASAR_SGK" && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setPuantajTalebi(true)}
          >
            Puantaj iste
          </Button>
          <TalepOlusturDialog
            hedef={
              puantajTalebi
                ? {
                    mukellefId: gorev.mukellefId,
                    istenenler: ["PUANTAJ"],
                    donem: gorev.donem,
                  }
                : null
            }
            onClose={() => setPuantajTalebi(false)}
            onOlustu={(talep) => onKaydet([...gorev.bagliTalepIdler, talep.id])}
          />
        </>
      )}
      {eklenebilir.length > 0 && (
        <Select
          items={items}
          value={null}
          onValueChange={(id) =>
            id && onKaydet([...gorev.bagliTalepIdler, String(id)])
          }
        >
          <SelectTrigger
            size="sm"
            className="w-full"
            aria-label="Evrak talebi bağla"
          >
            <SelectValue placeholder="Evrak talebi bağla…" />
          </SelectTrigger>
          <SelectContent>
            {eklenebilir.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {items[t.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Bolum>
  )
}

function Icerik({
  gorev,
  onSilindi,
}: {
  gorev: GorevDetay
  onSilindi: () => void
}) {
  const user = useAuthStore((s) => s.user)
  const personel = usePersonelList()
  const guncelle = useGorevGuncelle()
  const tasi = useGorevTasi()
  const sil = useGorevSil()
  const [baslik, setBaslik] = useState(gorev.baslik)
  const [aciklama, setAciklama] = useState(gorev.aciklama ?? "")
  const [silOnay, setSilOnay] = useState(false)

  const tamamlayabilir = tamamaTasiyabilirMi(user, gorev)
  const silebilir = user?.rol === "YONETICI" || gorev.olusturanId === user?.id

  const kaydet = (body: GorevGuncelleRequest, basari?: string) =>
    guncelle.mutate(
      { id: gorev.id, ...body },
      {
        onSuccess: () => basari && toast.success(basari),
        onError: (error) => toast.error(error.message),
      }
    )

  const durumDegistir = (durum: GorevDurum) =>
    tasi.mutate(
      { id: gorev.id, durum },
      {
        onSuccess: () =>
          toast.success(
            `Görev “${GOREV_DURUM_ETIKET[durum]}” durumuna taşındı`
          ),
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <Input
        value={baslik}
        onChange={(e) => setBaslik(e.target.value)}
        onBlur={() =>
          baslik.trim() && baslik !== gorev.baslik
            ? kaydet({ baslik })
            : setBaslik(gorev.baslik)
        }
        aria-label="Görev başlığı"
        maxLength={200}
        className="font-medium"
      />

      <dl className="grid grid-cols-2 gap-4">
        <Bilgi etiket="Durum">
          <Select
            items={GOREV_DURUM_ETIKET}
            value={gorev.durum}
            onValueChange={(d) => d && durumDegistir(d as GorevDurum)}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Durum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOREV_DURUM_SIRASI.map((d) => (
                <SelectItem
                  key={d}
                  value={d}
                  disabled={d === "TAMAM" && !tamamlayabilir}
                >
                  {GOREV_DURUM_ETIKET[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Bilgi>
        <Bilgi etiket="Atanan">
          <PersonelSelect
            aria-label="Atanan"
            value={gorev.atananId}
            onValueChange={(atananId) =>
              atananId &&
              atananId !== gorev.atananId &&
              kaydet({ atananId }, "Görev atandı")
            }
            className="h-8 w-full"
          />
        </Bilgi>
        <Bilgi etiket="Öncelik">
          <Select
            items={GOREV_ONCELIK_ETIKET}
            value={gorev.oncelik}
            onValueChange={(o) => o && kaydet({ oncelik: o as GorevOncelik })}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Öncelik">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOREV_ONCELIK_SIRASI.map((o) => (
                <SelectItem key={o} value={o}>
                  {GOREV_ONCELIK_ETIKET[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Bilgi>
        <Bilgi etiket="Son tarih">
          <DatePicker
            aria-label="Son tarih"
            size="sm"
            value={gorev.sonTarih}
            onChange={(sonTarih) =>
              sonTarih !== gorev.sonTarih && kaydet({ sonTarih })
            }
            aria-invalid={gorev.gecikti || undefined}
          />
          {gorev.gecikti && (
            <span className="text-xs text-destructive">Gecikti</span>
          )}
        </Bilgi>
        <Bilgi etiket="Dönem">
          {gorev.donem ? donemEtiketi(gorev.donem) : "—"}
        </Bilgi>
        {gorev.beyanDurumu && (
          <Bilgi etiket="Takvimdeki beyan durumu">
            <Link
              to={`/mukellefler/${gorev.mukellefId}/takvim`}
              className="hover:underline"
            >
              {BEYAN_DURUM_ETIKET[gorev.beyanDurumu]}
            </Link>
          </Bilgi>
        )}
      </dl>

      <Bolum baslik="Açıklama">
        <Textarea
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          onBlur={() =>
            aciklama !== (gorev.aciklama ?? "") && kaydet({ aciklama })
          }
          rows={3}
          maxLength={2000}
          placeholder="Açıklama ekleyin"
          aria-label="Açıklama"
        />
      </Bolum>

      <KontrolListesi
        checklist={gorev.checklist}
        bekliyor={guncelle.isPending}
        onKaydet={(checklist) => kaydet({ checklist })}
      />

      <BagliTalepler
        gorev={gorev}
        onKaydet={(bagliTalepIdler) => kaydet({ bagliTalepIdler })}
      />

      <Separator />
      <Yorumlar gorev={gorev} personel={personel.data ?? []} />

      <Separator />
      <Bolum baslik="Aktivite geçmişi">
        <AktiviteListesi hedefId={gorev.id} limit={15} />
      </Bolum>

      {silebilir && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setSilOnay(true)}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Görevi sil
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={silOnay}
        onOpenChange={setSilOnay}
        title="Görev silinsin mi?"
        description="Görev, kontrol listesi ve yorumlarıyla birlikte kalıcı olarak silinir."
        confirmLabel="Sil"
        destructive
        pending={sil.isPending}
        onConfirm={() =>
          sil.mutate(gorev.id, {
            onSuccess: () => {
              toast.success("Görev silindi")
              setSilOnay(false)
              onSilindi()
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </div>
  )
}

export function GorevDetaySheet({
  gorevId,
  onClose,
}: {
  gorevId: string | undefined
  onClose: () => void
}) {
  const detay = useGorevDetay(gorevId)
  const g = detay.data
  return (
    <Sheet open={Boolean(gorevId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>
            {g ? (
              <Link
                to={`/mukellefler/${g.mukellefId}/gorevler`}
                className="hover:underline"
              >
                {g.mukellefUnvan}
              </Link>
            ) : (
              "Görev"
            )}
          </SheetTitle>
          <SheetDescription
            render={<div />}
            className="flex flex-wrap items-center gap-2"
          >
            {g && (
              <>
                <GorevDurumBadge durum={g.durum} />
                <GorevTipBadge tip={g.tip} />
                Oluşturma: {formatDateTime(g.olusturmaTarihi)}
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        {detay.isError ? (
          <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
        ) : g ? (
          <Icerik key={g.id} gorev={g} onSilindi={onClose} />
        ) : (
          <LoadingState />
        )}
      </SheetContent>
    </Sheet>
  )
}
