import type { Faker } from "@faker-js/faker"
import { addDays, subDays } from "date-fns"

import {
  GECERLILIK_GEREKEN,
  ZORUNLU_KATEGORILER,
} from "@prime/shared/arsiv/kurallar"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type { ArsivDosya, ArsivKategori, Mukellef } from "@prime/shared/types/domain"

/** Seed referans günü (SEED_REF_DATE ile aynı gün) */
const REFERANS = "2026-09-01"

const DOSYA_ADLARI: Record<ArsivKategori, string[]> = {
  IMZA_SIRKULERI: ["İmza sirküleri.pdf", "Noter imza sirküleri.pdf"],
  TICARET_SICIL_GAZETESI: [
    "Kuruluş gazetesi.pdf",
    "Ticaret sicil gazetesi.pdf",
  ],
  VERGI_LEVHASI: ["Vergi levhası.pdf", "Vergi levhası 2026.pdf"],
  KIRA_SOZLESMESI: ["Kira sözleşmesi.pdf", "İşyeri kira kontratı.pdf"],
  FAALIYET_BELGESI: ["Faaliyet belgesi.pdf", "Oda faaliyet belgesi.pdf"],
  KIMLIK: ["Kimlik ön yüz.jpg", "Kimlik fotokopisi.png"],
  FATURA: ["Fatura.pdf"],
  BANKA_EKSTRESI: ["Banka ekstresi.pdf"],
  TAHAKKUK: ["Tahakkuk fişi.pdf"],
  MIZAN: ["Mizan.xlsx"],
  TEBLIGAT: ["e-Tebligat.pdf"],
  BORDRO: ["Bordro.pdf"],
  SGK_BELGESI: ["SGK işe giriş bildirgesi.pdf"],
  BORCU_YOKTUR: ["Borcu yoktur yazısı.pdf"],
  DIGER: [
    "Banka yazısı.pdf",
    "Ruhsat.pdf",
    "Vekaletname.pdf",
    "Adres beyanı.png",
  ],
}

/** Opsiyonel kategoriler ve bulunma olasılıkları */
const OPSIYONEL: [ArsivKategori, number][] = [
  ["FAALIYET_BELGESI", 0.5],
  ["KIRA_SOZLESMESI", 0.4],
  ["DIGER", 0.35],
]

function mimeTuru(ad: string) {
  if (ad.endsWith(".png")) return "image/png"
  if (ad.endsWith(".jpg")) return "image/jpeg"
  return "application/pdf"
}

/**
 * Her mükellefte birkaç arşiv dosyası (yalnızca meta veri; içerik istek anında placeholder
 * olarak üretilir). Zorunlu kategorilerin bir kısmı bilerek eksik bırakılır; süreli belgelerin
 * bir kısmının süresi dolmuş veya dolmak üzeredir; birkaç dosya çöp kutusundadır.
 */
export function createArsivDosyalari(
  faker: Faker,
  mukellefler: Mukellef[],
  personelIds: string[]
): ArsivDosya[] {
  const dosyalar: ArsivDosya[] = []
  const referans = fromYmd(REFERANS)
  let sira = 0

  for (const m of mukellefler) {
    const kategoriler = [
      ...ZORUNLU_KATEGORILER[m.tur].filter(() => faker.datatype.boolean(0.85)),
      ...OPSIYONEL.filter(([, p]) => faker.datatype.boolean(p)).map(([k]) => k),
    ]

    for (const kategori of kategoriler) {
      const ad = faker.helpers.arrayElement(DOSYA_ADLARI[kategori])
      let gecerlilikTarihi: string | undefined
      if (GECERLILIK_GEREKEN.includes(kategori)) {
        const r = faker.number.float({ min: 0, max: 1 })
        const gun =
          r < 0.12
            ? -faker.number.int({ min: 1, max: 60 })
            : r < 0.3
              ? faker.number.int({ min: 10, max: 55 })
              : faker.number.int({ min: 90, max: 720 })
        gecerlilikTarihi = toYmd(addDays(referans, gun))
      }
      const yukleme = subDays(referans, faker.number.int({ min: 1, max: 700 }))
      const silindi = faker.datatype.boolean(0.03)

      dosyalar.push({
        id: `d_${String(++sira).padStart(3, "0")}`,
        mukellefId: m.id,
        kategori,
        ad,
        mimeType: mimeTuru(ad),
        boyut: faker.number.int({ min: 60_000, max: 3_500_000 }),
        yukleyenId: faker.helpers.arrayElement(personelIds),
        yuklemeTarihi: yukleme.toISOString(),
        gecerlilikTarihi,
        silindi,
        silinmeTarihi: silindi
          ? subDays(
              referans,
              faker.number.int({ min: 0, max: 20 })
            ).toISOString()
          : undefined,
      })
    }
  }

  return dosyalar
}
