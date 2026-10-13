import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { FileDropzone } from "@/components/shared/file-dropzone"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import {
  SureBadge,
  TebligatDurumBadge,
} from "@/features/tebligat/components/tebligat-rozetleri"
import { SURE_KURALLARI, sureGunu } from "@prime/shared/tebligat/kurallar"
import {
  useTebligat,
  useTebligatBelge,
  useTebligatGorev,
  useTebligatGuncelle,
} from "@/features/tebligat/queries"
import {
  KURUM_ETIKET,
  TEBLIGAT_DURUM_ETIKET,
  TEBLIGAT_TUR_ETIKET,
} from "@prime/shared/tebligat/sabitler"
import { dataUrlOku } from "@/lib/dosya"
import { formatDate, formatDateTime } from "@prime/shared/lib/format"
import type { TebligatView } from "@prime/shared/types/api"
import type { TebligatDurum } from "@prime/shared/types/domain"

const DURUMLAR = Object.keys(TEBLIGAT_DURUM_ETIKET) as TebligatDurum[]

function Cizelge({ t }: { t: TebligatView }) {
  const adimlar = [
    ["Adrese ulaştı", formatDateTime(t.ulasmaTarihi)],
    ["Tebliğ edilmiş sayılır", formatDate(t.tebligTarihi)],
    ...(t.sonIslemTarihi
      ? [["Son işlem günü", formatDate(t.sonIslemTarihi)]]
      : []),
  ]
  return (
    <ol
      className="grid gap-3 border-l-2 border-border pl-4"
      aria-label="Süre çizelgesi"
    >
      {adimlar.map(([etiket, deger], i) => (
        <li key={etiket} className="relative grid">
          <span
            aria-hidden
            className={
              i === adimlar.length - 1 && t.sonIslemTarihi && t.acik
                ? "absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-destructive"
                : "absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-muted-foreground/50"
            }
          />
          <span className="text-xs text-muted-foreground">{etiket}</span>
          <span className="font-medium tabular-nums">{deger}</span>
        </li>
      ))}
    </ol>
  )
}

function Icerik({ t }: { t: TebligatView }) {
  const guncelle = useTebligatGuncelle()
  const gorev = useTebligatGorev()
  const belge = useTebligatBelge()
  const navigate = useNavigate()
  const [not, setNot] = useState(t.not ?? "")
  const [sure, setSure] = useState(String(sureGunu(t) ?? ""))
  const kural = SURE_KURALLARI[t.tur]

  const kaydet = (body: Parameters<typeof guncelle.mutate>[0], mesaj: string) =>
    guncelle.mutate(body, {
      onSuccess: () => toast.success(mesaj),
      onError: (error) => toast.error(error.message),
    })

  return (
    <div className="grid gap-6 overflow-y-auto px-4 pb-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TebligatDurumBadge durum={t.durum} />
          <SureBadge t={t} />
          <Badge variant="outline">{KURUM_ETIKET[t.kurum]}</Badge>
          <Badge variant="outline">
            {t.kaynak === "ELLE" ? "Elle girildi" : "Gece taramasından"}
          </Badge>
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Mükellef</dt>
          <dd className="font-medium">
            <Link
              to={`/mukellefler/${t.mukellefId}/tebligat`}
              className="hover:underline"
            >
              {t.mukellefUnvan}
            </Link>
          </dd>
          <dt className="text-muted-foreground">VKN / TCKN</dt>
          <dd className="font-mono tabular-nums">{t.vkn}</dd>
          {t.belgeNo && (
            <>
              <dt className="text-muted-foreground">Belge no</dt>
              <dd className="font-mono">{t.belgeNo}</dd>
            </>
          )}
          {kural.gun !== null && (
            <>
              <dt className="text-muted-foreground">Yapılacak</dt>
              <dd>
                {kural.islem}
                {kural.dayanak && (
                  <span className="block text-xs text-muted-foreground">
                    {kural.dayanak}
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
      </section>

      <Cizelge t={t} />

      <section className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="tebligat-durum-etiket">Durum</FieldLabel>
          <Select
            items={TEBLIGAT_DURUM_ETIKET}
            value={t.durum}
            onValueChange={(v) =>
              v &&
              v !== t.durum &&
              kaydet(
                { id: t.id, durum: v as TebligatDurum },
                `Durum: ${TEBLIGAT_DURUM_ETIKET[v as TebligatDurum]}`
              )
            }
          >
            <SelectTrigger id="tebligat-durum-etiket" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURUMLAR.map((d) => (
                <SelectItem key={d} value={d}>
                  {TEBLIGAT_DURUM_ETIKET[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="tebligat-atanan">Sorumlu</FieldLabel>
            <PersonelSelect
              id="tebligat-atanan"
              value={t.atananId ?? ""}
              bosSecenek="Atanmadı"
              onValueChange={(id) =>
                kaydet(
                  { id: t.id, atananId: id || null },
                  "Sorumlu güncellendi"
                )
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="tebligat-sure">Süre (gün)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="tebligat-sure"
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={sure}
                onChange={(e) => setSure(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={
                  !(Number(sure) >= 1) ||
                  Number(sure) === sureGunu(t) ||
                  guncelle.isPending
                }
                onClick={() =>
                  kaydet(
                    {
                      id: t.id,
                      sureGun: Number(sure) === kural.gun ? null : Number(sure),
                    },
                    "Süre güncellendi"
                  )
                }
              >
                Uygula
              </Button>
            </div>
            <FieldDescription>
              {kural.gun === null
                ? "Bu tür için yasal süre izlenmez; yazıda süre varsa girin."
                : `Varsayılan ${kural.gun} gün; yazıda farklı süre varsa değiştirin.`}
            </FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="tebligat-not">Not</FieldLabel>
          <Textarea
            id="tebligat-not"
            rows={3}
            value={not}
            onChange={(e) => setNot(e.target.value)}
          />
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={not === (t.not ?? "") || guncelle.isPending}
              onClick={() => kaydet({ id: t.id, not }, "Not kaydedildi")}
            >
              Notu kaydet
            </Button>
          </div>
        </Field>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Görev ve belge</h3>
        {t.gorevId ? (
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() => navigate(`/gorevler?gorev=${t.gorevId}`)}
          >
            Göreve git
          </Button>
        ) : (
          <Button
            className="justify-self-start"
            disabled={gorev.isPending}
            onClick={() =>
              gorev.mutate(t.id, {
                onSuccess: (g) =>
                  toast.success("Görev oluşturuldu", {
                    action: {
                      label: "Aç",
                      onClick: () => navigate(`/gorevler?gorev=${g.id}`),
                    },
                  }),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Göreve dönüştür
          </Button>
        )}
        {t.arsivDosyaId ? (
          <Link
            to={`/arsiv?mukellef=${t.mukellefId}&kategori=TEBLIGAT`}
            className="text-sm text-link hover:underline"
          >
            Tebligat belgesi arşivde
          </Link>
        ) : (
          <FileDropzone
            accept="application/pdf,image/png,image/jpeg"
            multiple={false}
            disabled={belge.isPending}
            hint="GİB e-Tebligat'tan indirilen belge PDF'i · arşive e-Tebligat kategorisinde kaydedilir"
            onFiles={async ([dosya]) => {
              if (!dosya) return
              try {
                await belge.mutateAsync({
                  id: t.id,
                  dosya: { ad: dosya.name, dataUrl: await dataUrlOku(dosya) },
                })
                toast.success("Belge arşive kaydedildi")
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Yüklenemedi"
                )
              }
            }}
          />
        )}
      </section>
    </div>
  )
}

export function TebligatDetaySheet({
  tebligatId,
  onClose,
}: {
  tebligatId: string | undefined
  onClose: () => void
}) {
  const detay = useTebligat(tebligatId)
  const t = detay.data
  return (
    <Sheet open={Boolean(tebligatId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>
            {t ? TEBLIGAT_TUR_ETIKET[t.tur] : "e-Tebligat"}
          </SheetTitle>
          <SheetDescription>{t?.konu}</SheetDescription>
        </SheetHeader>
        {detay.isError ? (
          <ErrorState error={detay.error} onRetry={() => detay.refetch()} />
        ) : t ? (
          <Icerik key={`${t.id}:${t.not ?? ""}:${t.sureGun ?? ""}`} t={t} />
        ) : (
          <LoadingState />
        )}
      </SheetContent>
    </Sheet>
  )
}
