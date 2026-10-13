/**
 * `EntegratorAdapter`'ın geliştirme / test uygulaması. Gerçek Luca'yı taklit eder:
 * - Anahtar doğrulama: en az 16 karakter; "hatali" içeren anahtar reddedilir (demo/test için).
 * - Artımlı senkron: her çağrıda mükellefe 0–2 (ortalama 0,75) yeni gelen e-Fatura "düşer" (adet mevcut fatura
 *   sayısından deterministik), işlenmekte olan giden faturalar GİB'den başarılı döner.
 * - Berat: yüklenmiş (berat bekleyen) defterlerin beratı onaylanır.
 * Mevcut durum mock DB'den okunur; yazma işini handler yapar (backend'in senkron servisi gibi).
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import type {
  EntegratorAdapter,
  EntegratorFatura,
  EntegratorKimlik,
} from "@prime/shared/e-belge/entegrator-adapter"
import { toYmd } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import { belgeNo, faturaUret } from "@prime/mock-data/factories/e-belge"
import { karma } from "@prime/mock-data/karma"
import { placeholderIcerik } from "@prime/mock-data/placeholder"
import type { EBelgeKalem } from "@prime/shared/types/api"

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

const bekle = () => Promise.resolve()

export const mockEntegratorAdapter: EntegratorAdapter = {
  async baglantiDogrula({ apiAnahtari, mukellefId }) {
    await bekle()
    if (apiAnahtari.length < 16 || /hatali/i.test(apiAnahtari))
      return {
        gecerli: false,
        hataMesaji: "Luca web servis anahtarı doğrulanamadı (401)",
        eFatura: false,
        eArsiv: false,
        eDefter: false,
      }
    const m = db.mukellef.find(mukellefId)
    const alan = m?.eposta.split("@")[1] ?? "firma.com.tr"
    const eFatura = m?.tur !== "SAHIS" || karma(mukellefId) % 2 === 0
    return {
      gecerli: true,
      eFatura,
      eArsiv: true,
      eDefter: Boolean(m?.eDefterMukellefi),
      postaKutusu: eFatura ? `urn:mail:defaultpk@${alan}` : undefined,
    }
  },

  async faturalariGetir({ mukellefId }, { tur, yon }) {
    await bekle()
    const mevcut = db.ebelge.where((e) => e.mukellefId === mukellefId)
    const simdi = new Date()

    if (yon === "GIDEN") {
      // Durumu değişenler: GİB'de işlenen giden faturalar tamamlanır
      return mevcut
        .filter(
          (e) =>
            e.yon === "GIDEN" && e.tur === tur && e.gibDurumu === "ISLENIYOR"
        )
        .map((e): EntegratorFatura => ({
          ...e,
          yanit: undefined,
          gibDurumu: "BASARILI",
        }))
    }

    if (tur !== "E_FATURA") return []
    const faker = tohumluFaker(`${mukellefId}:${mevcut.length}`)
    const adet = [0, 0, 1, 2][karma(`${mukellefId}:${mevcut.length}`) % 4]!
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
  },

  async faturaKalemleri(_kimlik: EntegratorKimlik, ettn: string) {
    await bekle()
    const fatura = db.ebelge.where((e) => e.ettn === ettn)[0]
    if (!fatura) return []
    const faker = tohumluFaker(ettn)
    const adet = faker.number.int({ min: 1, max: 4 })
    const kdvOrani =
      fatura.faturaTipi === "ISTISNA"
        ? 0
        : fatura.faturaTipi === "TEVKIFAT"
          ? 20
          : ([1, 10, 20].find(
              (o) => Math.abs((fatura.matrah * o) / 100 - fatura.kdv) < 1
            ) ?? 20)

    // Matrah kalemlere bölünür; son kalem kuruş farkını üstlenir
    let kalan = fatura.matrah
    return Array.from({ length: adet }, (_, i): EBelgeKalem => {
      const [ad, birim] = faker.helpers.arrayElement(HIZMETLER)
      const son = i === adet - 1
      const tutar = son
        ? Math.round(kalan * 100) / 100
        : Math.round(
            fatura.matrah * faker.number.float({ min: 0.1, max: 0.4 }) * 100
          ) / 100
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
  },

  async faturaIcerik(_kimlik, ettn, format) {
    await bekle()
    const fatura = db.ebelge.where((e) => e.ettn === ettn)[0]
    const ad = `${fatura?.belgeNo ?? ettn}`
    if (format === "XML") {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>${ad}</ID><UUID>${ettn}</UUID></Invoice>`
      return `data:application/xml;base64,${btoa(xml)}`
    }
    return placeholderIcerik({ ad: `${ad}.pdf`, mimeType: "application/pdf" })
  },

  async ticariYanitGonder() {
    await bekle()
  },

  async beratDurumlari({ mukellefId }, yil) {
    await bekle()
    const simdi = new Date().toISOString()
    return db.berat
      .where((b) => b.mukellefId === mukellefId && b.donem.startsWith(yil))
      .map((b) =>
        b.durum === "YUKLENDI"
          ? { ...b, durum: "ONAYLANDI" as const, onayTarihi: simdi }
          : b
      )
  },
}
