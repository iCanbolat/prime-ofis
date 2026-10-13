import { Controller, type Control } from "react-hook-form"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { ucretHesapla } from "@prime/shared/tahsilat/kurallar"
import { KDV_ORANLARI } from "@prime/shared/tahsilat/sabitler"
import { formatTRY } from "@prime/shared/lib/format"

/** Borç ve ücret formlarının ortak KDV + stopaj alanları */
export interface KdvStopajDegerleri {
  kdvOrani: number
  stopajVar: boolean
}

export function KdvStopajAlanlari<T extends KdvStopajDegerleri>({
  control,
  idOnek,
}: {
  control: Control<T>
  idOnek: string
}) {
  // react-hook-form generic Control'ü alan adlarında daraltamadığı için tek noktada genişletilir
  const c = control as unknown as Control<KdvStopajDegerleri>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idOnek}-kdv-etiket`}>KDV oranı</FieldLabel>
        <Controller
          control={c}
          name="kdvOrani"
          render={({ field }) => (
            <Select
              items={KDV_ORANLARI.map((o) => ({
                value: String(o),
                label: `%${o}`,
              }))}
              value={String(field.value)}
              onValueChange={(v) => v && field.onChange(Number(v))}
            >
              <SelectTrigger id={`${idOnek}-kdv-etiket`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KDV_ORANLARI.map((o) => (
                  <SelectItem key={o} value={String(o)}>
                    %{o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Controller
        control={c}
        name="stopajVar"
        render={({ field }) => (
          <Field orientation="horizontal" className="self-end">
            <Checkbox
              id={`${idOnek}-stopaj`}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(Boolean(v))}
            />
            <div className="grid gap-1">
              <FieldLabel htmlFor={`${idOnek}-stopaj`}>
                %20 stopaj kesilir
              </FieldLabel>
              <FieldDescription>Mükellef tevkifat sorumlusu</FieldDescription>
            </div>
          </Field>
        )}
      />
    </div>
  )
}

/** Brüt → KDV, stopaj ve mükellefin ödeyeceği net tutar özeti */
export function UcretOzeti({
  brut,
  kdvOrani,
  stopajVar,
}: {
  brut: number
  kdvOrani: number
  stopajVar: boolean
}) {
  const t = ucretHesapla(
    Number.isFinite(brut) && brut > 0 ? brut : 0,
    kdvOrani,
    stopajVar
  )
  return (
    <dl
      aria-label="Tutar özeti"
      className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-muted/40 px-4 py-3 text-sm sm:grid-cols-4"
    >
      {(
        [
          ["Brüt", t.brut],
          [`KDV %${kdvOrani}`, t.kdv],
          ["Stopaj", -t.stopaj],
          ["Tahsil edilecek", t.net],
        ] as const
      ).map(([etiket, deger], i) => (
        <div key={etiket} className="grid">
          <dt className="text-xs text-muted-foreground">{etiket}</dt>
          <dd
            className={i === 3 ? "font-semibold tabular-nums" : "tabular-nums"}
          >
            {formatTRY(deger)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
