import { jsonb, pgTable, text } from "drizzle-orm/pg-core"

import type { LucaSablonAyari, MesajSablonTip } from "@prime/shared/types/domain"

/** Kurulum başına tek büro (tek satır) */
export const buro = pgTable("buro", {
  id: text().primaryKey(),
  ad: text().notNull(),
  vkn: text().notNull(),
  vergiDairesi: text().notNull(),
  telefon: text().notNull(),
  eposta: text().notNull(),
  adres: text().notNull(),
  mesajSablonlari: jsonb().$type<Record<MesajSablonTip, string>>().notNull(),
  iban: text(),
  lucaSablonu: jsonb().$type<LucaSablonAyari>(),
})
