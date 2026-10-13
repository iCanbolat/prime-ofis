import "reflect-metadata"

import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { sql } from "drizzle-orm"
import { inject } from "vitest"

import { fastifyAdapter, uygulamayiYapilandir } from "../src/app.factory.js"
import { AppModule } from "../src/app.module.js"
import { Saat } from "../src/core/saat.js"
import { DB, type Veritabani } from "../src/db/db.module.js"
import { BellekDosyaDeposu, DosyaDeposu } from "../src/storage/dosya-deposu.js"

export interface TestUygulamasi {
  app: NestFastifyApplication
  db: Veritabani
  depo: BellekDosyaDeposu
  saat: Saat
  /** `app.inject` kısayolu — gerçek HTTP olmadan Fastify üzerinden istek */
  istek: NestFastifyApplication["inject"]
  kapat: () => Promise<void>
}

/**
 * Gerçek AppModule (Postgres dahil), bellek içi dosya deposu, işler kapalı.
 * `ortam` ile ek ortam değişkeni verilebilir (ör. `{ JOB_WORKERS: "true" }`).
 */
export async function testUygulamasi(
  ortam: Record<string, string> = {}
): Promise<TestUygulamasi> {
  const depo = new BellekDosyaDeposu()
  const modul = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        DATABASE_URL: inject("databaseUrl"),
        DB_POOL_MAX: "4",
        S3_ENDPOINT: "http://depo.test",
        S3_ACCESS_KEY: "test",
        S3_SECRET_KEY: "test",
        JOB_WORKERS: "false",
        ...ortam,
      }),
    ],
  })
    .overrideProvider(DosyaDeposu)
    .useValue(depo)
    .compile()

  const app = modul.createNestApplication<NestFastifyApplication>(
    fastifyAdapter()
  )
  await uygulamayiYapilandir(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return {
    app,
    db: app.get<Veritabani>(DB),
    depo,
    saat: app.get(Saat),
    istek: app.inject.bind(app),
    kapat: () => app.close(),
  }
}

/** `public` şemasındaki tüm tabloları boşaltır (migration kayıtları `drizzle` şemasında kalır). */
export async function tablolariBosalt(db: Veritabani) {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`
  )
  if (!rows.length) return
  const liste = rows.map((r) => `"public"."${r.tablename}"`).join(", ")
  await db.execute(sql.raw(`truncate table ${liste} restart identity cascade`))
}
