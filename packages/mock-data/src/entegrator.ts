/**
 * Mock Luca entegratörünün deterministik üretimi — client MSW adaptörü ve api'nin
 * `MockEntegrator`'ı aynı sonuçları versin diye ortak. Mevcut durumu çağıran okur.
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import type {
  BaglantiDogrulamaSonucu,
  EntegratorFatura,
} from "@prime/shared/e-belge/entegrator-adapter"
import { toYmd } from "@prime/shared/lib/tarih"
import type { EBelgeKalem } from "@prime/shared/types/api"
import type { EBelge, Mukellef } from "@prime/shared/types/domain"

import { belgeNo, faturaUret } from "./factories/e-belge"
import { karma } from "./karma"

function tohumluFaker(tohum: string) {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(karma(tohum))
  return faker
}

const HIZMETLER: [string, string][] = [
  ["Yazılım lisans bedeli", "Adet"],
  ["Danışmanlık hizmeti", "Saat"],
  ["Kırtasiye malzemesi", "Adet"],
  ["Nakliye bedeli", "Sefer"],
  ["Bakım onarım hizmeti", "Adet"],
  ["Hammadde", "Kg"],
  ["Kira bedeli", "Ay"],
  ["Reklam hizmeti", "Adet"],
]

/** Anahtar doğrulama: en az 16 karakter; "hatali" içeren anahtar reddedilir */
export function mockBaglantiDogrula(
  apiAnahtari: string,
  mukellefId: string,
  m: Pick<Mukellef, "eposta" | "tur" | "eDefterMukellefi"> | undefined
): BaglantiDogrulamaSonucu {
  if (apiAnahtari.length < 16 || /hatali/i.test(apiAnahtari))
    return {
      gecerli: false,
      hataMesaji: "Luca web servis anahtarı doğrulanamadı (401)",
      eFatura: false,
      eArsiv: false,
      eDefter: false,
    }
  const alan = m?.eposta.split("@")[1] ?? "firma.com.tr"
  const eFatura = m?.tur !== "SAHIS" || karma(mukellefId) % 2 === 0
  return {
    gecerli: true,
    eFatura,
    eArsiv: true,
    eDefter: Boolean(m?.eDefterMukellefi),
    postaKutusu: eFatura ? `urn:mail:defaultpk@${alan}` : undefined,
  }
}

/**
 * Artımlı senkronda "posta kutusuna düşen" gelen e-Faturalar: mükellefin mevcut fatura
 * sayısından deterministik olarak 0–2 adet.
 */
export function mockGelenFaturalar(
  mukellefId: string,
  mevcutAdet: number,
  simdi: Date
): EntegratorFatura[] {
  const faker = tohumluFaker(`${mukellefId}:${mevcutAdet}`)
  const adet = [0, 0, 1, 2][karma(`${mukellefId}:${mevcutAdet}`) % 4]!
  return Array.from({ length: adet }, (_, i) => {
    const f = faturaUret(faker, {
      tur: "E_FATURA",
      yon: "GELEN",
      senaryo: i % 2 === 0 ? "TICARI" : "TEMEL",
      duzenlemeTarihi: toYmd(simdi),
      alinmaTarihi: simdi.toISOString(),
      belgeNo: belgeNo(
        faker.string.alpha({ length: 3, casing: "upper" }),
        String(simdi.getFullYear()),
        faker.number.int({ min: 1, max: 9_000 })
      ),
    })
    return { ...f, yanit: f.senaryo === "TICARI" ? "BEKLIYOR" : undefined }
  })
}

/** Fatura kalemleri: ETTN'den deterministik; matrah kalemlere bölünür */
export function mockFaturaKalemleri(
  fatura: Pick<EBelge, "ettn" | "faturaTipi" | "matrah" | "kdv">
): EBelgeKalem[] {
  const faker = tohumluFaker(fatura.ettn)
  const adet = faker.number.int({ min: 1, max: 4 })
  const kdvOrani =
    fatura.faturaTipi === "ISTISNA"
      ? 0
      : fatura.faturaTipi === "TEVKIFAT"
        ? 20
        : ([1, 10, 20].find((o) => Math.abs((fatura.matrah * o) / 100 - fatura.kdv) < 1) ?? 20)

  // Son kalem kuruş farkını üstlenir
  let kalan = fatura.matrah
  return Array.from({ length: adet }, (_, i): EBelgeKalem => {
    const [ad, birim] = faker.helpers.arrayElement(HIZMETLER)
    const son = i === adet - 1
    const tutar = son
      ? Math.round(kalan * 100) / 100
      : Math.round(fatura.matrah * faker.number.float({ min: 0.1, max: 0.4 }) * 100) / 100
    kalan -= tutar
    const miktar = faker.number.int({ min: 1, max: 12 })
    return {
      sira: i + 1,
      ad,
      miktar,
      birim,
      birimFiyat: Math.round((tutar / miktar) * 100) / 100,
      kdvOrani,
      tutar,
    }
  })
}

/** Minimal UBL XML (data URL) */
export function mockFaturaXml(ad: string, ettn: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>${ad}</ID><UUID>${ettn}</UUID></Invoice>`
  return `data:application/xml;base64,${btoa(xml)}`
}
