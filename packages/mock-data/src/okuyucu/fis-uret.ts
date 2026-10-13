/**
 * Okuma → muhasebe fişi taslağı: backend'in okuma kuyruğu işçisinin mock karşılığı. DB'ye
 * yazmaz (seed de kullanır); kayıtları döner, yazmayı çağıran yapar.
 */
import { format, parseISO, subMonths } from "date-fns"

import {
  ekstreTaslaklari,
  fisTaslagi,
  belgeTuruBul,
  mukerrerUyarilari,
  type FisTaslagi,
} from "@prime/shared/fis-aktarimi/kurallar"
import { OkumaHatasi } from "@prime/shared/fis-aktarimi/okuyucu"
import { mockBelgeOku } from "./mock-okuyucu"
import type {
  BelgeOkuma,
  EBelge,
  EvrakTalebi,
  FisHesapAyari,
  FisOkumasi,
  GelenEvrak,
  IstenenEvrak,
  Mukellef,
  MuhasebeFisi,
  OkumaTur,
} from "@prime/shared/types/domain"

/** Bu evraklar onaylanınca okunur */
export function okumaTuru(istenen: IstenenEvrak): OkumaTur | null {
  if (istenen === "FIS_FATURA") return "FIS"
  if (istenen === "BANKA_EKSTRESI") return "EKSTRE"
  return null
}

/** Fiş aktarımı şimdilik yalnızca bilanço esasına göre defter tutanlar için */
export function fisAktarimiDestekli(m: Pick<Mukellef, "defterTuru">) {
  return m.defterTuru === "BILANCO"
}

/** Belgenin ait olduğu ay: talebin dönemi, dönemsiz talepte yüklemeden önceki ay */
export function belgeDonemi(
  gelen: Pick<GelenEvrak, "yuklemeTarihi">,
  talep?: Pick<EvrakTalebi, "donem">
): string {
  return (
    talep?.donem ??
    format(subMonths(parseISO(gelen.yuklemeTarihi), 1), "yyyy-MM")
  )
}

export function okumaBaslat(
  gelen: Pick<GelenEvrak, "id" | "mukellefId" | "arsivDosyaId">,
  tur: OkumaTur,
  simdi: string
): BelgeOkuma {
  return {
    id: `ok_${gelen.id}`,
    gelenId: gelen.id,
    arsivDosyaId: gelen.arsivDosyaId,
    mukellefId: gelen.mukellefId,
    tur,
    durum: "OKUNUYOR",
    olusturmaTarihi: simdi,
  }
}

export interface SonuclandirmaBaglami {
  gelen: Pick<GelenEvrak, "id" | "ad">
  donem: string
  ayar: FisHesapAyari
  /** Aynı mükellefin diğer fiş okumaları (mükerrer kontrolü) */
  digerFisOkumalari: FisOkumasi[]
  /** Mükellefin e-belgeleri (e-Fatura ile çakışma kontrolü) */
  ebelgeler: Pick<EBelge, "yon" | "tur" | "belgeNo" | "karsiTaraf">[]
  simdi: string
}

/** Okumayı tamamlar; başarılıysa taslak fişleri üretir */
export function okumaSonuclandir(
  okuma: BelgeOkuma,
  b: SonuclandirmaBaglami
): { okuma: BelgeOkuma; fisler: MuhasebeFisi[] } {
  let sonuc
  try {
    sonuc = mockBelgeOku(b.gelen.id, b.gelen.ad, okuma.tur, b.donem)
  } catch (error) {
    if (!(error instanceof OkumaHatasi)) throw error
    return {
      okuma: { ...okuma, durum: "HATA", hataMesaji: error.message },
      fisler: [],
    }
  }

  let taslaklar: FisTaslagi[]
  let guncel: BelgeOkuma
  if (sonuc.tur === "FIS") {
    const taslak = fisTaslagi(sonuc.fis, b.ayar)
    taslak.uyarilar.push(
      ...mukerrerUyarilari(sonuc.fis, b.digerFisOkumalari, b.ebelgeler)
    )
    taslak.belgeTuru = belgeTuruBul(sonuc.fis, b.ebelgeler)
    taslaklar = [taslak]
    guncel = {
      ...okuma,
      durum: "OKUNDU",
      fis: sonuc.fis,
      hataMesaji: undefined,
    }
  } else {
    taslaklar = ekstreTaslaklari(sonuc.ekstre, b.ayar)
    guncel = {
      ...okuma,
      durum: "OKUNDU",
      ekstre: sonuc.ekstre,
      hataMesaji: undefined,
    }
  }

  const fisler = taslaklar.map((t, i): MuhasebeFisi => ({
    id: `mf_${b.gelen.id}_${i + 1}`,
    mukellefId: okuma.mukellefId,
    okumaId: okuma.id,
    gelenId: okuma.gelenId,
    arsivDosyaId: okuma.arsivDosyaId,
    tarih: t.tarih,
    aciklama: t.aciklama,
    evrakNo: t.evrakNo,
    evrakTarihi: t.evrakTarihi,
    belgeTuru: t.belgeTuru ?? "MF",
    satirlar: t.satirlar,
    durum: "TASLAK",
    uyarilar: t.uyarilar,
    parca: t.parca,
    olusturmaTarihi: b.simdi,
  }))
  return { okuma: guncel, fisler }
}
