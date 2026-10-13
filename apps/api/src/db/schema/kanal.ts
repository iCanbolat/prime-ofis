import { sql } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import type {
  GonderimDurumu,
  GonderimKaynak,
  KanalAyari,
  KanalDurumu,
  KanalTip,
  WhatsappSablon,
} from "@prime/shared/types/domain"

import { personel } from "./personel.js"
import { zaman } from "./ortak.js"

/** Kanal tipine özgü alanlar (SMTP sunucusu, WhatsApp kimlikleri ve şablon eşlemesi …) */
export type KanalAyarAlanlari = KanalAyari extends infer K
  ? K extends KanalAyari
    ? Omit<K, OrtakAlan>
    : never
  : never
type OrtakAlan =
  | "id"
  | "tip"
  | "aktif"
  | "durum"
  | "gizliIpucu"
  | "sonTest"
  | "hataMesaji"
  | "guncelleyenId"
  | "guncellemeTarihi"

/**
 * Büronun dış gönderim kanalları (kanal başına tek satır). Şifre / erişim anahtarı `gizli`
 * kolonunda SecretBox ile şifreli; yanıtlarda yalnızca `gizli_ipucu` (son 4 karakter).
 */
export const kanalAyari = pgTable("kanal_ayari", {
  tip: text().$type<KanalTip>().primaryKey(),
  aktif: boolean().notNull(),
  durum: text().$type<KanalDurumu>().notNull(),
  ayar: jsonb().$type<KanalAyarAlanlari>().notNull(),
  gizli: text(),
  gizliIpucu: text(),
  sonTest: zaman(),
  hataMesaji: text(),
  guncelleyenId: text(),
  guncellemeTarihi: zaman(),
})

/** Personelin kategori → dış kanal tercihi. Satır yoksa `VARSAYILAN_TERCIH` geçerlidir. */
export const bildirimTercihi = pgTable("bildirim_tercihi", {
  personelId: text()
    .primaryKey()
    .references(() => personel.id, { onDelete: "cascade" }),
  kanallar: jsonb().$type<Partial<Record<string, KanalTip[]>>>().notNull(),
  /** Telegram ertelendi; kolon ileride bağlama için */
  telegramChatId: text(),
})

/**
 * Dış kanal gönderimleri (outbox). `KUYRUKTA` satırlar `gonderim` işiyle gönderilir;
 * `adres` maskelidir (yanıtlarda görünen), gerçek adres `hedef_adres`'te (yanıtlara girmez).
 * `anahtar`: aynı bildirimin aynı kişiye aynı kanaldan ikinci kez kuyruğa girmesini önler.
 */
export const gonderim = pgTable(
  "gonderim",
  {
    id: text().primaryKey(),
    kanal: text().$type<KanalTip>().notNull(),
    aliciTip: text().$type<"PERSONEL" | "MUKELLEF">().notNull(),
    aliciId: text().notNull(),
    aliciAd: text().notNull(),
    adres: text().notNull(),
    hedefAdres: text(),
    konu: text().notNull(),
    ozet: text().notNull(),
    metin: text(),
    sablon: text().$type<WhatsappSablon>(),
    parametreler: jsonb().$type<string[]>(),
    ekArsivDosyaId: text(),
    durum: text().$type<GonderimDurumu>().notNull(),
    hataMesaji: text(),
    kaynak: text().$type<GonderimKaynak>().notNull(),
    kaynakId: text(),
    gonderenId: text(),
    denemeSayisi: integer().notNull().default(0),
    sonrakiDeneme: zaman(),
    saglayiciId: text(),
    anahtar: text(),
    zaman: zaman().notNull(),
  },
  (t) => [
    index("gonderim_zaman_idx").on(t.zaman.desc()),
    index("gonderim_kuyruk_idx")
      .on(t.sonrakiDeneme)
      .where(sql`${t.durum} = 'KUYRUKTA'`),
    index("gonderim_saglayici_idx").on(t.saglayiciId),
    uniqueIndex("gonderim_anahtar_uq").on(t.anahtar).where(sql`${t.anahtar} is not null`),
  ]
)
