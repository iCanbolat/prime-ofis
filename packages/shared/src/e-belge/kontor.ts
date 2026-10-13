/**
 * Kontör kuralları — saf fonksiyonlar; mock handler ve (ileride) backend aynı hesabı kullanır.
 * Kaynak: TÜRMOB-Luca e-entegratör fiyat listesi — gelen ve giden her e-belge 1 kontör,
 * Luca Net / Koza kullanıcılarına alımda %20 hediye kontör, kontörde süre sınırı yok.
 */
import { format, parseISO, subMonths } from "date-fns"

import { fromYmd } from "../lib/tarih"
import type { EBelge, KontorAlim } from "../types/domain"

export const KONTOR_BELGE_BASINA = 1
export const LUCA_HEDIYE_ORANI = 0.2
/** Aylık ortalama, içinde bulunulan aydan önceki bu kadar tam aydan hesaplanır */
export const ORTALAMA_AY = 3
/** Kalan kontör bu kadar aylık tüketimin altına inince uyarı verilir */
export const KONTOR_UYARI_AY = 2

type TuketimBelgesi = Pick<EBelge, "mukellefId" | "yon" | "alinmaTarihi">

export function hediyeKontor(paketAdet: number): number {
  return Math.round(paketAdet * LUCA_HEDIYE_ORANI)
}

/** Belgenin kontör harcadığı dönem ("2026-09"): posta kutusuna düştüğü / gönderildiği ay */
export function kontorDonemi(belge: Pick<EBelge, "alinmaTarihi">): string {
  return format(parseISO(belge.alinmaTarihi), "yyyy-MM")
}

/** İçinde bulunulan ay dahil geriye doğru `adet` dönem, eskiden yeniye */
export function sonDonemler(bugunYmd: string, adet: number): string[] {
  const ay = fromYmd(`${bugunYmd.slice(0, 7)}-01`)
  return Array.from({ length: adet }, (_, i) =>
    format(subMonths(ay, adet - 1 - i), "yyyy-MM")
  )
}

export function donemTuketimi(
  belgeler: TuketimBelgesi[],
  donem: string
): number {
  return (
    belgeler.filter((b) => kontorDonemi(b) === donem).length *
    KONTOR_BELGE_BASINA
  )
}

export interface KontorBakiye {
  toplamAlinan: number
  toplamTuketim: number
  kalan: number
  /** KDV dahil, hediye kontör dahil ortalama birim maliyet (TL) */
  birimMaliyet: number
  aylikOrtalama: number
  /** Kalan kontörün aylık ortalamayla kaç ay yeteceği; tüketim yoksa null */
  tahminiAy: number | null
  dusukBakiye: boolean
}

export function kontorBakiyesi(
  alimlar: Pick<KontorAlim, "paketAdet" | "hediyeAdet" | "tutar">[],
  belgeler: TuketimBelgesi[],
  bugunYmd: string
): KontorBakiye {
  const toplamAlinan = alimlar.reduce(
    (t, a) => t + a.paketAdet + a.hediyeAdet,
    0
  )
  const toplamTutar = alimlar.reduce((t, a) => t + a.tutar, 0)
  const toplamTuketim = belgeler.length * KONTOR_BELGE_BASINA
  const kalan = toplamAlinan - toplamTuketim

  const oncekiAylar = sonDonemler(bugunYmd, ORTALAMA_AY + 1).slice(0, -1)
  const aylikOrtalama = Math.round(
    oncekiAylar.reduce((t, d) => t + donemTuketimi(belgeler, d), 0) /
      ORTALAMA_AY
  )

  return {
    toplamAlinan,
    toplamTuketim,
    kalan,
    birimMaliyet: toplamAlinan > 0 ? toplamTutar / toplamAlinan : 0,
    aylikOrtalama,
    tahminiAy:
      aylikOrtalama > 0
        ? Math.max(0, Math.floor((kalan / aylikOrtalama) * 10) / 10)
        : null,
    dusukBakiye: kalan <= 0 || kalan < aylikOrtalama * KONTOR_UYARI_AY,
  }
}

export interface MukellefTuketimi {
  mukellefId: string
  gelen: number
  giden: number
  toplam: number
}

/** Dönemde kontör harcayan mükellefler, en çok harcayandan başlayarak */
export function mukellefTuketimleri(
  belgeler: TuketimBelgesi[],
  donem: string
): MukellefTuketimi[] {
  const satirlar = new Map<string, MukellefTuketimi>()
  for (const b of belgeler) {
    if (kontorDonemi(b) !== donem) continue
    const s = satirlar.get(b.mukellefId) ?? {
      mukellefId: b.mukellefId,
      gelen: 0,
      giden: 0,
      toplam: 0,
    }
    if (b.yon === "GELEN") s.gelen += KONTOR_BELGE_BASINA
    else s.giden += KONTOR_BELGE_BASINA
    s.toplam += KONTOR_BELGE_BASINA
    satirlar.set(b.mukellefId, s)
  }
  return [...satirlar.values()].sort((a, b) => b.toplam - a.toplam)
}
