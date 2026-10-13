import { Faker, base, en, tr } from "@faker-js/faker"

import { createBordroVerisi } from "./factories/bordro"
import { createBorcVerisi } from "./factories/borc"
import { createArsivDosyalari } from "./factories/arsiv"
import { createEBelgeVerisi } from "./factories/e-belge"
import { createEvrakTalepleri } from "./factories/evrak-talebi"
import { createGorevler } from "./factories/gorev"
import { createKanalVerisi } from "./factories/kanal"
import { createMukellef } from "./factories/mukellef"
import { createTahsilatVerisi } from "./factories/tahsilat"
import { createTakvimDurumlari } from "./factories/takvim"
import { createTebligatVerisi } from "./factories/tebligat"
import { createFisAktarimiVerisi } from "./factories/fis-aktarimi"
import {
  createBuro,
  createKimlikList,
  createPersonelList,
} from "./factories/personel"
import type { DbState } from "./state"
import type { MukellefTur } from "@prime/shared/types/domain"

export const DEFAULT_SEED = 42
/** Göreli tarihler (olusturmaTarihi vb.) bu tarihe göre üretilir → seed tamamen deterministik. */
export const SEED_REF_DATE = "2026-09-01T09:00:00.000Z"

/** ~%40 Şahıs, %45 Ltd, %15 A.Ş. */
const MUKELLEF_DAGILIMI: Record<MukellefTur, number> = {
  SAHIS: 16,
  LTD: 18,
  AS: 6,
}

export function createSeed(seed: number = DEFAULT_SEED): DbState {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(seed)
  faker.setDefaultRefDate(SEED_REF_DATE)

  const buro = createBuro()
  const personel = createPersonelList()
  const personelIds = personel.map((p) => p.id)

  const turler = faker.helpers.shuffle(
    (Object.entries(MUKELLEF_DAGILIMI) as [MukellefTur, number][]).flatMap(
      ([tur, adet]) => Array<MukellefTur>(adet).fill(tur)
    )
  )

  const mukellef = turler.map((tur, index) =>
    createMukellef(faker, {
      id: `m_${String(index + 1).padStart(3, "0")}`,
      tur,
      personelIds,
    })
  )

  const takvim = createTakvimDurumlari(faker, mukellef)
  const arsiv = createArsivDosyalari(faker, mukellef, personelIds)
  const talepler = createEvrakTalepleri(faker, mukellef, personelIds)

  // Faker sırası korunur: görevler, ardından e-Belge verisi en son üretilir
  const gorev = createGorevler(faker, mukellef, takvim, personelIds)
  const eBelge = createEBelgeVerisi(faker, mukellef, takvim)
  // Mükelleflere ücret de burada atanır (faker sırası: e-Belge'den sonra)
  const tahsilat = createTahsilatVerisi(faker, mukellef)
  const tebligat = createTebligatVerisi(faker, mukellef, personelIds)
  const kanal = createKanalVerisi(faker, personel, mukellef)
  // Bordro verisi faker'ı en son kullanır (önceki üretimler kaymasın)
  const { arsiv: bordroArsivi, ...bordro } = createBordroVerisi(
    faker,
    mukellef,
    personelIds
  )
  // Ayrı tohumlu faker kullanır (ortak faker sırası kaymaz)
  const { arsiv: borcArsivi, ...borc } = createBorcVerisi(
    mukellef,
    tebligat.tebligatErisim,
    personelIds
  )
  // Faker kullanmaz; okuyucu gelen id'sinden kendi tohumunu üretir
  const fisAktarimi = createFisAktarimiVerisi(
    mukellef,
    talepler.talep,
    talepler.gelen,
    eBelge.ebelge,
    personelIds[0]!
  )

  return {
    buro: [buro],
    personel,
    kimlik: createKimlikList(),
    mukellef,
    aktivite: [],
    credential: [],
    kasa: [],
    takvim,
    arsiv: [...arsiv, ...bordroArsivi, ...borcArsivi],
    talep: fisAktarimi.talep,
    gelen: fisAktarimi.gelen,
    gorev,
    ...eBelge,
    tahakkuk: [],
    mizan: [],
    // Bildirimler aktiviteden ve ilk istekte hatırlatma kurallarından üretilir
    bildirim: [],
    ...tahsilat,
    ...tebligat,
    ...kanal,
    ...bordro,
    okuma: fisAktarimi.okuma,
    fis: fisAktarimi.fis,
    fisHesapAyari: [],
    lucaAktarim: [],
    ...borc,
  }
}
