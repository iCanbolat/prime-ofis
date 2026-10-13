import type { Faker } from "@faker-js/faker"

import { generateTckn, generateVkn } from "@prime/shared/lib/tax-id"
import type { Mukellef, MukellefTur } from "@prime/shared/types/domain"

const FAALIYETLER = [
  {
    nace: "47.11.02",
    faaliyet: "Bakkal ve market perakende ticareti",
    anahtar: "Gıda Pazarlama",
  },
  {
    nace: "56.10.01",
    faaliyet: "Lokanta ve restoran faaliyetleri",
    anahtar: "Restoran İşletmeciliği",
  },
  {
    nace: "62.01.01",
    faaliyet: "Bilgisayar programlama faaliyetleri",
    anahtar: "Yazılım",
  },
  {
    nace: "41.20.01",
    faaliyet: "İkamet amaçlı binaların inşaatı",
    anahtar: "İnşaat",
  },
  {
    nace: "46.90.04",
    faaliyet: "Belirli bir mala tahsis edilmemiş toptan ticaret",
    anahtar: "Dış Ticaret",
  },
  {
    nace: "49.41.02",
    faaliyet: "Karayolu ile yük taşımacılığı",
    anahtar: "Lojistik",
  },
  {
    nace: "14.13.01",
    faaliyet: "Dış giyim eşyası imalatı",
    anahtar: "Tekstil",
  },
  {
    nace: "45.20.01",
    faaliyet: "Motorlu kara taşıtlarının bakım ve onarımı",
    anahtar: "Otomotiv",
  },
  {
    nace: "73.11.01",
    faaliyet: "Reklam ajanslarının faaliyetleri",
    anahtar: "Reklamcılık",
  },
  {
    nace: "96.02.01",
    faaliyet: "Kuaför ve güzellik salonu faaliyetleri",
    anahtar: "Güzellik Hizmetleri",
  },
  {
    nace: "86.23.01",
    faaliyet: "Diş hekimliği faaliyetleri",
    anahtar: "Sağlık Hizmetleri",
  },
] as const

const KONUMLAR = [
  { il: "İstanbul", ilce: "Kadıköy", vergiDairesi: "Kadıköy" },
  { il: "İstanbul", ilce: "Ataşehir", vergiDairesi: "Kozyatağı" },
  { il: "İstanbul", ilce: "Şişli", vergiDairesi: "Mecidiyeköy" },
  { il: "İstanbul", ilce: "Beşiktaş", vergiDairesi: "Beşiktaş" },
  { il: "İstanbul", ilce: "Üsküdar", vergiDairesi: "Üsküdar" },
  { il: "İstanbul", ilce: "Sarıyer", vergiDairesi: "Maslak" },
  { il: "Ankara", ilce: "Çankaya", vergiDairesi: "Çankaya" },
  { il: "İzmir", ilce: "Bornova", vergiDairesi: "Bornova" },
] as const

const ETIKETLER = ["Öncelikli", "Yeni Müşteri", "İhracatçı", "Kira Geliri"]

const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
}

export function slugify(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => TR_MAP[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "")
}

interface CreateMukellefOptions {
  id: string
  tur: MukellefTur
  personelIds: string[]
}

export function createMukellef(
  faker: Faker,
  { id, tur, personelIds }: CreateMukellefOptions,
  overrides: Partial<Mukellef> = {}
): Mukellef {
  const random = () => faker.number.float({ min: 0, max: 0.9999 })
  const faaliyet = faker.helpers.arrayElement(FAALIYETLER)
  const konum = faker.helpers.arrayElement(KONUMLAR)
  const ad = faker.person.firstName()
  const soyad = faker.person.lastName()
  const isSahis = tur === "SAHIS"

  const unvan = isSahis
    ? `${ad} ${soyad}`
    : tur === "LTD"
      ? `${soyad} ${faaliyet.anahtar} San. ve Tic. Ltd. Şti.`
      : `${soyad} ${faaliyet.anahtar} A.Ş.`

  const calisanSayisi = isSahis
    ? (faker.helpers.maybe(() => faker.number.int({ min: 1, max: 5 }), {
        probability: 0.5,
      }) ?? 0)
    : tur === "LTD"
      ? faker.number.int({ min: 0, max: 25 })
      : faker.number.int({ min: 5, max: 120 })

  const defterTuru =
    isSahis && faker.datatype.boolean({ probability: 0.75 })
      ? "ISLETME"
      : "BILANCO"
  const kdvMukellefi = isSahis
    ? faker.datatype.boolean({ probability: 0.85 })
    : true

  return {
    id,
    tur,
    unvan,
    vkn: isSahis ? undefined : generateVkn(random),
    tckn: isSahis ? generateTckn(random) : undefined,
    vergiDairesi: konum.vergiDairesi,
    naceKodu: faaliyet.nace,
    faaliyet: faaliyet.faaliyet,
    telefon: `053${faker.string.numeric(8)}`,
    eposta: isSahis
      ? `${slugify(ad)}.${slugify(soyad)}@gmail.com`
      : `info@${slugify(soyad)}${slugify(faaliyet.anahtar).slice(0, 8)}.com.tr`,
    il: konum.il,
    ilce: konum.ilce,
    adres: `${faker.location.street()} No:${faker.number.int({ min: 1, max: 120 })} ${konum.ilce} / ${konum.il}`,
    sorumluPersonelId: faker.helpers.arrayElement(personelIds),
    kdvMukellefi,
    kdvPeriyodu:
      isSahis &&
      defterTuru === "ISLETME" &&
      faker.datatype.boolean({ probability: 0.25 })
        ? "UC_AYLIK"
        : "AYLIK",
    defterTuru,
    sgkIsyeriVar: calisanSayisi > 0,
    calisanSayisi,
    eDefterMukellefi:
      tur === "AS" ||
      (tur === "LTD" && faker.datatype.boolean({ probability: 0.6 })),
    aktif: faker.datatype.boolean({ probability: 0.95 }),
    etiketler: faker.helpers.arrayElements(ETIKETLER, { min: 0, max: 2 }),
    olusturmaTarihi: faker.date.past({ years: 5 }).toISOString(),
    ...overrides,
  }
}
