import { useMemo, type ReactNode } from "react"

import {
  AramaKutusu,
  FiltreAlani,
  FiltreSheet,
  ListeAraclari,
} from "@/components/shared/liste-araclari"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AtananFiltresi } from "@/features/gorev/components/atanan-filtresi"
import { useGorevParams } from "@/features/gorev/hooks/use-gorev-params"
import { donemSecenekleri } from "@prime/shared/gorev/kurallar"
import { GOREV_TIP_ETIKET, GOREV_TIP_SIRASI } from "@prime/shared/gorev/sabitler"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import { bugun } from "@prime/shared/lib/tarih"
import type { GorevTip } from "@prime/shared/types/domain"

const TUM_DONEMLER = "__tumu__"

interface SheetFiltreleri {
  mukellef: string
  tip: GorevTip[]
  donem: string
  geciken: boolean
}

const VARSAYILAN: SheetFiltreleri = {
  mukellef: "",
  tip: [],
  donem: "",
  geciken: false,
}

export function GorevFiltreleri({
  kullaniciId,
  mukellefSabit,
  children,
}: {
  kullaniciId: string | undefined
  /** Mükellef kartında mükellef filtresi gösterilmez */
  mukellefSabit?: boolean
  /** Araç çubuğunun sağ ucuna eklenir (görünüm toggle'ı) */
  children?: ReactNode
}) {
  const { params, update } = useGorevParams(kullaniciId)

  const donemler = useMemo(() => {
    const secenekler = donemSecenekleri(bugun())
    // URL'deki dönem listede yoksa (eski bir dönem) yine de gösterilsin
    if (params.donem && !secenekler.some((d) => d.value === params.donem))
      secenekler.unshift({ value: params.donem, label: params.donem })
    return secenekler
  }, [params.donem])
  const donemItems = useMemo(
    () => ({
      [TUM_DONEMLER]: "Tüm dönemler",
      ...Object.fromEntries(donemler.map((d) => [d.value, d.label])),
    }),
    [donemler]
  )

  const deger: SheetFiltreleri = {
    mukellef: params.mukellef,
    tip: params.tip,
    donem: params.donem,
    geciken: params.geciken,
  }
  const aktifSayi =
    Number(!mukellefSabit && Boolean(params.mukellef)) +
    Number(params.tip.length > 0) +
    Number(Boolean(params.donem)) +
    Number(params.geciken)

  return (
    <ListeAraclari
      etiket="Görev filtreleri"
      arama={
        <AramaKutusu
          etiket="Görev ara"
          placeholder="Görev veya mükellef ara"
          value={params.q}
          onChange={(q) => update({ q: q.trim() || null })}
        />
      }
    >
      <AtananFiltresi
        kullaniciId={kullaniciId}
        value={params.atanan}
        onChange={(ids) => update({ atanan: ids.length ? ids : null })}
      />
      <div className="flex items-center gap-2">
        <FiltreSheet
          deger={deger}
          varsayilan={VARSAYILAN}
          aktifSayi={aktifSayi}
          onUygula={(t) =>
            update({
              ...(mukellefSabit ? {} : { mukellef: t.mukellef || null }),
              tip: t.tip.length ? t.tip : null,
              donem: t.donem || null,
              geciken: t.geciken || null,
            })
          }
        >
          {(taslak, degistir) => (
            <>
              <Field orientation="horizontal">
                <Checkbox
                  id="filtre-geciken"
                  checked={taslak.geciken}
                  onCheckedChange={(c) => degistir({ geciken: c })}
                />
                <FieldLabel htmlFor="filtre-geciken" className="font-normal">
                  Yalnızca gecikenler
                </FieldLabel>
              </Field>
              {!mukellefSabit && (
                <FiltreAlani etiket="Mükellef" htmlFor="filtre-mukellef">
                  <MukellefSelect
                    id="filtre-mukellef"
                    bosSecenek="Tüm mükellefler"
                    value={taslak.mukellef}
                    onValueChange={(mukellef) => degistir({ mukellef })}
                    className="w-full"
                  />
                </FiltreAlani>
              )}
              <FiltreAlani etiket="Dönem" htmlFor="filtre-donem">
                <Select
                  items={donemItems}
                  value={taslak.donem || TUM_DONEMLER}
                  onValueChange={(d) =>
                    degistir({
                      donem: d && d !== TUM_DONEMLER ? String(d) : "",
                    })
                  }
                >
                  <SelectTrigger id="filtre-donem" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TUM_DONEMLER}>Tüm dönemler</SelectItem>
                    {donemler.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FiltreAlani>
              <FieldSet>
                <FieldLegend variant="label">Görev tipi</FieldLegend>
                <div className="grid gap-2.5">
                  {GOREV_TIP_SIRASI.map((tip) => (
                    <Field key={tip} orientation="horizontal">
                      <Checkbox
                        id={`filtre-tip-${tip}`}
                        checked={taslak.tip.includes(tip)}
                        onCheckedChange={(c) =>
                          degistir({
                            tip: c
                              ? [...taslak.tip, tip]
                              : taslak.tip.filter((t) => t !== tip),
                          })
                        }
                      />
                      <FieldLabel
                        htmlFor={`filtre-tip-${tip}`}
                        className="font-normal"
                      >
                        {GOREV_TIP_ETIKET[tip]}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            </>
          )}
        </FiltreSheet>
        {children}
      </div>
    </ListeAraclari>
  )
}
