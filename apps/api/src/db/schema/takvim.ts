import { primaryKey, pgTable, text } from "drizzle-orm/pg-core"

import type { BeyanDurumu, YukumlulukTip } from "@prime/shared/types/domain"

import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Beyan durumu. Takvim olaylarının kendisi kural motoruyla her istekte hesaplanır; yalnızca
 * "Bekliyor" dışındaki durumlar saklanır. API'deki id `${mukellefId}:${tip}:${donem}`.
 */
export const takvimDurum = pgTable(
  "takvim_durum",
  {
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    tip: text().$type<YukumlulukTip>().notNull(),
    /** "2026-09" (aylık), "2026-Q3" (3 aylık), "2025" (yıllık) */
    donem: text().notNull(),
    durum: text().$type<Exclude<BeyanDurumu, "BEKLIYOR">>().notNull(),
    /** Personel olmayabilir (sözde aktör); FK yok */
    guncelleyenId: text().notNull(),
    guncellemeTarihi: zaman().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mukellefId, t.tip, t.donem] })]
)
