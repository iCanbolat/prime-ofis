import { TransactionHost } from "@nestjs-cls/transactional"
import { NotImplementedException } from "@nestjs/common"
import { and, eq, like } from "drizzle-orm"

import type {
  BaglantiDogrulamaSonucu,
  EntegratorAdapter,
  EntegratorBerat,
  EntegratorFatura,
  EntegratorKimlik,
  FaturaSorgusu,
} from "@prime/shared/e-belge/entegrator-adapter"
import type { EBelgeKalem } from "@prime/shared/types/api"
import {
  mockBaglantiDogrula,
  mockFaturaKalemleri,
  mockFaturaXml,
  mockGelenFaturalar,
} from "@prime/mock-data/entegrator"
import { placeholderIcerik } from "@prime/mock-data/placeholder"

import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { ebelge, edefterBerat, mukellef } from "../db/schema/index.js"

/**
 * e-Belge entegratörü (`EntegratorAdapter`). `ENTEGRATOR=mock` geliştirme ve testte
 * deterministik taklit; `luca` TÜRMOB-Luca web servis dokümanı gelene kadar iskelet (Faz 12).
 */
export abstract class Entegrator implements EntegratorAdapter {
  abstract baglantiDogrula(kimlik: EntegratorKimlik): Promise<BaglantiDogrulamaSonucu>
  abstract faturalariGetir(kimlik: EntegratorKimlik, sorgu: FaturaSorgusu): Promise<EntegratorFatura[]>
  abstract faturaKalemleri(kimlik: EntegratorKimlik, ettn: string): Promise<EBelgeKalem[]>
  abstract faturaIcerik(kimlik: EntegratorKimlik, ettn: string, format: "PDF" | "XML"): Promise<string>
  abstract ticariYanitGonder(
    kimlik: EntegratorKimlik,
    ettn: string,
    karar: "KABUL" | "RED",
    neden?: string
  ): Promise<void>
  abstract beratDurumlari(kimlik: EntegratorKimlik, yil: string): Promise<EntegratorBerat[]>
}

/**
 * Mock Luca (client `mocks/entegrator/mock-adapter.ts` ile aynı davranış): mevcut durumu
 * veritabanından okur, yazma işini senkron servisi yapar.
 */
export class MockEntegrator extends Entegrator {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly saat: Saat
  ) {
    super()
  }

  async baglantiDogrula({ apiAnahtari, mukellefId }: EntegratorKimlik) {
    const [m] = await this.txHost.tx.select().from(mukellef).where(eq(mukellef.id, mukellefId))
    return mockBaglantiDogrula(apiAnahtari, mukellefId, m)
  }

  async faturalariGetir({ mukellefId }: EntegratorKimlik, { tur, yon }: FaturaSorgusu) {
    const mevcut = await this.txHost.tx
      .select()
      .from(ebelge)
      .where(eq(ebelge.mukellefId, mukellefId))
    if (yon === "GIDEN") {
      // GİB'de işlenen giden faturalar tamamlanır
      return mevcut
        .filter((e) => e.yon === "GIDEN" && e.tur === tur && e.gibDurumu === "ISLENIYOR")
        .map((e): EntegratorFatura => {
          const { id: _id, mukellefId: _m, yanit: _y, ...f } = nullsuz(e)
          return { ...f, gibDurumu: "BASARILI" } as EntegratorFatura
        })
    }
    if (tur !== "E_FATURA") return []
    return mockGelenFaturalar(mukellefId, mevcut.length, this.saat.simdi())
  }

  async faturaKalemleri(_k: EntegratorKimlik, ettn: string) {
    const [f] = await this.txHost.tx.select().from(ebelge).where(eq(ebelge.ettn, ettn))
    return f ? mockFaturaKalemleri(f) : []
  }

  async faturaIcerik(_k: EntegratorKimlik, ettn: string, format: "PDF" | "XML") {
    const [f] = await this.txHost.tx.select().from(ebelge).where(eq(ebelge.ettn, ettn))
    const ad = f?.belgeNo ?? ettn
    if (format === "XML") return mockFaturaXml(ad, ettn)
    return placeholderIcerik({ ad: `${ad}.pdf`, mimeType: "application/pdf" })
  }

  async ticariYanitGonder() {}

  async beratDurumlari({ mukellefId }: EntegratorKimlik, yil: string) {
    const simdi = this.saat.simdiIso()
    const satirlar = await this.txHost.tx
      .select()
      .from(edefterBerat)
      .where(and(eq(edefterBerat.mukellefId, mukellefId), like(edefterBerat.donem, `${yil}-%`)))
    return satirlar.map((b): EntegratorBerat => {
      const { mukellefId: _m, ...berat } = nullsuz(b)
      return berat.durum === "YUKLENDI"
        ? { ...berat, durum: "ONAYLANDI", onayTarihi: simdi }
        : berat
    })
  }
}

const LUCA_YOK = "Luca e-Entegratör bağlantısı henüz hazır değil (web servis dokümanı bekleniyor)"

/** TÜRMOB-Luca e-Entegratör iskeleti; doküman gelince DTO eşlemesi yapılır */
export class LucaEntegrator extends Entegrator {
  private yok(): never {
    throw new NotImplementedException({ message: LUCA_YOK })
  }
  async baglantiDogrula(): Promise<BaglantiDogrulamaSonucu> {
    return this.yok()
  }
  async faturalariGetir(): Promise<EntegratorFatura[]> {
    return this.yok()
  }
  async faturaKalemleri(): Promise<EBelgeKalem[]> {
    return this.yok()
  }
  async faturaIcerik(): Promise<string> {
    return this.yok()
  }
  async ticariYanitGonder(): Promise<void> {
    return this.yok()
  }
  async beratDurumlari(): Promise<EntegratorBerat[]> {
    return this.yok()
  }
}
