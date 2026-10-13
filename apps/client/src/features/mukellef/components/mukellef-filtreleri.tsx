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
import type { ListeGorunum } from "@/hooks/use-liste-gorunumu"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import {
  VARSAYILAN_DURUM,
  useMukellefListParams,
} from "@/features/mukellef/hooks/use-mukellef-list-params"
import type {
  MukellefDurumFiltre,
  MukellefSiralama,
  SiralamaYonu,
} from "@prime/shared/types/api"
import { MUKELLEF_TUR_ETIKET, type MukellefTur } from "@prime/shared/types/domain"

const DURUM_ETIKET: Record<MukellefDurumFiltre, string> = {
  aktif: "Aktif",
  pasif: "Pasif",
  tumu: "Tüm durumlar",
}

/** Sıralama alanı + yönü tek seçimde */
const SIRALAMA_ETIKET = {
  "unvan:asc": "Unvan (A → Z)",
  "unvan:desc": "Unvan (Z → A)",
  "olusturmaTarihi:desc": "Kayıt tarihi (en yeni)",
  "olusturmaTarihi:asc": "Kayıt tarihi (en eski)",
} satisfies Record<`${MukellefSiralama}:${SiralamaYonu}`, string>

interface SheetFiltreleri {
  sorumlu: string
  durum: MukellefDurumFiltre
  siralama: keyof typeof SIRALAMA_ETIKET
}

const VARSAYILAN: SheetFiltreleri = {
  sorumlu: "",
  durum: VARSAYILAN_DURUM,
  siralama: "unvan:asc",
}

export function MukellefFiltreleri({
  gorunum,
  onGorunumChange,
}: {
  gorunum: ListeGorunum
  onGorunumChange: (g: ListeGorunum) => void
}) {
  const { params, update } = useMukellefListParams()

  const deger: SheetFiltreleri = {
    sorumlu: params.sorumlu ?? "",
    durum: params.durum,
    siralama: `${params.sirala}:${params.yon}` as SheetFiltreleri["siralama"],
  }
  const aktifSayi =
    Number(Boolean(params.sorumlu)) + Number(params.durum !== VARSAYILAN_DURUM)

  return (
    <ListeAraclari
      etiket="Mükellef filtreleri"
      arama={
        <AramaKutusu
          etiket="Mükellef ara"
          placeholder="Unvan, VKN veya TCKN ara…"
          value={params.q ?? ""}
          onChange={(q) => update({ q: q.trim() || undefined })}
        />
      }
    >
      <SekmeFiltre<MukellefTur>
        etiket="Mükellef türü"
        secenekler={MUKELLEF_TUR_ETIKET}
        // URL birden çok tür taşıyabilir (eski linkler); sekmede ilki seçili görünür
        value={params.tur.length === 1 ? params.tur[0] : null}
        onChange={(tur) => update({ tur: tur ? [tur] : [] })}
      />
      <div className="flex items-center gap-2">
        <FiltreSheet
          deger={deger}
          varsayilan={VARSAYILAN}
          aktifSayi={aktifSayi}
          onUygula={(t) => {
            const [sirala, yon] = t.siralama.split(":") as [
              MukellefSiralama,
              SiralamaYonu,
            ]
            update({
              sorumlu: t.sorumlu || undefined,
              durum: t.durum,
              sirala,
              yon,
            })
          }}
        >
          {(taslak, degistir) => (
            <>
              <FiltreAlani etiket="Sorumlu personel" htmlFor="filtre-sorumlu">
                <PersonelSelect
                  id="filtre-sorumlu"
                  bosSecenek="Tüm personel"
                  value={taslak.sorumlu}
                  onValueChange={(sorumlu) => degistir({ sorumlu })}
                  className="w-full"
                />
              </FiltreAlani>
              <FiltreAlani etiket="Durum" htmlFor="filtre-durum">
                <Select
                  items={DURUM_ETIKET}
                  value={taslak.durum}
                  onValueChange={(d) =>
                    degistir({
                      durum: (d ?? VARSAYILAN_DURUM) as MukellefDurumFiltre,
                    })
                  }
                >
                  <SelectTrigger id="filtre-durum" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DURUM_ETIKET) as MukellefDurumFiltre[]).map(
                      (d) => (
                        <SelectItem key={d} value={d}>
                          {DURUM_ETIKET[d]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </FiltreAlani>
              <FiltreAlani etiket="Sıralama" htmlFor="filtre-siralama">
                <Select
                  items={SIRALAMA_ETIKET}
                  value={taslak.siralama}
                  onValueChange={(s) =>
                    s &&
                    degistir({ siralama: s as SheetFiltreleri["siralama"] })
                  }
                >
                  <SelectTrigger id="filtre-siralama" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SIRALAMA_ETIKET).map(([k, ad]) => (
                      <SelectItem key={k} value={k}>
                        {ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FiltreAlani>
            </>
          )}
        </FiltreSheet>
        <GorunumToggle value={gorunum} onChange={onGorunumChange} />
      </div>
    </ListeAraclari>
  )
}
