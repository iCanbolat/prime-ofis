import { sql } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type {
  DefterTuru,
  KdvPeriyodu,
  MukellefKanal,
  MukellefTur,
  MukellefUcret,
} from "@prime/shared/types/domain"

import { zaman } from "./ortak.js"
import { personel } from "./personel.js"

/**
 * Mükellef. VKN (şirket) ve TCKN (şahıs) kendi içinde benzersiz; türe ait olmayan kimlik alanı
 * boştur. `aktivite.mukellef_id` / `bildirim.mukellef_id` FK değildir (sözde aktörler gibi
 * geçmiş kayıtlar mükellefe bağımlı tutulmaz; mükellef silme ucu yok).
 */
export const mukellef = pgTable(
  "mukellef",
  {
    id: text().primaryKey(),
    tur: text().$type<MukellefTur>().notNull(),
    unvan: text().notNull(),
    vkn: text(),
    tckn: text(),
    ticaretSicilNo: text(),
    mersisNo: text(),
    vergiDairesi: text().notNull(),
    naceKodu: text().notNull(),
    faaliyet: text().notNull(),
    telefon: text().notNull(),
    eposta: text().notNull(),
    il: text().notNull(),
    ilce: text().notNull(),
    adres: text().notNull(),
    sorumluPersonelId: text()
      .notNull()
      .references(() => personel.id, { onDelete: "restrict" }),
    kdvMukellefi: boolean().notNull(),
    kdvPeriyodu: text().$type<KdvPeriyodu>().notNull(),
    defterTuru: text().$type<DefterTuru>().notNull(),
    sgkIsyeriVar: boolean().notNull(),
    calisanSayisi: integer().notNull(),
    eDefterMukellefi: boolean().notNull(),
    aktif: boolean().notNull().default(true),
    etiketler: text().array().notNull().default(sql`'{}'::text[]`),
    olusturmaTarihi: zaman().notNull(),
    ucret: jsonb().$type<MukellefUcret>(),
    tercihKanal: text().$type<MukellefKanal>(),
  },
  (t) => [
    uniqueIndex("mukellef_vkn_uq").on(t.vkn).where(sql`${t.vkn} is not null`),
    uniqueIndex("mukellef_tckn_uq").on(t.tckn).where(sql`${t.tckn} is not null`),
    index("mukellef_sorumlu_idx").on(t.sorumluPersonelId),
  ]
)
