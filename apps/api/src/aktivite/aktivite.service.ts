import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { Injectable } from "@nestjs/common"
import { and, desc, eq, inArray, type SQL } from "drizzle-orm"

import type { BildirimSecenekleri } from "@prime/shared/bildirim/kurallar"
import type { AktiviteKaydi } from "@prime/shared/types/api"
import type { AktiviteLog } from "@prime/shared/types/domain"

import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { aktivite, personel } from "../db/schema/index.js"
import { aktorOzeti, BildirimService } from "../bildirim/bildirim.service.js"

export type AktiviteGirdisi = Omit<AktiviteLog, "id" | "zaman">

export interface AktiviteFiltresi {
  mukellefId?: string
  hedefId?: string
  eylemler?: string[]
  limit?: number
}

const LISTE_VARSAYILAN = 20
const LISTE_EN_FAZLA = 100

@Injectable()
export class AktiviteService {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly saat: Saat,
    private readonly bildirimler: BildirimService
  ) {}

  /**
   * Aktiviteye yazar ve kurallara göre bildirim üretir (mock `logActivity`).
   * `bildirim` ile alıcılar / tür kural dışında belirlenebilir; `false` bildirimi kapatır.
   * Çağıranın transaction'ına katılır.
   */
  @Transactional()
  async log(
    girdi: AktiviteGirdisi,
    bildirim: BildirimSecenekleri | false = {}
  ): Promise<AktiviteLog> {
    const log: AktiviteLog = { ...girdi, id: newId("a"), zaman: this.saat.simdiIso() }
    await this.txHost.tx.insert(aktivite).values(log)
    if (bildirim !== false) await this.bildirimler.uret(log, bildirim)
    return log
  }

  async liste({ mukellefId, hedefId, eylemler, limit }: AktiviteFiltresi) {
    const kosullar: SQL[] = []
    if (mukellefId) kosullar.push(eq(aktivite.mukellefId, mukellefId))
    if (hedefId) kosullar.push(eq(aktivite.hedefId, hedefId))
    if (eylemler?.length) {
      kosullar.push(inArray(aktivite.eylem, eylemler as AktiviteLog["eylem"][]))
    }
    const satirlar = await this.txHost.tx
      .select({ aktivite, aktor: aktorOzeti })
      .from(aktivite)
      .leftJoin(personel, eq(personel.id, aktivite.aktorId))
      .where(and(...kosullar))
      .orderBy(desc(aktivite.zaman), desc(aktivite.id))
      .limit(Math.min(limit || LISTE_VARSAYILAN, LISTE_EN_FAZLA))

    return satirlar.map(
      ({ aktivite: a, aktor }): AktiviteKaydi => ({
        ...(nullsuz(a) as AktiviteLog),
        aktor: aktor?.id ? aktor : null,
      })
    )
  }
}
