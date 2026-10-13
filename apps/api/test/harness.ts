import "reflect-metadata"

import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { inject } from "vitest"

import { DEMO_GIRIS_SIFRESI, PERSONEL } from "@prime/mock-data/factories/personel"
import { createFixtureState } from "@prime/mock-data/fixtures"

import { fastifyAdapter, uygulamayiYapilandir } from "../src/app.factory.js"
import { AppModule } from "../src/app.module.js"
import { Saat } from "../src/core/saat.js"
import { tablolariBosalt } from "../src/db/bosalt.js"
import { DB, type Veritabani } from "../src/db/db.module.js"
import { SeedYukleyici } from "../src/dev/seed-yukleyici.js"
import { BellekDosyaDeposu, DosyaDeposu } from "../src/storage/dosya-deposu.js"

export interface TestUygulamasi {
  app: NestFastifyApplication
  db: Veritabani
  depo: BellekDosyaDeposu
  saat: Saat
  /** `app.inject` kısayolu — gerçek HTTP olmadan Fastify üzerinden istek */
  istek: NestFastifyApplication["inject"]
  kapat: () => Promise<void>
  /** Tabloları boşaltır ve mock-data fixture'larını yükler (client testleriyle aynı veri) */
  fixtureYukle: () => Promise<void>
  /** Giriş yapar, `cookie` başlık değerini döner (personel id'si ya da e-posta) */
  girisYap: (kim: string, sifre?: string) => Promise<string>
  /** Oturumlu (cookie verilirse) kısa istek yardımcıları; yol `/api` olmadan */
  istemci: (cookie?: string) => Istemci
}

type Yanit = Awaited<ReturnType<NestFastifyApplication["inject"]>>
export interface Istemci {
  get: (yol: string) => Promise<Yanit>
  post: (yol: string, govde?: unknown) => Promise<Yanit>
  put: (yol: string, govde?: unknown) => Promise<Yanit>
  patch: (yol: string, govde?: unknown) => Promise<Yanit>
  delete: (yol: string) => Promise<Yanit>
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

  const db = app.get<Veritabani>(DB)
  const istek = app.inject.bind(app)

  const istemci = (cookie?: string): Istemci => {
    const yap = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", yol: string, govde?: unknown) =>
      istek({
        method,
        url: `/api${yol}`,
        headers: cookie ? { cookie } : {},
        ...(govde !== undefined ? { payload: govde as object } : {}),
      })
    return {
      get: (yol) => yap("GET", yol),
      post: (yol, govde) => yap("POST", yol, govde),
      put: (yol, govde) => yap("PUT", yol, govde),
      patch: (yol, govde) => yap("PATCH", yol, govde),
      delete: (yol) => yap("DELETE", yol),
    }
  }

  return {
    app,
    db,
    depo,
    saat: app.get(Saat),
    istek,
    kapat: () => app.close(),
    fixtureYukle: async () => {
      await tablolariBosalt(db)
      depo.nesneler.clear()
      await app.get(SeedYukleyici).yukle(createFixtureState())
    },
    girisYap: async (kim, sifre = DEMO_GIRIS_SIFRESI) => {
      const eposta = PERSONEL.find((p) => p.id === kim)?.eposta ?? kim
      const yanit = await istemci().post("/auth/login", { eposta, sifre })
      if (yanit.statusCode !== 200) {
        throw new Error(`Giriş başarısız (${yanit.statusCode}): ${yanit.body}`)
      }
      const c = yanit.cookies.find((c) => c.name === "sid")
      return `sid=${c!.value}`
    },
    istemci,
  }
}

export { tablolariBosalt }
