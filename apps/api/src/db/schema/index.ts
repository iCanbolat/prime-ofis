/**
 * Drizzle şeması. Tablolar fazlara göre buraya eklenir (`.claude/backend.md` § 5) ve
 * `pnpm --filter @prime/api db:generate` ile SQL migration'ı üretilir (git'te tutulur).
 *
 * Kurallar: kolon adları snake_case (drizzle `casing`), enum'lar `text().$type<Union>()`,
 * para `numeric(14,2)` (mode number), ISO zamanlar `timestamptz` (mode string), `yyyy-MM-dd` → `date`.
 */
export * from "./aktivite.js"
export * from "./buro.js"
export * from "./personel.js"
export * from "./mukellef.js"
export * from "./kasa.js"
export * from "./takvim.js"
export * from "./gorev.js"
export * from "./arsiv.js"
export * from "./evrak.js"
export * from "./ice-aktarim.js"
export * from "./tahsilat.js"
export * from "./kanal.js"
export * from "./e-belge.js"
export * from "./tebligat.js"
