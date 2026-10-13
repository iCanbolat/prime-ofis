import { useMemo, useState } from "react"
import { toast } from "sonner"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePersonelList } from "@/features/auth/queries"
import { donemSecenekleri, tipPeriyotlari } from "@prime/shared/gorev/kurallar"
import {
  useDonemGorevleriOlustur,
  useDonemPlan,
} from "@/features/gorev/queries"
import { MukellefTurBadge } from "@/features/mukellef/components/mukellef-badges"
import {
  YUKUMLULUK_SIRASI,
  YUKUMLULUK_TANIMLARI,
} from "@prime/shared/takvim/kurallar"
import { formatDate } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import type { YukumlulukTip } from "@prime/shared/types/domain"

const TIP_ITEMS = Object.fromEntries(
  YUKUMLULUK_SIRASI.map((t) => [t, YUKUMLULUK_TANIMLARI[t].ad])
)

function Icerik({ onClose }: { onClose: () => void }) {
  const personel = usePersonelList()
  const [tip, setTip] = useState<YukumlulukTip>("KDV")
  const donemler = useMemo(
    () => donemSecenekleri(bugun(), tipPeriyotlari(tip)),
    [tip]
  )
  const [donem, setDonem] = useState(donemler[0]?.value ?? "")
  const plan = useDonemPlan(donem ? { tip, donem } : null)
  const olustur = useDonemGorevleriOlustur()
  // Seçim tip + döneme özeldir; kullanıcı değiştirmediyse görevi olmayan herkes seçili
  const anahtar = `${tip}:${donem}`
  const [secim, setSecim] = useState<{ anahtar: string; ids: Set<string> }>()
  const secili = useMemo(
    () =>
      secim?.anahtar === anahtar
        ? secim.ids
        : new Set(
            (plan.data ?? [])
              .filter((s) => !s.mevcutGorevId)
              .map((s) => s.mukellefId)
          ),
    [secim, anahtar, plan.data]
  )
  const setSecili = (guncelle: (onceki: Set<string>) => Set<string>) =>
    setSecim({ anahtar, ids: guncelle(secili) })

  const personelById = useMemo(
    () => new Map((personel.data ?? []).map((p) => [p.id, p])),
    [personel.data]
  )
  const yeniler = plan.data?.filter((s) => !s.mevcutGorevId) ?? []
  const mevcutSayisi = (plan.data?.length ?? 0) - yeniler.length
  const hepsiSecili = yeniler.length > 0 && secili.size === yeniler.length

  const tipDegistir = (yeni: YukumlulukTip) => {
    setTip(yeni)
    setDonem(donemSecenekleri(bugun(), tipPeriyotlari(yeni))[0]?.value ?? "")
  }

  const onayla = () =>
    olustur.mutate(
      { tip, donem, mukellefIdler: [...secili] },
      {
        onSuccess: ({ olusturulan, atlanan }) => {
          toast.success(
            `${olusturulan} görev oluşturuldu${atlanan ? `, ${atlanan} zaten vardı` : ""}`
          )
          onClose()
        },
        onError: (error) => toast.error(error.message),
      }
    )

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Dönem görevlerini oluştur</DialogTitle>
        <DialogDescription>
          Seçilen yükümlülüğe tabi aktif mükellefler için takvimdeki son güne
          göre görev açılır ve sorumlu personele atanır. Zaten görevi olan
          mükellefler atlanır.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="donem-tip">Yükümlülük</FieldLabel>
          <Select
            items={TIP_ITEMS}
            value={tip}
            onValueChange={(v) => v && tipDegistir(v as YukumlulukTip)}
          >
            <SelectTrigger id="donem-tip" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YUKUMLULUK_SIRASI.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIP_ITEMS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="donem-donem">Dönem</FieldLabel>
          <Select
            items={Object.fromEntries(donemler.map((d) => [d.value, d.label]))}
            value={donem}
            onValueChange={(v) => v && setDonem(String(v))}
          >
            <SelectTrigger id="donem-donem" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {donemler.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {plan.isError ? (
        <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
      ) : !plan.data || plan.isFetching ? (
        <LoadingState label="Önizleme hazırlanıyor…" />
      ) : plan.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Bu dönemde bu yükümlülüğe tabi aktif mükellef yok.
        </p>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {yeniler.length} yeni görev
            {mevcutSayisi > 0 &&
              ` · ${mevcutSayisi} mükellefin görevi zaten var`}
          </p>
          <div className="max-h-80 overflow-y-auto rounded-2xl border">
            <Table aria-label="Oluşturulacak görevler">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Tümünü seç"
                      checked={hepsiSecili}
                      indeterminate={secili.size > 0 && !hepsiSecili}
                      disabled={yeniler.length === 0}
                      onCheckedChange={(c) =>
                        setSecili(() =>
                          c
                            ? new Set(yeniler.map((s) => s.mukellefId))
                            : new Set()
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Mükellef</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Atanacak
                  </TableHead>
                  <TableHead>Son gün</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.data.map((s) => {
                  const p = personelById.get(s.atananId)
                  return (
                    <TableRow key={s.mukellefId}>
                      <TableCell>
                        <Checkbox
                          aria-label={`${s.unvan} seç`}
                          disabled={Boolean(s.mevcutGorevId)}
                          checked={!s.mevcutGorevId && secili.has(s.mukellefId)}
                          onCheckedChange={(c) =>
                            setSecili((onceki) => {
                              const next = new Set(onceki)
                              if (c) next.add(s.mukellefId)
                              else next.delete(s.mukellefId)
                              return next
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="max-w-56">
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate">{s.unvan}</span>
                          <span className="flex items-center gap-1.5">
                            <MukellefTurBadge tur={s.tur} />
                            {s.mevcutGorevId && (
                              <Badge variant="outline">Zaten var</Badge>
                            )}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {p && (
                          <span className="flex items-center gap-2">
                            <PersonelAvatar personel={p} size="sm" />
                            {p.ad} {p.soyad}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(s.sonTarih)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          disabled={secili.size === 0 || olustur.isPending || plan.isFetching}
          onClick={onayla}
        >
          {secili.size > 0 ? `${secili.size} görev oluştur` : "Görev oluştur"}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function DonemGorevleriDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        {open && <Icerik onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
