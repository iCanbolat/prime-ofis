import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"
import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns"

import { YUKUMLULUK_SIRASI } from "@prime/shared/takvim/kurallar"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type { TakvimDurumFiltre, TakvimListParams } from "@prime/shared/types/api"
import type { MukellefTur, YukumlulukTip } from "@prime/shared/types/domain"

export type TakvimGorunum = "ay" | "liste"
/** Liste görünümünde zaman aralığı */
export type TakvimAralik = "ay" | "hafta" | "geciken"

const TURLER: MukellefTur[] = ["SAHIS", "LTD", "AS"]
const DURUMLAR: TakvimDurumFiltre[] = [
  "bekliyor",
  "hazirlandi",
  "onaylandi",
  "gecikti",
]
const AY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type TakvimParamPatch = Partial<{
  ay: string
  gorunum: TakvimGorunum
  aralik: TakvimAralik
  sorumlu: string
  durum: TakvimDurumFiltre
  tip: YukumlulukTip[]
  tur: MukellefTur[]
}>

/** Pazartesi başlayan hafta */
const HAFTA = { weekStartsOn: 1 } as const

/**
 * Takvim filtreleri URL'de: /takvim?ay=2026-09&gorunum=liste&aralik=hafta&tip=KDV&sorumlu=p_2
 * Varsayılanlar (bu ay, ay görünümü) URL'e yazılmaz.
 */
export function useTakvimParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const bugunYmd = bugun()

  const durum = useMemo(() => {
    const ayParam = searchParams.get("ay")
    const ay = ayParam && AY_RE.test(ayParam) ? ayParam : bugunYmd.slice(0, 7)
    const gorunum: TakvimGorunum =
      searchParams.get("gorunum") === "liste" ? "liste" : "ay"
    const aralikParam = searchParams.get("aralik")
    const aralik: TakvimAralik =
      gorunum === "liste" &&
      (aralikParam === "hafta" || aralikParam === "geciken")
        ? aralikParam
        : "ay"
    const durumParam = searchParams.get("durum") as TakvimDurumFiltre | null

    return {
      ay,
      gorunum,
      aralik,
      tip: searchParams
        .getAll("tip")
        .filter((t): t is YukumlulukTip =>
          YUKUMLULUK_SIRASI.includes(t as YukumlulukTip)
        ),
      tur: searchParams
        .getAll("tur")
        .filter((t): t is MukellefTur => TURLER.includes(t as MukellefTur)),
      sorumlu: searchParams.get("sorumlu") ?? undefined,
      durum:
        durumParam && DURUMLAR.includes(durumParam) ? durumParam : undefined,
    }
  }, [searchParams, bugunYmd])

  /** API'ye gidecek tarih aralığı ve filtreler */
  const sorgu = useMemo<TakvimListParams>(() => {
    const ayBas = fromYmd(`${durum.ay}-01`)
    let baslangic: string
    let bitis: string
    let durumFiltre = durum.durum

    if (durum.gorunum === "ay") {
      // Izgarada görünen tüm günler (önceki/sonraki ayın taşan günleri dahil)
      baslangic = toYmd(startOfWeek(startOfMonth(ayBas), HAFTA))
      bitis = toYmd(endOfWeek(endOfMonth(ayBas), HAFTA))
    } else if (durum.aralik === "hafta") {
      // Gösterge panelindeki "bu hafta" ile aynı tanım: bugün + 7 gün
      baslangic = bugunYmd
      bitis = toYmd(addDays(fromYmd(bugunYmd), 7))
    } else if (durum.aralik === "geciken") {
      baslangic = toYmd(subDays(fromYmd(bugunYmd), 180))
      bitis = toYmd(subDays(fromYmd(bugunYmd), 1))
      durumFiltre = "gecikti"
    } else {
      baslangic = toYmd(startOfMonth(ayBas))
      bitis = toYmd(endOfMonth(ayBas))
    }

    return {
      baslangic,
      bitis,
      tip: durum.tip,
      tur: durum.tur,
      sorumlu: durum.sorumlu,
      durum: durumFiltre,
    }
  }, [durum, bugunYmd])

  const update = useCallback(
    (patch: TakvimParamPatch) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            for (const v of Array.isArray(value) ? value : [value]) {
              if (v) next.append(key, v)
            }
          }
          if (next.get("ay") === bugunYmd.slice(0, 7)) next.delete("ay")
          if (next.get("gorunum") === "ay") {
            next.delete("gorunum")
            next.delete("aralik")
          }
          if (next.get("aralik") === "ay") next.delete("aralik")
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams, bugunYmd]
  )

  const filtreleriTemizle = useCallback(
    () => update({ tip: [], tur: [], sorumlu: undefined, durum: undefined }),
    [update]
  )

  const filtreVar = Boolean(
    durum.tip.length || durum.tur.length || durum.sorumlu || durum.durum
  )

  return {
    ...durum,
    bugun: bugunYmd,
    sorgu,
    update,
    filtreleriTemizle,
    filtreVar,
  }
}
