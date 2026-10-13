import { sql } from "drizzle-orm"
import { date, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type {
  GorevChecklistMaddesi,
  GorevDurum,
  GorevOncelik,
  GorevTip,
  GorevYorum,
} from "@prime/shared/types/domain"

import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Büro içi görev. Kontrol listesi ve yorumlar görevle birlikte okunup yazıldığı için jsonb.
 * `atanan_id` FK değildir: yalnızca açık görevi olan personelin silinmesi engellenir, tamamlanmış
 * görevlerin atananı silinebilir. `otomatik_anahtar` = takvim olay id'si (beyan görevlerinde).
 */
export const gorev = pgTable(
  "gorev",
  {
    id: text().primaryKey(),
    baslik: text().notNull(),
    aciklama: text(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    tip: text().$type<GorevTip>().notNull(),
    donem: text(),
    atananId: text().notNull(),
    durum: text().$type<GorevDurum>().notNull(),
    oncelik: text().$type<GorevOncelik>().notNull(),
    sonTarih: date({ mode: "string" }).notNull(),
    checklist: jsonb().$type<GorevChecklistMaddesi[]>().notNull().default([]),
    yorumlar: jsonb().$type<GorevYorum[]>().notNull().default([]),
    bagliTalepIdler: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    olusturanId: text().notNull(),
    olusturmaTarihi: zaman().notNull(),
    guncellemeTarihi: zaman().notNull(),
    tamamlanmaTarihi: zaman(),
    otomatikAnahtar: text(),
  },
  (t) => [
    uniqueIndex("gorev_otomatik_anahtar_uq")
      .on(t.otomatikAnahtar)
      .where(sql`${t.otomatikAnahtar} is not null`),
    index("gorev_atanan_durum_idx").on(t.atananId, t.durum),
    index("gorev_mukellef_idx").on(t.mukellefId),
  ]
)
