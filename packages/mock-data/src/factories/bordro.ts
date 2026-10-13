import type { Faker } from "@faker-js/faker"

import {
  bordroKayitId,
  bordroUygulanirMi,
  sonBordroDonemleri,
} from "@prime/shared/bordro/kurallar"
import type {
  ArsivDosya,
  BordroBelgeTur,
  BordroDonemi,
  BordroOzeti,
  IsHareketi,
  Mukellef,
} from "@prime/shared/types/domain"

/** Seed referans günü (SEED_REF_DATE ile aynı gün) */
const REFERANS = "2026-09-01"

const yuvarla = (n: number) => Math.round(n * 100) / 100

/**
 * Mükellefin çalışan sayısına göre tutarlı bir dönem özeti (mock değerler; gerçek oranlar
 * mevzuattan gelir, burada yalnızca makul büyüklükler üretilir).
 */
export function ornekBordroOzeti(
  faker: Faker,
  calisanSayisi: number
): BordroOzeti {
  const calisan = Math.max(1, calisanSayisi)
  const brut = yuvarla(calisan * faker.number.int({ min: 34_000, max: 62_000 }))
  return {
    calisanSayisi: calisan,
    brutToplam: brut,
    netToplam: yuvarla(brut * 0.77),
    sgkIsciPayi: yuvarla(brut * 0.14),
    sgkIsverenPayi: yuvarla(brut * 0.2175),
    issizlikToplam: yuvarla(brut * 0.03),
    gelirVergisi: yuvarla(brut * 0.08),
    damgaVergisi: yuvarla(brut * 0.00759),
  }
}

/** Dönem belgesinin arşiv kaydı (faker kullanmaz; içerik istek anında placeholder) */
function belgeKaydi(
  m: Mukellef,
  donem: string,
  tur: BordroBelgeTur,
  yukleyenId: string,
  zaman: string
): ArsivDosya {
  const ad: Record<BordroBelgeTur, string> = {
    PUANTAJ: `Puantaj ${donem}.xlsx`,
    ICMAL: `Bordro dökümü ${donem}.pdf`,
    PUSULA: `Ücret hesap pusulaları ${donem}.pdf`,
    TAHAKKUK: `MUHSGK tahakkuk ${donem}.pdf`,
    IMZALI: `İmzalı bordro ${donem}.pdf`,
    DEKONT: `Maaş ödeme dekontu ${donem}.pdf`,
  }
  return {
    id: `bb_${m.id}_${donem}_${tur.toLowerCase()}`,
    mukellefId: m.id,
    kategori: "BORDRO",
    ad: ad[tur],
    mimeType: ad[tur].endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf",
    boyut: 180_000 + m.calisanSayisi * 12_000,
    yukleyenId,
    yuklemeTarihi: zaman,
    donem,
    bordroBelge: tur,
    silindi: false,
  }
}

/**
 * Bordrosu olan mükelleflerde son üç ayın bordro kayıtları. Eski dönemler tamamlanmış (mükellefe
 * gitmiş, özetli); en yeni dönem karışık: bir kısmı hiç işlem görmemiş (kayıt yok).
 * Özetli dönemlerin icmali (tamamlananlarda pusulası da) arşive dönemle bağlı yazılır.
 * Faker sırasını bozmamak için seed'de en son çağrılır.
 */
export function createBordroVerisi(
  faker: Faker,
  mukellefler: Mukellef[],
  personelIds: string[]
): { bordro: BordroDonemi[]; isHareketi: IsHareketi[]; arsiv: ArsivDosya[] } {
  const bordro: BordroDonemi[] = []
  const arsiv: ArsivDosya[] = []
  const donemler = sonBordroDonemleri(REFERANS, 3)
  const simdi = `${REFERANS}T09:00:00.000Z`

  for (const m of mukellefler.filter(bordroUygulanirMi)) {
    donemler.forEach((donem, i) => {
      const guncelleyenId = faker.helpers.arrayElement(personelIds)
      const ortak = {
        id: bordroKayitId(m.id, donem),
        mukellefId: m.id,
        donem,
        guncelleyenId,
        guncellemeTarihi: simdi,
      }
      if (i > 0) {
        bordro.push({
          ...ortak,
          durum: "MUKELLEFE_GITTI",
          ozet: ornekBordroOzeti(faker, m.calisanSayisi),
        })
        for (const tur of ["ICMAL", "PUSULA"] as const)
          arsiv.push(belgeKaydi(m, donem, tur, guncelleyenId, simdi))
        return
      }
      const durum = faker.helpers.weightedArrayElement([
        { weight: 3, value: "BEKLENIYOR" as const },
        { weight: 3, value: "GIRDI_GELDI" as const },
        { weight: 3, value: "HAZIRLANDI" as const },
        { weight: 1, value: "MUKELLEFE_GITTI" as const },
      ])
      if (durum === "BEKLENIYOR") return // kayıt yok
      bordro.push({
        ...ortak,
        durum,
        ...(durum !== "GIRDI_GELDI" && {
          ozet: ornekBordroOzeti(faker, m.calisanSayisi),
        }),
      })
      if (durum !== "GIRDI_GELDI")
        arsiv.push(belgeKaydi(m, donem, "ICMAL", guncelleyenId, simdi))
    })
  }

  return { bordro, isHareketi: [], arsiv }
}
