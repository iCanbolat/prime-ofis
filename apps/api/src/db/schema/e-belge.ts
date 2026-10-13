import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core"

import type {
  BeratDurumu,
  EBelgeFaturaTipi,
  EBelgeSenaryo,
  EBelgeTur,
  EBelgeYon,
  EFaturaYanitKayit,
  EntegratorBaglantiDurumu,
  EntegratorOrtam,
  GibDurumu,
} from "@prime/shared/types/domain"

import { arsivDosya } from "./arsiv.js"
import { mukellef } from "./mukellef.js"
import { para, zaman } from "./ortak.js"

/**
 * Mükellefin Luca hesabıyla bağlantısı (mükellef başına bir satır, id `n_${mukellefId}`).
 * Web servis anahtarı `anahtar`'da SecretBox ile şifreli; yanıtlarda yalnızca `anahtar_ipucu`.
 */
export const entegratorBaglanti = pgTable("entegrator_baglanti", {
  id: text().primaryKey(),
  mukellefId: text()
    .notNull()
    .unique()
    .references(() => mukellef.id, { onDelete: "cascade" }),
  durum: text().$type<EntegratorBaglantiDurumu>().notNull(),
  ortam: text().$type<EntegratorOrtam>().notNull(),
  eFatura: boolean().notNull(),
  eArsiv: boolean().notNull(),
  eDefter: boolean().notNull(),
  postaKutusu: text(),
  anahtar: text(),
  anahtarIpucu: text(),
  sonSenkron: zaman(),
  hataMesaji: text(),
  baglayanId: text(),
  baglanmaTarihi: zaman(),
})

/**
 * Luca'dan senkronize edilen e-Fatura / e-Arşiv başlığı; ETTN ile tekil. Kalemler saklanmaz.
 * "Süresi doldu" yanıtı saklanmaz, `alinma_tarihi`'nden türetilir.
 */
export const ebelge = pgTable(
  "ebelge",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    tur: text().$type<EBelgeTur>().notNull(),
    yon: text().$type<EBelgeYon>().notNull(),
    ettn: text().notNull().unique(),
    belgeNo: text().notNull(),
    senaryo: text().$type<EBelgeSenaryo>().notNull(),
    faturaTipi: text().$type<EBelgeFaturaTipi>().notNull(),
    karsiTaraf: jsonb().$type<{ unvan: string; vknTckn: string }>().notNull(),
    duzenlemeTarihi: date({ mode: "string" }).notNull(),
    alinmaTarihi: zaman().notNull(),
    matrah: para().notNull(),
    kdv: para().notNull(),
    toplam: para().notNull(),
    paraBirimi: text().$type<"TRY" | "USD" | "EUR">().notNull(),
    gibDurumu: text().$type<GibDurumu>().notNull(),
    yanit: text().$type<EFaturaYanitKayit>(),
    redNedeni: text(),
    yanitlayanId: text(),
    yanitTarihi: zaman(),
    arsivDosyaId: text().references(() => arsivDosya.id, { onDelete: "set null" }),
  },
  (t) => [
    index("ebelge_mukellef_tarih_idx").on(t.mukellefId, t.duzenlemeTarihi),
    index("ebelge_yon_senaryo_idx").on(t.yon, t.senaryo),
  ]
)

/** e-Defter beratı; API'de id `${mukellefId}:${donem}` */
export const edefterBerat = pgTable(
  "edefter_berat",
  {
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    donem: text().notNull(),
    durum: text().$type<BeratDurumu>().notNull(),
    yuklemeTarihi: zaman(),
    onayTarihi: zaman(),
    hataMesaji: text(),
  },
  (t) => [primaryKey({ columns: [t.mukellefId, t.donem] })]
)

/** Büronun Luca'dan aldığı kontör paketleri; tüketim e-belgelerden hesaplanır */
export const kontorAlim = pgTable("kontor_alim", {
  id: text().primaryKey(),
  tarih: date({ mode: "string" }).notNull(),
  paketAdet: integer().notNull(),
  hediyeAdet: integer().notNull(),
  tutar: para().notNull(),
  not: text(),
  ekleyenId: text().notNull(),
})
