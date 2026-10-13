import { sql } from "drizzle-orm"
import { date, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type { CariHareketTip, CariKalem, Kapatma } from "@prime/shared/types/domain"

import { mukellef } from "./mukellef.js"
import { para, zaman } from "./ortak.js"

/**
 * Büronun mükelleflerle cari hesabı. Bakiye, açık borç ve yaşlandırma saklanmaz; okumada
 * `@prime/shared/tahsilat/kurallar` ile hesaplanır. Ödemenin hangi borçları kapattığı
 * `kapatmalar`'da (dağıtılmayan kısım avans). Otomatik aylık ücret `otomatik_anahtar`
 * (`UCRET:m:donem`) ile bir kez üretilir. `olusturan_id` FK değildir (`sistem` ya da personel).
 */
export const cariHareket = pgTable(
  "cari_hareket",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    tip: text().$type<CariHareketTip>().notNull(),
    kalem: text().$type<CariKalem>().notNull(),
    donem: text(),
    tarih: date({ mode: "string" }).notNull(),
    brut: para().notNull(),
    kdv: para().notNull(),
    stopaj: para().notNull(),
    tutar: para().notNull(),
    aciklama: text(),
    makbuzNo: text(),
    kapatmalar: jsonb().$type<Kapatma[]>(),
    otomatikAnahtar: text(),
    olusturanId: text().notNull(),
    olusturmaTarihi: zaman().notNull(),
  },
  (t) => [
    uniqueIndex("cari_hareket_otomatik_uq")
      .on(t.otomatikAnahtar)
      .where(sql`${t.otomatikAnahtar} is not null`),
    index("cari_hareket_mukellef_tarih_idx").on(t.mukellefId, t.tarih),
  ]
)

/** İVD kesinti listesi içe aktarımı; yıl başına bir kayıt (yeniden yükleme yerine geçer) */
export const kesintiIceAktarim = pgTable("kesinti_ice_aktarim", {
  id: text().primaryKey(),
  yil: integer().notNull().unique(),
  dosyaAdi: text().notNull(),
  satirSayisi: integer().notNull(),
  yukleyenId: text().notNull(),
  zaman: zaman().notNull(),
})

export const kesintiKaydi = pgTable(
  "kesinti_kaydi",
  {
    id: text().primaryKey(),
    iceAktarimId: text()
      .notNull()
      .references(() => kesintiIceAktarim.id, { onDelete: "cascade" }),
    vkn: text().notNull(),
    unvan: text().notNull(),
    donem: text().notNull(),
    matrah: para().notNull(),
    kesinti: para().notNull(),
  },
  (t) => [index("kesinti_kaydi_aktarim_idx").on(t.iceAktarimId)]
)
