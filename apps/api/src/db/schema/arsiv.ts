import { boolean, date, index, integer, pgTable, text } from "drizzle-orm/pg-core"

import type { ArsivKategori, BordroBelgeTur } from "@prime/shared/types/domain"

import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Dijital arşiv dosyası (meta). İçerik nesne deposunda `arsiv/{mukellefId}/{id}` anahtarında.
 * `yukleyen_id` FK değildir: yükleyen personel silinebilir (görünümde `yukleyen: null`).
 */
export const arsivDosya = pgTable(
  "arsiv_dosya",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    kategori: text().$type<ArsivKategori>().notNull(),
    ad: text().notNull(),
    mimeType: text().notNull(),
    boyut: integer().notNull(),
    yukleyenId: text().notNull(),
    yuklemeTarihi: zaman().notNull(),
    gecerlilikTarihi: date({ mode: "string" }),
    donem: text(),
    bordroBelge: text().$type<BordroBelgeTur>(),
    silindi: boolean().notNull().default(false),
    silinmeTarihi: zaman(),
  },
  (t) => [
    index("arsiv_dosya_mukellef_kategori_idx").on(t.mukellefId, t.kategori),
    index("arsiv_dosya_mukellef_donem_idx").on(t.mukellefId, t.donem),
    index("arsiv_dosya_silindi_idx").on(t.silindi),
  ]
)
