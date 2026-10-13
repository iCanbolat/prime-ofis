import type { Faker } from "@faker-js/faker"
import { addDays, subDays } from "date-fns"

import { ISTENEN_EVRAKLAR } from "@prime/shared/evrak-talebi/sabitler"
import type {
  EvrakTalebi,
  GelenEvrak,
  IstenenEvrak,
  Mukellef,
  TalepKanal,
  TalepKayitDurumu,
} from "@prime/shared/types/domain"

/** Seed referans anı (SEED_REF_DATE) */
const REFERANS = new Date("2026-09-01T09:00:00.000Z")

type Senaryo = { durum: TalepKayitDurumu; gun: number }

/** 10 talep: her durumdan en az biri. `gun`: son kullanmanın referansa göre günü. */
const SENARYOLAR: Senaryo[] = [
  { durum: "AKTIF", gun: 29 },
  { durum: "AKTIF", gun: 30 },
  { durum: "AKTIF", gun: 32 },
  { durum: "AKTIF", gun: 35 },
  { durum: "AKTIF", gun: -3 }, // süresi doldu
  { durum: "AKTIF", gun: -12 }, // süresi doldu
  { durum: "TAMAMLANDI", gun: 4 },
  { durum: "TAMAMLANDI", gun: -8 },
  { durum: "TAMAMLANDI", gun: 20 },
  { durum: "IPTAL", gun: 10 },
]

const AYLIK: IstenenEvrak[] = ["FIS_FATURA", "BANKA_EKSTRESI", "PUANTAJ"]
const TEK_SEFER: IstenenEvrak[] = [
  "KIRA_SOZLESMESI",
  "KIMLIK",
  "IMZA_SIRKULERI",
  "VERGI_LEVHASI",
  "FAALIYET_BELGESI",
]
const RED_NEDENLERI = [
  "Fotoğraf bulanık, okunmuyor",
  "Eksik sayfa var",
  "Yanlış döneme ait",
  "Belgenin süresi geçmiş",
]

function dosyaAdi(istenen: IstenenEvrak, i: number) {
  const kok = ISTENEN_EVRAKLAR[istenen].ad
    .split(" /")[0]!
    .replace(/\s+/g, "-")
    .toLocaleLowerCase("tr-TR")
  return i % 2 === 0 ? `IMG_${4200 + i}.jpg` : `${kok}-${i}.pdf`
}

export function createEvrakTalepleri(
  faker: Faker,
  mukellefler: Mukellef[],
  personelIds: string[]
): { talep: EvrakTalebi[]; gelen: GelenEvrak[] } {
  const talep: EvrakTalebi[] = []
  const gelen: GelenEvrak[] = []
  const adaylar = faker.helpers.shuffle(mukellefler.filter((m) => m.aktif))
  let gelenSira = 0

  SENARYOLAR.forEach((s, index) => {
    const m = adaylar[index % adaylar.length]!
    const aylik = faker.datatype.boolean(0.7)
    const istenenler = aylik
      ? faker.helpers.arrayElements(AYLIK, { min: 1, max: 3 })
      : faker.helpers.arrayElements(TEK_SEFER, { min: 1, max: 2 })
    const sonKullanma = addDays(REFERANS, s.gun)
    // Oluşturma en geç referans + 15 gün (geliştirme "bugün"ünden önce kalsın)
    const olusturma = new Date(
      Math.min(
        subDays(sonKullanma, 7).getTime(),
        addDays(REFERANS, 15 - index).getTime()
      )
    )
    const kanal = faker.helpers.arrayElement<TalepKanal>([
      "WHATSAPP",
      "WHATSAPP",
      "EPOSTA",
      "LINK",
    ])
    const olusturanId = faker.helpers.arrayElement(personelIds)
    const id = `e_${String(index + 1).padStart(3, "0")}`

    talep.push({
      id,
      mukellefId: m.id,
      token: faker.string.alphanumeric({ length: 43 }),
      kanal,
      istenenler,
      donem: aylik ? "2026-08" : undefined,
      durum: s.durum,
      sonKullanma: sonKullanma.toISOString(),
      olusturanId,
      olusturmaTarihi: olusturma.toISOString(),
      gonderimler:
        kanal === "LINK"
          ? []
          : [
              {
                kanal,
                zaman: olusturma.toISOString(),
                gonderenId: olusturanId,
              },
            ],
      musteriNotu:
        s.durum === "TAMAMLANDI" && faker.datatype.boolean(0.5)
          ? "Eksik kalan faturayı haftaya iletirim."
          : undefined,
      tamamlanmaTarihi:
        s.durum === "TAMAMLANDI"
          ? addDays(olusturma, 2).toISOString()
          : undefined,
    })

    // Yüklenen dosyalar: aktiflerde incelenmeyi bekleyenler, tamamlananlarda incelenmişler
    const adet =
      s.durum === "IPTAL"
        ? 0
        : s.durum === "TAMAMLANDI"
          ? faker.number.int({ min: 2, max: 4 })
          : faker.number.int({ min: 0, max: 3 })
    for (let i = 0; i < adet; i++) {
      const istenen = istenenler[i % istenenler.length]!
      const ad = dosyaAdi(istenen, ++gelenSira)
      const tamam = s.durum === "TAMAMLANDI"
      const red = tamam && faker.datatype.boolean(0.25)
      gelen.push({
        id: `g_${String(gelenSira).padStart(3, "0")}`,
        talepId: id,
        mukellefId: m.id,
        istenen,
        ad,
        mimeType: ad.endsWith(".jpg") ? "image/jpeg" : "application/pdf",
        boyut: faker.number.int({ min: 150_000, max: 2_400_000 }),
        yuklemeTarihi: addDays(olusturma, 1).toISOString(),
        durum: tamam ? (red ? "REDDEDILDI" : "ONAYLANDI") : "BEKLIYOR",
        redNedeni: red ? faker.helpers.arrayElement(RED_NEDENLERI) : undefined,
        inceleyenId: tamam ? olusturanId : undefined,
        incelemeTarihi: tamam ? addDays(olusturma, 3).toISOString() : undefined,
      })
    }
  })

  return { talep, gelen }
}
