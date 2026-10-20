import { index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core"

import type {
  KamuAdim,
  KamuKurum,
  TebligatDurum,
  TebligatErisimDurumu,
  TebligatKurum,
  TebligatTur,
} from "@prime/shared/types/domain"

import { arsivDosya } from "./arsiv.js"
import { gorev } from "./gorev.js"
import { mukellef } from "./mukellef.js"
import { zaman } from "./ortak.js"

/**
 * Mükellefin GİB İnteraktif VD erişimi (mükellef başına bir satır). Şifre `sifre_enc`'de
 * SecretBox ile şifreli; yanıtlarda yalnızca `sifre_ipucu`. Borç / levha sorguları da (Faz 11)
 * bu erişimi kullanır.
 */
export const tebligatErisim = pgTable("tebligat_erisim", {
  id: text().primaryKey(),
  mukellefId: text()
    .notNull()
    .unique()
    .references(() => mukellef.id, { onDelete: "cascade" }),
  kullaniciKodu: text().notNull(),
  sifreEnc: text().notNull(),
  sifreIpucu: text().notNull(),
  durum: text().$type<TebligatErisimDurumu>().notNull(),
  hataMesaji: text(),
  sonTarama: zaman(),
  kasaKaynagi: jsonb().$type<{ credentialId: string; credentialGuncelleme: string }>(),
  tanimlayanId: text().notNull(),
  tanimlamaTarihi: zaman().notNull(),
})

/** e-Tebligat; GİB'den gelenler `(mukellef_id, gib_belge_id)` ile tekil. Süreler okumada türetilir. */
export const tebligat = pgTable(
  "tebligat",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    vkn: text().notNull(),
    kurum: text().$type<TebligatKurum>().notNull(),
    tur: text().$type<TebligatTur>().notNull(),
    konu: text().notNull(),
    belgeNo: text(),
    ulasmaTarihi: zaman().notNull(),
    sureGun: integer(),
    durum: text().$type<TebligatDurum>().notNull(),
    atananId: text(),
    gorevId: text().references(() => gorev.id, { onDelete: "set null" }),
    arsivDosyaId: text().references(() => arsivDosya.id, { onDelete: "set null" }),
    not: text(),
    kaynak: text().$type<"GIB" | "ELLE">().notNull(),
    gibBelgeId: text(),
    olusturmaTarihi: zaman().notNull(),
  },
  (t) => [
    unique("tebligat_gib_belge_uniq").on(t.mukellefId, t.gibBelgeId),
    index("tebligat_mukellef_ulasma_idx").on(t.mukellefId, t.ulasmaTarihi),
  ]
)

/**
 * Büro geneli gece taraması (son 30 tutulur). Sayaçlar mükellef işleri bittikçe artar; `bitis`
 * son biten işin anıdır.
 */
export const tebligatTarama = pgTable("tebligat_tarama", {
  id: text().primaryKey(),
  baslangic: zaman().notNull(),
  bitis: zaman().notNull(),
  taranan: integer().notNull(),
  hatali: integer().notNull(),
  yeni: integer().notNull(),
  dogrulama: integer().notNull(),
})

/**
 * Kamu girişinde çıkan doğrulama ekranı (CAPTCHA); mükellef + kurum başına en çok bir satır.
 * Otomatik geçilmez: personel kodu girer. `oturum_id` hiçbir yanıtta dönmez, görsel kısa ömürlüdür
 * ve loglanmaz.
 */
export const kamuDogrulama = pgTable(
  "kamu_dogrulama",
  {
    id: text().primaryKey(),
    mukellefId: text()
      .notNull()
      .references(() => mukellef.id, { onDelete: "cascade" }),
    kurum: text().$type<KamuKurum>().notNull(),
    oturumId: text().notNull(),
    gorselDataUrl: text().notNull(),
    sonGecerlilik: zaman().notNull(),
    bekleyenAdimlar: jsonb().$type<KamuAdim[]>().notNull(),
    olusturmaTarihi: zaman().notNull(),
  },
  (t) => [unique("kamu_dogrulama_mukellef_kurum_uniq").on(t.mukellefId, t.kurum)]
)
