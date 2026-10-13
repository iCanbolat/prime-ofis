import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useLucaSablonu,
  useLucaSablonuKaydet,
} from "@/features/fis-aktarimi/queries"
import {
  LUCA_ALAN_ETIKET,
  TARIH_FORMATLARI,
  VARSAYILAN_LUCA_SABLONU,
  ZORUNLU_ALANLAR,
} from "@prime/shared/fis-aktarimi/sabitler"
import type { LucaSablonAyari, LucaSutunAlan } from "@prime/shared/types/domain"

const TUM_ALANLAR = Object.keys(LUCA_ALAN_ETIKET) as LucaSutunAlan[]

function SablonFormu({ sablon }: { sablon: LucaSablonAyari }) {
  const kaydet = useLucaSablonuKaydet()
  const [taslak, setTaslak] = useState(sablon)
  const kullanilan = new Set(taslak.sutunlar.map((s) => s.alan))
  const eklenebilir = TUM_ALANLAR.filter((a) => !kullanilan.has(a))

  const tasi = (i: number, yon: -1 | 1) => {
    const sutunlar = [...taslak.sutunlar]
    const [s] = sutunlar.splice(i, 1)
    sutunlar.splice(i + yon, 0, s!)
    setTaslak({ ...taslak, sutunlar })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    kaydet.mutate(taslak, {
      onSuccess: () => toast.success("Luca şablonu kaydedildi"),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <ol aria-label="Excel sütunları" className="grid gap-2">
        {taslak.sutunlar.map((s, i) => {
          const zorunlu = ZORUNLU_ALANLAR.includes(s.alan)
          return (
            <li key={s.alan} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">
                {String.fromCharCode(65 + i)}
              </span>
              <Input
                aria-label={`${LUCA_ALAN_ETIKET[s.alan]} sütun başlığı`}
                value={s.baslik}
                className="w-full sm:w-56"
                onChange={(e) =>
                  setTaslak({
                    ...taslak,
                    sutunlar: taslak.sutunlar.map((x, j) =>
                      j === i ? { ...x, baslik: e.target.value } : x
                    ),
                  })
                }
              />
              <span className="min-w-32 flex-1 text-sm text-muted-foreground">
                {LUCA_ALAN_ETIKET[s.alan]}
                {zorunlu && " · zorunlu"}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${LUCA_ALAN_ETIKET[s.alan]} sütununu yukarı taşı`}
                disabled={i === 0}
                onClick={() => tasi(i, -1)}
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${LUCA_ALAN_ETIKET[s.alan]} sütununu aşağı taşı`}
                disabled={i === taslak.sutunlar.length - 1}
                onClick={() => tasi(i, 1)}
              >
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`${LUCA_ALAN_ETIKET[s.alan]} sütununu kaldır`}
                disabled={zorunlu}
                onClick={() =>
                  setTaslak({
                    ...taslak,
                    sutunlar: taslak.sutunlar.filter((_, j) => j !== i),
                  })
                }
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </li>
          )
        })}
      </ol>
      {eklenebilir.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {eklenebilir.map((alan) => (
            <Button
              key={alan}
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                setTaslak({
                  ...taslak,
                  sutunlar: [
                    ...taslak.sutunlar,
                    {
                      alan,
                      baslik:
                        VARSAYILAN_LUCA_SABLONU.sutunlar.find(
                          (s) => s.alan === alan
                        )?.baslik ?? LUCA_ALAN_ETIKET[alan],
                    },
                  ],
                })
              }
            >
              + {LUCA_ALAN_ETIKET[alan]}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="luca-tarih">Tarih biçimi</FieldLabel>
          <Select
            value={taslak.tarihFormati}
            onValueChange={(v) =>
              v && setTaslak({ ...taslak, tarihFormati: v })
            }
          >
            <SelectTrigger id="luca-tarih" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARIH_FORMATLARI.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="luca-fisno">Başlangıç fiş no</FieldLabel>
          <Input
            id="luca-fisno"
            type="number"
            min={1}
            value={taslak.baslangicFisNo}
            onChange={(e) =>
              setTaslak({ ...taslak, baslangicFisNo: Number(e.target.value) })
            }
          />
          <FieldDescription>
            Her dosyada fişler bu numaradan başlayarak sıralanır.
          </FieldDescription>
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setTaslak(VARSAYILAN_LUCA_SABLONU)}
        >
          Varsayılana dön
        </Button>
        <Button type="submit" disabled={kaydet.isPending}>
          Kaydet
        </Button>
      </div>
    </form>
  )
}

export function LucaSablonuPage() {
  const sablon = useLucaSablonu()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Luca Excel aktarım şablonu</CardTitle>
        <CardDescription>
          Fiş aktarımında indirilen dosyanın sütunları. Luca'da Excel Veri
          Aktarımı → Şablon indir ile aldığınız dosyadaki başlık ve sırayla aynı
          olmalı. Luca bir dosyada en fazla 50 fiş, bir mahsup fişinde en fazla
          400 satır kabul eder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sablon.isPending ? (
          <LoadingState />
        ) : sablon.isError ? (
          <ErrorState error={sablon.error} onRetry={() => sablon.refetch()} />
        ) : (
          <SablonFormu key={JSON.stringify(sablon.data)} sablon={sablon.data} />
        )}
      </CardContent>
    </Card>
  )
}
