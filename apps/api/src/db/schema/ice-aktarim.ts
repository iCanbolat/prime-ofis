import { date, index, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core"

import type { MizanHesap, MizanKontrol, YukumlulukTip } from "@prime/shared/types/domain"

import { arsivDosya } from "./arsiv.js"
import { mukellef } from "./mukellef.js"
import { para, zaman } from "./ortak.js"

/**
 * e-Beyanname'den içe aktarılan tahakkuk fişi. Mükellef + yükümlülük + dönem başına bir kayıt;
 * yeniden yükleme günceller. `yukleyen_id` FK değildir (personel silinebilir).
 */
export const tahakkuk = pgTable(
  "tahakkuk",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    tip: text().$type<YukumlulukTip>().notNull(),
    donem: text().notNull(),
    beyannameKodu: text(),
    tahakkukNo: text(),
    odenecek: para(),
    vade: date({ mode: "string" }),
    arsivDosyaId: text().references(() => arsivDosya.id, { onDelete: "set null" }),
    yukleyenId: text().notNull(),
    yuklemeTarihi: zaman().notNull(),
  },
  (t) => [unique("tahakkuk_anahtar_uq").on(t.mukellefId, t.tip, t.donem)]
)

/** Muhasebe paketinden içe aktarılan mizan; mükellef + ay başına bir kayıt */
export const mizan = pgTable(
  "mizan",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    donem: text().notNull(),
    dosyaAdi: text().notNull(),
    hesaplar: jsonb().$type<MizanHesap[]>().notNull(),
    kontroller: jsonb().$type<MizanKontrol[]>().notNull(),
    arsivDosyaId: text().references(() => arsivDosya.id, { onDelete: "set null" }),
    yukleyenId: text().notNull(),
    yuklemeTarihi: zaman().notNull(),
  },
  (t) => [
    unique("mizan_anahtar_uq").on(t.mukellefId, t.donem),
    index("mizan_donem_idx").on(t.donem),
  ]
)
