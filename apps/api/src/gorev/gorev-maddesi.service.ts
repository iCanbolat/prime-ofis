import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { Injectable } from "@nestjs/common"
import { eq } from "drizzle-orm"

import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { gorev } from "../db/schema/index.js"

/**
 * Otomatik görevlerin kontrol listesini başka modüllerden işaretleyen tek servis (mock
 * `gorevMaddesiniTamamla`): tahakkuk yüklenince "Tahakkuk gönderildi", puantaj gelince
 * "Puantaj ve bordro alındı" …
 */
@Injectable()
export class GorevMaddesiService {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly saat: Saat
  ) {}

  /**
   * `otomatikAnahtar` (takvim olay id'si) görevindeki, metni eşleşen işaretlenmemiş maddeyi
   * tamamlar ve görev id'sini döner. Görev ya da madde yoksa / zaten tamamsa `undefined`.
   */
  @Transactional()
  async tamamla(otomatikAnahtar: string, metin: string, aktorId: string) {
    const [g] = await this.txHost.tx
      .select({ id: gorev.id, checklist: gorev.checklist })
      .from(gorev)
      .where(eq(gorev.otomatikAnahtar, otomatikAnahtar))
      .for("update")
    const madde = g?.checklist.find((c) => c.metin === metin && !c.tamam)
    if (!g || !madde) return undefined
    const simdi = this.saat.simdiIso()
    await this.txHost.tx
      .update(gorev)
      .set({
        checklist: g.checklist.map((c) =>
          c.id === madde.id
            ? { ...c, tamam: true, tamamlayanId: aktorId, tamamlanmaTarihi: simdi }
            : c
        ),
        guncellemeTarihi: simdi,
      })
      .where(eq(gorev.id, g.id))
    return g.id
  }
}
