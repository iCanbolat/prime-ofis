import { useMemo } from "react"
import { format, subMonths } from "date-fns"

import {
  AramaKutusu,
  FiltreAlani,
  FiltreSheet,
  GorunumToggle,
  ListeAraclari,
  SekmeFiltre,
} from "@/components/shared/liste-araclari"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFaturaParams } from "@/features/e-belge/hooks/use-fatura-params"
import { YANIT_UYARI_GUN } from "@prime/shared/e-belge/kurallar"
import {
  EBELGE_YON_ETIKET,
  GIB_DURUM_ETIKET,
  YANIT_ETIKET,
} from "@prime/shared/e-belge/sabitler"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import type { ListeGorunum } from "@/hooks/use-liste-gorunumu"
import { formatDonem } from "@prime/shared/lib/format"
import type { EBelgeSiralama, SiralamaYonu } from "@prime/shared/types/api"
import type {
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  GibDurumu,
} from "@prime/shared/types/domain"

const TUMU = "__tumu__"

const SIRALAMA_ETIKET = {
  "tarih:desc": "Tarih (en yeni)",
  "tarih:asc": "Tarih (en eski)",
  "toplam:desc": "Tutar (en yüksek)",
  "toplam:asc": "Tutar (en düşük)",
} satisfies Record<`${EBelgeSiralama}:${SiralamaYonu}`, string>

/** Tek seçimli, "Tümü" seçenekli filtre select'i */
function FiltreSelect<T extends string>({
  id,
  tumu,
  secenekler,
  value,
  onChange,
}: {
  id: string
  tumu?: string
  secenekler: Record<T, string>
  value: T | null
  onChange: (v: T | null) => void
}) {
  const items = (tumu ? { [TUMU]: tumu, ...secenekler } : secenekler) as Record<
    string,
    string
  >
  return (
    <Select
      items={items}
      value={value ?? TUMU}
      onValueChange={(v) => onChange(!v || v === TUMU ? null : (v as T))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([k, ad]) => (
          <SelectItem key={k} value={k}>
            {ad}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Son 6 ay (içinde bulunulan dahil) */
function useDonemSecenekleri() {
  return useMemo(() => {
    const simdi = new Date()
    return Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => {
        const donem = format(subMonths(simdi, i), "yyyy-MM")
        return [donem, formatDonem(donem)]
      })
    )
  }, [])
}

interface SheetFiltreleri {
  mukellef: string
  donem: string | null
  gibDurumu: GibDurumu | null
  yanit: EFaturaYanit | null
  yanitSuresi: "yaklasan" | null
  siralama: keyof typeof SIRALAMA_ETIKET
}

const VARSAYILAN: SheetFiltreleri = {
  mukellef: "",
  donem: null,
  gibDurumu: null,
  yanit: null,
  yanitSuresi: null,
  siralama: "tarih:desc",
}

const YANIT_SURESI_ETIKET = {
  yaklasan: `${YANIT_UYARI_GUN} gün içinde dolacak`,
}

export function FaturaFiltreleri({
  tur,
  sabitMukellef,
  gorunum,
  onGorunumChange,
}: {
  tur: EBelgeTur
  sabitMukellef?: string
  gorunum: ListeGorunum
  onGorunumChange: (g: ListeGorunum) => void
}) {
  const { params, update } = useFaturaParams(tur, sabitMukellef)
  const donemler = useDonemSecenekleri()
  // Giden faturada yanıt filtresi anlamsız
  const yanitGoster = tur === "E_FATURA" && params.yon !== "GIDEN"

  const deger: SheetFiltreleri = {
    mukellef: sabitMukellef ? "" : (params.mukellef ?? ""),
    donem: params.donem ?? null,
    gibDurumu: params.gibDurumu ?? null,
    yanit: params.yanit ?? null,
    yanitSuresi: params.yanitSuresi ?? null,
    siralama:
      `${params.sirala}:${params.siralamaYonu}` as SheetFiltreleri["siralama"],
  }
  const aktifSayi =
    Number(!sabitMukellef && Boolean(params.mukellef)) +
    Number(Boolean(params.donem)) +
    Number(Boolean(params.gibDurumu)) +
    Number(Boolean(params.yanit)) +
    Number(Boolean(params.yanitSuresi))

  return (
    <ListeAraclari
      etiket="Fatura filtreleri"
      arama={
        <AramaKutusu
          etiket="Fatura ara"
          placeholder="Belge no, karşı taraf, VKN…"
          value={params.q}
          onChange={(q) => update({ q: q.trim() || null })}
        />
      }
    >
      {tur === "E_FATURA" ? (
        <SekmeFiltre<EBelgeYon>
          etiket="Fatura yönü"
          secenekler={EBELGE_YON_ETIKET}
          value={params.yon}
          onChange={(yon) =>
            update({
              yon,
              ...(yon === "GIDEN" ? { yanit: null, yanitSuresi: null } : {}),
            })
          }
        />
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <FiltreSheet
          deger={deger}
          varsayilan={VARSAYILAN}
          aktifSayi={aktifSayi}
          onUygula={(t) => {
            const [sirala, siralamaYonu] = t.siralama.split(":") as [
              EBelgeSiralama,
              SiralamaYonu,
            ]
            update({
              ...(sabitMukellef ? {} : { mukellef: t.mukellef || null }),
              donem: t.donem,
              gibDurumu: t.gibDurumu,
              yanit: yanitGoster ? t.yanit : null,
              yanitSuresi: yanitGoster ? t.yanitSuresi : null,
              sirala,
              siralamaYonu,
            })
          }}
        >
          {(taslak, degistir) => (
            <>
              {!sabitMukellef && (
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
                <FiltreSelect
                  id="filtre-donem"
                  tumu="Tüm tarihler"
                  secenekler={donemler}
                  value={taslak.donem}
                  onChange={(donem) => degistir({ donem })}
                />
              </FiltreAlani>
              <FiltreAlani etiket="GİB durumu" htmlFor="filtre-gib">
                <FiltreSelect<GibDurumu>
                  id="filtre-gib"
                  tumu="Tüm GİB durumları"
                  secenekler={GIB_DURUM_ETIKET}
                  value={taslak.gibDurumu}
                  onChange={(gibDurumu) => degistir({ gibDurumu })}
                />
              </FiltreAlani>
              {yanitGoster && (
                <FiltreAlani etiket="Yanıt durumu" htmlFor="filtre-yanit">
                  <FiltreSelect<EFaturaYanit>
                    id="filtre-yanit"
                    tumu="Tüm yanıtlar"
                    secenekler={YANIT_ETIKET}
                    value={taslak.yanit}
                    onChange={(yanit) => degistir({ yanit })}
                  />
                </FiltreAlani>
              )}
              {yanitGoster && (
                <FiltreAlani
                  etiket="Yanıt süresi"
                  htmlFor="filtre-yanit-suresi"
                >
                  <FiltreSelect<"yaklasan">
                    id="filtre-yanit-suresi"
                    tumu="Tümü"
                    secenekler={YANIT_SURESI_ETIKET}
                    value={taslak.yanitSuresi}
                    onChange={(yanitSuresi) => degistir({ yanitSuresi })}
                  />
                </FiltreAlani>
              )}
              <FiltreAlani etiket="Sıralama" htmlFor="filtre-siralama">
                <FiltreSelect
                  id="filtre-siralama"
                  secenekler={SIRALAMA_ETIKET}
                  value={taslak.siralama}
                  onChange={(s) => s && degistir({ siralama: s })}
                />
              </FiltreAlani>
            </>
          )}
        </FiltreSheet>
        <GorunumToggle value={gorunum} onChange={onGorunumChange} />
      </div>
    </ListeAraclari>
  )
}
