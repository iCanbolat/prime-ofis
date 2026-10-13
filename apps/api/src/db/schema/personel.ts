import { sql } from "drizzle-orm"
import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type { PersonelRenk, Rol } from "@prime/shared/types/domain"

import { zaman } from "./ortak.js"

export const personel = pgTable(
  "personel",
  {
    id: text().primaryKey(),
    ad: text().notNull(),
    soyad: text().notNull(),
    /** Küçük harfle saklanır */
    eposta: text().notNull(),
    telefon: text().notNull().default(""),
    rol: text().$type<Rol>().notNull(),
    renk: text().$type<PersonelRenk>().notNull().default("blue"),
    aktif: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex("personel_eposta_uq").on(sql`lower(${t.eposta})`)]
)

/** Giriş şifresi özeti (argon2id). Yalnızca auth katmanı okur; yanıtlara girmez. */
export const personelKimlik = pgTable("personel_kimlik", {
  personelId: text()
    .primaryKey()
    .references(() => personel.id, { onDelete: "cascade" }),
  hash: text().notNull(),
  guncelleme: zaman().notNull(),
})

/** Sunucu tarafı oturum; cookie'deki ham id'nin yalnızca SHA-256 özeti saklanır. */
export const oturum = pgTable(
  "oturum",
  {
    idHash: text().primaryKey(),
    personelId: text()
      .notNull()
      .references(() => personel.id, { onDelete: "cascade" }),
    olusturma: zaman().notNull(),
    sonGorulme: zaman().notNull(),
    bitis: zaman().notNull(),
    ip: text(),
    ua: text(),
  },
  (t) => [index("oturum_personel_idx").on(t.personelId), index("oturum_bitis_idx").on(t.bitis)]
)
