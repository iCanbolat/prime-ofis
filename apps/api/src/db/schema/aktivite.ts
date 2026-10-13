import { sql } from "drizzle-orm"
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type { AktiviteLog, BildirimTur } from "@prime/shared/types/domain"

import { zaman } from "./ortak.js"

/**
 * Aktivite akışı. `aktor_id` personel olmayabilir ("sistem", "musteri"), bu yüzden FK yok.
 * `mukellef_id` FK'sı mükellef tablosuyla (Faz 2) eklenir.
 */
export const aktivite = pgTable(
  "aktivite",
  {
    id: text().primaryKey(),
    aktorId: text().notNull(),
    eylem: text().$type<AktiviteLog["eylem"]>().notNull(),
    hedefTip: text().$type<NonNullable<AktiviteLog["hedefTip"]>>(),
    hedefId: text(),
    mukellefId: text(),
    aciklama: text(),
    zaman: zaman().notNull(),
  },
  (t) => [
    index("aktivite_mukellef_zaman_idx").on(t.mukellefId, t.zaman.desc()),
    index("aktivite_hedef_idx").on(t.hedefId),
    index("aktivite_zaman_idx").on(t.zaman.desc()),
  ]
)

/** Uygulama içi bildirim. `alici_id` null → yayın (aktör hariç herkes). */
export const bildirim = pgTable(
  "bildirim",
  {
    id: text().primaryKey(),
    tur: text().$type<BildirimTur>().notNull(),
    aliciId: text(),
    aktorId: text(),
    baslik: text().notNull(),
    aciklama: text(),
    link: text(),
    mukellefId: text(),
    hedefTip: text().$type<NonNullable<AktiviteLog["hedefTip"]>>(),
    hedefId: text(),
    zaman: zaman().notNull(),
    okuyanlar: text().array().notNull().default(sql`'{}'::text[]`),
    /** Hatırlatmaların tekilleştirme anahtarı */
    anahtar: text(),
  },
  (t) => [
    index("bildirim_alici_zaman_idx").on(t.aliciId, t.zaman.desc()),
    uniqueIndex("bildirim_anahtar_uq").on(t.anahtar).where(sql`${t.anahtar} is not null`),
  ]
)
