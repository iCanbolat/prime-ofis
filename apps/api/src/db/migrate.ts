/**
 * SQL migration'larını uygular. Docker'da tek seferlik `migrate` servisi çalıştırır
 * (`node dist/db/migrate.js`); api bu servis başarıyla bitince başlar.
 */
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

/** dist/db/migrate.js ve src/db/migrate.ts için aynı: apps/api/drizzle */
export const MIGRATION_KLASORU = fileURLToPath(
  new URL("../../drizzle", import.meta.url)
)

export async function migrationlariUygula(connectionString: string) {
  if (!existsSync(`${MIGRATION_KLASORU}/meta/_journal.json`)) {
    return { uygulandi: false as const }
  }
  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATION_KLASORU,
    })
    return { uygulandi: true as const }
  } finally {
    await pool.end()
  }
}

const dogrudanCalisti =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (dogrudanCalisti) {
  if (existsSync(".env")) process.loadEnvFile(".env")
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL tanımlı değil")
    process.exit(1)
  }
  migrationlariUygula(url)
    .then(({ uygulandi }) => {
      console.log(uygulandi ? "Migration'lar uygulandı" : "Uygulanacak migration yok")
    })
    .catch((hata: unknown) => {
      console.error("Migration başarısız:", hata)
      process.exit(1)
    })
}
