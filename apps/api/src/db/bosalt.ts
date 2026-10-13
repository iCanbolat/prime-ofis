import { sql } from "drizzle-orm"

import type { Veritabani } from "./db.module.js"

/** `public` şemasındaki tablolar (migration kayıtları `drizzle`, kuyruk `pgboss` şemasında) */
export async function uygulamaTablolari(db: Veritabani): Promise<string[]> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`
  )
  return rows.map((r) => r.tablename)
}

/** Tüm uygulama tablolarını boşaltır (dev reset ve testler) */
export async function tablolariBosalt(db: Veritabani) {
  const tablolar = await uygulamaTablolari(db)
  if (!tablolar.length) return
  const liste = tablolar.map((t) => `"public"."${t}"`).join(", ")
  await db.execute(sql.raw(`truncate table ${liste} restart identity cascade`))
}
