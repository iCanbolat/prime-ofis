import { useMemo, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { useAuthStore } from "@/features/auth/store"
import { LucaDogrulamaDialog } from "@/features/e-belge/components/luca-dogrulama"
import {
  lucaDogrulamaBekliyor,
  useLucaFirmaAktar,
  useLucaFirmalar,
} from "@/features/e-belge/queries"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import type { LucaFirma, LucaFirmaAktarimSonucu } from "@prime/shared/types/api"

const servisler = (f: LucaFirma) =>
  [f.eFatura && "e-Fatura", f.eArsiv && "e-Arşiv", f.eDefter && "e-Defter"]
    .filter(Boolean)
    .join(" · ") || "—"

/**
 * Luca'dan mükellef aktarımı. Büronun Luca hesabında olup henüz mükellefe eşlenmemiş firmalar
 * listelenir: VKN/TCKN'si kayıtlı mükellefle aynı olan firma o mükellefe eşlenir, diğerleri için
 * Luca firma kartından (unvan, kimlik, vergi dairesi, adres) mükellef açılır. Eksik bilgiler
 * mükellef kartından tamamlanır.
 */
function AktarimIcerik({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const firmalar = useLucaFirmalar()
  const aktar = useLucaFirmaAktar()
  const [secim, setSecim] = useState<Set<string>>(new Set())
  const [sorumluId, setSorumluId] = useState(user?.id ?? "")
  const [dogrulama, setDogrulama] = useState(false)
  const [sonuc, setSonuc] = useState<LucaFirmaAktarimSonucu | null>(null)

  const bekleyen = useMemo(
    () => (firmalar.data ?? []).filter((f) => !f.mukellefId),
    [firmalar.data]
  )
  const esliSayisi = (firmalar.data?.length ?? 0) - bekleyen.length
  const tumu = bekleyen.length > 0 && secim.size === bekleyen.length

  const degistir = (firmaId: string, secili: boolean) =>
    setSecim((onceki) => {
      const yeni = new Set(onceki)
      if (secili) yeni.add(firmaId)
      else yeni.delete(firmaId)
      return yeni
    })

  const gonder = () =>
    aktar.mutate(
      { firmaIdler: [...secim], sorumluPersonelId: sorumluId },
      {
        onSuccess: (s) => {
          setSecim(new Set())
          setSonuc(s)
          const parcalar = [
            s.olusturulan && `${s.olusturulan} yeni mükellef`,
            s.eslenen && `${s.eslenen} mükellef eşlendi`,
          ].filter(Boolean)
          if (parcalar.length) toast.success(parcalar.join(", "))
        },
        onError: (error) => {
          if (lucaDogrulamaBekliyor(error)) setDogrulama(true)
          else toast.error(error.message)
        },
      }
    )

  let govde: React.ReactNode
  if (firmalar.isError) {
    govde = lucaDogrulamaBekliyor(firmalar.error) ? (
      <div className="grid gap-2 text-sm">
        <p className="text-muted-foreground">
          Luca firma listesi için doğrulama kodu gerekiyor.
        </p>
        <div>
          <Button size="sm" onClick={() => setDogrulama(true)}>
            Kodu gir
          </Button>
        </div>
      </div>
    ) : (
      <div className="grid gap-2 text-sm">
        <ErrorState error={firmalar.error} onRetry={() => firmalar.refetch()} />
        <div>
          <Link
            to="/ayarlar/luca-hesap"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Luca hesabına git
          </Link>
        </div>
      </div>
    )
  } else if (!firmalar.data) {
    govde = <LoadingState />
  } else if (bekleyen.length === 0) {
    govde = (
      <p className="text-sm text-muted-foreground">
        Luca hesabındaki {esliSayisi} firmanın tamamı bir mükellefe eşli.
      </p>
    )
  } else {
    govde = (
      <div className="grid gap-4">
        <Field className="max-w-sm">
          <FieldLabel htmlFor="luca-aktarim-sorumlu">
            Yeni mükelleflerin sorumlusu
          </FieldLabel>
          <PersonelSelect
            id="luca-aktarim-sorumlu"
            value={sorumluId}
            onValueChange={setSorumluId}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <Checkbox
              checked={tumu}
              indeterminate={secim.size > 0 && !tumu}
              onCheckedChange={(c) =>
                setSecim(
                  c ? new Set(bekleyen.map((f) => f.firmaId)) : new Set()
                )
              }
              aria-label="Tümünü seç"
            />
            {bekleyen.length} firma mükellefe eşli değil
          </label>
          {esliSayisi > 0 && (
            <span className="text-muted-foreground">
              {esliSayisi} firma zaten eşli
            </span>
          )}
        </div>
        <ul
          aria-label="Luca firmaları"
          className="grid max-h-80 gap-1 overflow-y-auto rounded-2xl border p-1"
        >
          {bekleyen.map((f) => (
            <li key={f.firmaId}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                <Checkbox
                  className="mt-0.5"
                  checked={secim.has(f.firmaId)}
                  onCheckedChange={(c) => degistir(f.firmaId, Boolean(c))}
                  aria-label={f.unvan}
                />
                <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {f.unvan}
                    {f.eslesenMukellefId ? (
                      <Badge variant="secondary">
                        Kayıtlı mükellefe eşlenecek
                      </Badge>
                    ) : (
                      <Badge variant="outline">Yeni mükellef</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[f.vknTckn, f.vergiDairesi, servisler(f)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Luca'dan mükellef aktar</DialogTitle>
        <DialogDescription>
          Büronun Luca hesabındaki firmalardan mükellef oluşturulur ve firmayla
          eşlenir. Vergi dairesi ve adres Luca'dan alınır; NACE, KDV periyodu ve
          SGK bilgilerini mükellef kartından tamamlayın.
        </DialogDescription>
      </DialogHeader>
      {govde}
      {sonuc && sonuc.hatalar.length > 0 && (
        <div className="grid gap-1 rounded-2xl border border-destructive/40 p-3 text-sm">
          <span className="font-medium text-destructive">
            {sonuc.hatalar.length} firma aktarılamadı
          </span>
          <ul className="grid gap-0.5 text-muted-foreground">
            {sonuc.hatalar.map((h) => (
              <li key={h.firmaId}>
                {h.unvan}: {h.mesaj}
              </li>
            ))}
          </ul>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Kapat
        </Button>
        {bekleyen.length > 0 && (
          <Button
            disabled={secim.size === 0 || !sorumluId || aktar.isPending}
            onClick={gonder}
          >
            {aktar.isPending
              ? "Aktarılıyor…"
              : secim.size
                ? `${secim.size} firmayı aktar`
                : "Firma seçin"}
          </Button>
        )}
      </DialogFooter>
      <LucaDogrulamaDialog
        open={dogrulama}
        onClose={() => setDogrulama(false)}
        onCozuldu={() => void firmalar.refetch()}
      />
    </>
  )
}

export function LucaFirmaAktarimDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {open && <AktarimIcerik onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
