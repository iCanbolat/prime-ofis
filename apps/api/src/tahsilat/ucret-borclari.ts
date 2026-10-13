import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { and, eq, isNotNull, like } from "drizzle-orm"

import { formatDonem } from "@prime/shared/lib/format"
import { toYmd } from "@prime/shared/lib/tarih"
import {
  ucretAnahtari,
  ucretBorcTarihi,
  ucretDonemleri,
  ucretHesapla,
} from "@prime/shared/tahsilat/kurallar"
import type { MukellefUcret } from "@prime/shared/types/domain"

import { newId } from "../core/id.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { cariHareket, mukellef } from "../db/schema/index.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"
import { CariYazici } from "./cari-yazici.js"

export const SISTEM_AKTOR = "sistem"
export const UCRET_BORCLARI_ISI = "ucret-borclari"

/**
 * Aylık ücret borçları (mock `ucretBorclariniUret`): ücreti tanımlı aktif mükellefler için
 * başlangıç döneminden bu aya kadar eksik ayları üretir. İdempotent (`UCRET:m:donem` unique).
 *
 * Her gün 00:05'te ve açılışta çalışır; ödeme, ücret değişikliği ve açılış bakiyesi gibi yazmalar
 * da önce bunu çağırır (dağıtım güncel borçlar üzerinden yapılsın). GET uçları yalnızca okur.
 */
@Injectable()
export class UcretBorclari implements OnModuleInit {
  private readonly logger = new Logger(UcretBorclari.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly cari: CariYazici,
    private readonly isler: IsKuyrugu,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.isler.tanimla(
      UCRET_BORCLARI_ISI,
      async () => {
        const n = await this.uret()
        if (n) this.logger.log(`${n} aylık ücret borcu üretildi`)
      },
      { cron: "5 0 * * *", acilista: true }
    )
  }

  /** Tüm mükellefler; üretilen borç sayısı */
  async uret(): Promise<number> {
    const adaylar = await this.txHost.tx
      .select({ id: mukellef.id, ucret: mukellef.ucret })
      .from(mukellef)
      .where(and(eq(mukellef.aktif, true), isNotNull(mukellef.ucret)))
    const mevcut = new Set(
      (
        await this.txHost.tx
          .select({ anahtar: cariHareket.otomatikAnahtar })
          .from(cariHareket)
          .where(like(cariHareket.otomatikAnahtar, "UCRET:%"))
      ).map((h) => h.anahtar)
    )
    const bugun = toYmd(this.saat.simdi())
    let toplam = 0
    for (const m of adaylar) {
      const eksik = ucretDonemleri(m.ucret!, bugun).filter(
        (d) => !mevcut.has(ucretAnahtari(m.id, d))
      )
      if (eksik.length) toplam += await this.yaz(m.id, m.ucret!, eksik)
    }
    return toplam
  }

  /** Tek mükellef (ödeme / ücret / açılış yazmalarından önce) */
  async mukellefIcin(mukellefId: string): Promise<number> {
    const [m] = await this.txHost.tx
      .select({ ucret: mukellef.ucret, aktif: mukellef.aktif })
      .from(mukellef)
      .where(eq(mukellef.id, mukellefId))
    if (!m?.aktif || !m.ucret) return 0
    const donemler = ucretDonemleri(m.ucret, toYmd(this.saat.simdi()))
    return donemler.length ? this.yaz(mukellefId, m.ucret, donemler) : 0
  }

  /** Mükellef başına kısa transaction: eşzamanlı çalışmada çift kayıt `ON CONFLICT` ile atlanır */
  @Transactional()
  private async yaz(mukellefId: string, ucret: MukellefUcret, donemler: string[]) {
    await this.cari.kilitle(mukellefId)
    const t = ucretHesapla(ucret.aylikBrut, ucret.kdvOrani, ucret.stopajVar)
    const simdi = this.saat.simdiIso()
    const eklenen = await this.txHost.tx
      .insert(cariHareket)
      .values(
        donemler.map((donem) => ({
          id: newId("ch"),
          mukellefId,
          tip: "BORC" as const,
          kalem: "AYLIK_UCRET" as const,
          donem,
          tarih: ucretBorcTarihi(donem),
          brut: t.brut,
          kdv: t.kdv,
          stopaj: t.stopaj,
          tutar: t.net,
          aciklama: `${formatDonem(donem)} hizmet bedeli`,
          otomatikAnahtar: ucretAnahtari(mukellefId, donem),
          olusturanId: SISTEM_AKTOR,
          olusturmaTarihi: simdi,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: cariHareket.id })
    if (eklenen.length) await this.cari.avansUygula(mukellefId)
    return eklenen.length
  }
}
