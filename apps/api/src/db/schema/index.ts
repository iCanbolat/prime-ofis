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
