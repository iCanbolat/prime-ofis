import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"

import type {
  GelenEvrakDurum,
  IstenenEvrak,
  TalepGonderim,
  TalepKanal,
  TalepKayitDurumu,
} from "@prime/shared/types/domain"

import { arsivDosya } from "./arsiv.js"
import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Müşteriye magic link (`/p/{token}`) ile gönderilen evrak talebi. Saklanan durum AKTIF /
 * TAMAMLANDI / IPTAL; "süresi doldu" `son_kullanma`'dan okumada türetilir.
 * `olusturan_id` FK değildir (personel silinebilir; görünümde `olusturan: null`).
 */
export const evrakTalebi = pgTable(
  "evrak_talebi",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    kanal: text().$type<TalepKanal>().notNull(),
    istenenler: text().array().$type<IstenenEvrak[]>().notNull(),
    donem: text(),
    aciklama: text(),
    durum: text().$type<TalepKayitDurumu>().notNull(),
    sonKullanma: zaman().notNull(),
    olusturanId: text().notNull(),
    olusturmaTarihi: zaman().notNull(),
    gonderimler: jsonb().$type<TalepGonderim[]>().notNull().default(sql`'[]'::jsonb`),
    musteriNotu: text(),
    tamamlanmaTarihi: zaman(),
  },
  (t) => [index("evrak_talebi_mukellef_idx").on(t.mukellefId)]
)

/** Portaldan müşterinin yüklediği dosya (meta). İçerik `gelen/{talepId}/{id}` anahtarında. */
export const gelenEvrak = pgTable(
  "gelen_evrak",
  {
    id: text().primaryKey(),
    talepId: text()
      .notNull()
      .references(() => evrakTalebi.id, { onDelete: "cascade" }),
    mukellefId: text().notNull(),
    istenen: text().$type<IstenenEvrak>().notNull(),
    ad: text().notNull(),
    mimeType: text().notNull(),
    boyut: integer().notNull(),
    yuklemeTarihi: zaman().notNull(),
    durum: text().$type<GelenEvrakDurum>().notNull(),
    redNedeni: text(),
    arsivDosyaId: text().references(() => arsivDosya.id, { onDelete: "set null" }),
    okumaId: text(),
    inceleyenId: text(),
    incelemeTarihi: zaman(),
  },
  (t) => [
    index("gelen_evrak_talep_idx").on(t.talepId),
    index("gelen_evrak_durum_idx").on(t.durum),
  ]
)
