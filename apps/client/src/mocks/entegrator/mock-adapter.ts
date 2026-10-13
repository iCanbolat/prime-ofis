/**
 * `EntegratorAdapter`'ın geliştirme / test uygulaması. Gerçek Luca'yı taklit eder:
 * - Anahtar doğrulama: en az 16 karakter; "hatali" içeren anahtar reddedilir (demo/test için).
 * - Artımlı senkron: her çağrıda mükellefe 0–2 (ortalama 0,75) yeni gelen e-Fatura "düşer" (adet mevcut fatura
 *   sayısından deterministik), işlenmekte olan giden faturalar GİB'den başarılı döner.
 * - Berat: yüklenmiş (berat bekleyen) defterlerin beratı onaylanır.
 * Mevcut durum mock DB'den okunur; yazma işini handler yapar (backend'in senkron servisi gibi).
 */
import type {
  EntegratorAdapter,
  EntegratorFatura,
} from "@prime/shared/e-belge/entegrator-adapter"
import { db } from "@/mocks/db"
import {
  mockBaglantiDogrula,
  mockFaturaKalemleri,
  mockFaturaXml,
  mockGelenFaturalar,
} from "@prime/mock-data/entegrator"
import { placeholderIcerik } from "@prime/mock-data/placeholder"

const bekle = () => Promise.resolve()

export const mockEntegratorAdapter: EntegratorAdapter = {
  async baglantiDogrula({ apiAnahtari, mukellefId }) {
    await bekle()
    return mockBaglantiDogrula(
      apiAnahtari,
      mukellefId,
      db.mukellef.find(mukellefId)
    )
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
    return mockGelenFaturalar(mukellefId, mevcut.length, simdi)
  },

  async faturaKalemleri(_kimlik, ettn) {
    await bekle()
    const fatura = db.ebelge.where((e) => e.ettn === ettn)[0]
    return fatura ? mockFaturaKalemleri(fatura) : []
  },

  async faturaIcerik(_kimlik, ettn, format) {
    await bekle()
    const fatura = db.ebelge.where((e) => e.ettn === ettn)[0]
    const ad = `${fatura?.belgeNo ?? ettn}`
    if (format === "XML") return mockFaturaXml(ad, ettn)
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
