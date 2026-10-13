import { TransactionHost } from "@nestjs-cls/transactional"
import { Injectable } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"

import { acikBorclar, dagitilmamis, fifoKapat } from "@prime/shared/tahsilat/kurallar"
import type { CariHareket } from "@prime/shared/types/domain"

import { nullsuz } from "../core/nullsuz.js"
import type { DrizzleTx } from "../db/db.module.js"
import { cariHareket } from "../db/schema/index.js"

export const cariSatirindan = (h: typeof cariHareket.$inferSelect): CariHareket => nullsuz(h)

/**
 * Bir mükellefin cari hareketlerini yazan işlemlerin ortak parçaları. Her yazma (hareket ekleme /
 * silme, ücret borcu üretimi, açılış bakiyesi) önce `kilitle` ile mükellef başına transaction
 * kilidi alır: avans dağıtımı ve FIFO kapatma hareketlerin tamamını okuyup yazdığı için eşzamanlı
 * iki ödeme aynı borcu iki kez kapatamaz.
 */
@Injectable()
export class CariYazici {
  constructor(private readonly txHost: TransactionHost<DrizzleTx>) {}

  /** Transaction sonuna kadar tutulan mükellef kilidi; açık bir transaction içinde çağrılmalı */
  async kilitle(mukellefId: string) {
    await this.txHost.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`cari:${mukellefId}`}))`
    )
  }

  async hareketler(mukellefId: string): Promise<CariHareket[]> {
    const satirlar = await this.txHost.tx
      .select()
      .from(cariHareket)
      .where(eq(cariHareket.mukellefId, mukellefId))
    return satirlar.map(cariSatirindan)
  }

  /**
   * Ödemelerin dağıtılmamış kısmını (avans) en eski açık borçlara uygular (mock `avansUygula`).
   * Yeni borç eklendiğinde veya bir borç silinip kapatmaları çözüldüğünde, kilit altında çağrılır.
   */
  async avansUygula(mukellefId: string) {
    const hareketler = await this.hareketler(mukellefId)
    const odemeler = hareketler
      .filter((h) => h.tip === "ODEME" && dagitilmamis(h) > 0.005)
      .sort((a, b) => a.tarih.localeCompare(b.tarih))
    for (const o of odemeler) {
      const acik = acikBorclar(hareketler)
      if (acik.length === 0) return
      const yeni = fifoKapat(dagitilmamis(o), acik)
      if (!yeni.length) continue
      o.kapatmalar = [...(o.kapatmalar ?? []), ...yeni]
      await this.txHost.tx
        .update(cariHareket)
        .set({ kapatmalar: o.kapatmalar })
        .where(eq(cariHareket.id, o.id))
    }
  }
}
