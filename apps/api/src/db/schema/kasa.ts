import { integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type { EncryptedPayload, Sistem } from "@prime/shared/types/domain"

import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Şifre kasası meta'sı (tek satır, id `kasa`). Sıfır bilgili: anahtar istemcide ana şifreden
 * türetilir (PBKDF2); sunucu yalnızca salt, tur sayısı ve doğrulayıcı şifreli metni saklar.
 */
export const kasaMeta = pgTable("kasa_meta", {
  id: text().primaryKey(),
  salt: text().notNull(),
  iterations: integer().notNull(),
  verifier: jsonb().$type<EncryptedPayload>().notNull(),
  olusturmaTarihi: zaman().notNull(),
})

/** Mükellef şifresi: istemcide AES-GCM ile şifrelenmiş; sunucu çözemez */
export const credential = pgTable(
  "credential",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    sistem: text().$type<Sistem>().notNull(),
    kullaniciAdi: text().notNull(),
    cipherText: text().notNull(),
    iv: text().notNull(),
    not: text(),
    sonGuncelleme: zaman().notNull(),
    /** Personel olmayabilir (sözde aktör); FK yok */
    guncelleyenId: text().notNull(),
  },
  (t) => [uniqueIndex("credential_mukellef_sistem_uq").on(t.mukellefId, t.sistem)]
)
