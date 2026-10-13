import { useState } from "react"
import { Link } from "react-router"
import { FileValidationIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { ButtonLink } from "@/components/shared/button-link"
import { ListeAraclari, SekmeFiltre } from "@/components/shared/liste-araclari"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BorcuYokturBadge } from "@/features/borc/components/borc-rozetleri"
import { DogrulamaDialog } from "@/features/borc/components/dogrulama"
import { useBorcParams, useKamuIslem } from "@/features/borc/hooks"
import {
  useBorcuYokturKontrol,
  useBorcuYokturListe,
  useBorcuYokturTalep,
} from "@/features/borc/queries"
import {
  BORC_SAYFA_BOYUTU,
  BORCU_YOKTUR_GECERLILIK_GUN,
  KAMU_KURUM_ETIKET,
} from "@prime/shared/borc/sabitler"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { formatDate, formatDateTime } from "@prime/shared/lib/format"
import type { BorcuYokturView } from "@prime/shared/types/api"
import type { KamuKurum } from "@prime/shared/types/domain"

const KAPSAM_ETIKET = {
  bekleyen: "Bekleyen",
  hazir: "Hazır",
  sonuclanan: "Sonuçlanan",
} as const
type YaziKapsam = keyof typeof KAPSAM_ETIKET

const yaziArsivYolu = (t: BorcuYokturView) =>
  `/arsiv?mukellef=${t.mukellefId}&kategori=${t.kurum === "GIB" ? "BORCU_YOKTUR" : "SGK_BELGESI"}`

/** Kurum yazıyı hazırlayınca gece sorgusunda (ya da "Sonucu sorgula" ile) arşive alınır */
export function BorcuYokturDialog({
  open,
  mukellefId: sabitMukellef,
  sgkVar,
  onClose,
}: {
  open: boolean
  /** Mükellef kartından açılınca sabit */
  mukellefId?: string
  /** Sabit mükellefin SGK işyeri var mı (yoksa SGK seçilemez) */
  sgkVar?: boolean
  onClose: () => void
}) {
  const [mukellefId, setMukellefId] = useState(sabitMukellef ?? "")
  const [kurum, setKurum] = useState<KamuKurum>("GIB")
  const [hata, setHata] = useState<string>()
  const talep = useBorcuYokturTalep()
  const islem = useKamuIslem()

  const kapat = () => {
    setHata(undefined)
    if (!sabitMukellef) setMukellefId("")
    onClose()
  }

  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mukellefId) {
      setHata("Mükellef seçin")
      return
    }
    talep.mutate(
      { mukellefId, kurum },
      {
        onSuccess: (r) => {
          islem.sonuc(
            r,
            `${KAMU_KURUM_ETIKET[kurum]} borcu yoktur yazısı istendi; hazır olunca arşive kaydedilir`
          )
          kapat()
        },
        onError: (error) => setHata(error.message),
      }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && kapat()}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={gonder} noValidate className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Borcu yoktur yazısı iste</DialogTitle>
              <DialogDescription>
                Talep mükellef adına kuruma gönderilir. Yazı hazır olunca arşive
                kaydedilir; {BORCU_YOKTUR_GECERLILIK_GUN} gün geçerli sayılır.
                Borç varsa kurum yazı vermez.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {!sabitMukellef && (
                <Field data-invalid={Boolean(hata && !mukellefId) || undefined}>
                  <FieldLabel htmlFor="by-mukellef">Mükellef</FieldLabel>
                  <MukellefSelect
                    id="by-mukellef"
                    value={mukellefId}
                    onValueChange={(v) => {
                      setMukellefId(v)
                      setHata(undefined)
                    }}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel id="by-kurum">Kurum</FieldLabel>
                <div
                  role="radiogroup"
                  aria-labelledby="by-kurum"
                  className="flex gap-2"
                >
                  {(["GIB", "SGK"] as const).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kurum === k}
                      variant={kurum === k ? "default" : "outline"}
                      disabled={
                        k === "SGK" && sabitMukellef !== undefined && !sgkVar
                      }
                      onClick={() => {
                        setKurum(k)
                        setHata(undefined)
                      }}
                    >
                      {k === "GIB" ? "GİB (vergi)" : "SGK (prim)"}
                    </Button>
                  ))}
                </div>
              </Field>
              <FieldError>{hata}</FieldError>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={kapat}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={talep.isPending}>
                {talep.isPending ? "Gönderiliyor…" : "Talep et"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </>
  )
}

/** Tek talep satırının işlemi: sonucu sorgula / arşivde aç */
export function BorcuYokturIslem({
  t,
  onDogrulama,
}: {
  t: BorcuYokturView
  onDogrulama: ReturnType<typeof useKamuIslem>["sonuc"]
}) {
  const kontrol = useBorcuYokturKontrol()
  if (t.gorunum === "HAZIR" || t.gorunum === "SURESI_DOLDU")
    return t.arsivDosyaId ? (
      <ButtonLink size="sm" variant="ghost" to={yaziArsivYolu(t)}>
        Arşivde aç
      </ButtonLink>
    ) : null
  if (t.durum !== "TALEP_EDILDI" && t.durum !== "DOGRULAMA_BEKLIYOR")
    return null
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={kontrol.isPending}
      aria-label={`${t.mukellefUnvan} borcu yoktur talebinin sonucunu sorgula`}
      onClick={() =>
        kontrol.mutate(t.id, {
          onSuccess: (r) =>
            onDogrulama(
              r,
              r.talep.durum === "HAZIR"
                ? "Yazı hazır, arşive kaydedildi"
                : r.talep.durum === "BORCU_VAR"
                  ? "Kurum yazı vermedi: borç var"
                  : "Yazı henüz hazır değil"
            ),
          onError: (error) => toast.error(error.message),
        })
      }
    >
      {kontrol.isPending ? "Sorgulanıyor…" : "Sonucu sorgula"}
    </Button>
  )
}

export function BorcuYokturListesi() {
  const { searchParams, guncelle } = useBorcParams()
  const kapsamParam = searchParams.get("kapsam")
  const kapsam =
    kapsamParam && kapsamParam in KAPSAM_ETIKET
      ? (kapsamParam as YaziKapsam)
      : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const yeniAcik = searchParams.get("yazi") !== null
  const liste = useBorcuYokturListe({
    kapsam: kapsam ?? undefined,
    sayfa,
    sayfaBoyutu: BORC_SAYFA_BOYUTU,
  })
  const islem = useKamuIslem()

  return (
    <>
      <ListeAraclari
        etiket="Borcu yoktur filtreleri"
        arama={
          <Button onClick={() => guncelle({ yazi: "" })}>Yazı iste</Button>
        }
      >
        <SekmeFiltre
          etiket="Durum"
          secenekler={KAPSAM_ETIKET}
          value={kapsam}
          onChange={(v) => guncelle({ kapsam: v })}
        />
      </ListeAraclari>

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <LoadingState />
      ) : liste.data.items.length === 0 ? (
        <EmptyState
          icon={FileValidationIcon}
          title={
            kapsam ? "Bu durumda talep yok" : "Henüz borcu yoktur talebi yok"
          }
          description="Banka, ihale ya da teşvik başvurusu için GİB veya SGK'dan borcu yoktur yazısı isteyin; hazır olunca arşive kaydedilir."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="Borcu yoktur talepleri">
              <TableHeader>
                <TableRow>
                  <TableHead>Mükellef</TableHead>
                  <TableHead className="hidden md:table-cell">Talep</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>
                    <span className="sr-only">İşlem</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-72 whitespace-normal">
                      <Link
                        to={`/mukellefler/${t.mukellefId}/borc`}
                        className="font-medium hover:underline"
                      >
                        {t.mukellefUnvan}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {KAMU_KURUM_ETIKET[t.kurum]}
                        {t.talepNo && ` · ${t.talepNo}`}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                      {formatDateTime(t.talepTarihi)}
                      {t.talepEdenAd && (
                        <span className="block text-xs">{t.talepEdenAd}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <BorcuYokturBadge gorunum={t.gorunum} />
                      {t.gecerlilikTarihi && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          Son geçerlilik {formatDate(t.gecerlilikTarihi)}
                        </span>
                      )}
                      {t.aciklama && (
                        <span className="block text-xs text-muted-foreground">
                          {t.aciklama}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <BorcuYokturIslem t={t} onDogrulama={islem.sonuc} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Sayfalama
            total={liste.data.total}
            sayfa={liste.data.sayfa}
            sayfaBoyutu={liste.data.sayfaBoyutu}
            birim="talepten"
            onChange={(s) => guncelle({ sayfa: String(s) })}
          />
        </>
      )}
      <BorcuYokturDialog
        open={yeniAcik}
        onClose={() => guncelle({ yazi: null })}
      />
      <DogrulamaDialog dogrulama={islem.dogrulama} onClose={islem.kapat} />
    </>
  )
}
