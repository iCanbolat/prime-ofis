import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { DEMO_GIRIS_SIFRESI } from "@prime/mock-data/factories/personel"

import { testUygulamasi, type TestUygulamasi } from "./harness.js"

describe("dev araçları", () => {
  describe("DEV_ARACLARI=true", () => {
    let t: TestUygulamasi
    beforeAll(async () => {
      t = await testUygulamasi({ DEV_ARACLARI: "true" })
    })
    afterAll(() => t.kapat())

    it("reset seed'i yükler, depoyu boşaltır; stats tablo başına satır sayısı", async () => {
      await t.depo.koy("arsiv/m/d", Buffer.from("x"), "application/pdf")
      expect((await t.istemci().post("/dev/reset")).statusCode).toBe(204)
      expect(t.depo.nesneler.size).toBe(0)

      const stats = (await t.istemci().get("/dev/stats")).json()
      expect(stats).toMatchObject({ buro: 1, personel: 4, personel_kimlik: 4, oturum: 0 })

      // Seed kullanıcıları demo şifresiyle giriş yapar
      const giris = await t
        .istemci()
        .post("/auth/login", { eposta: "ayse.yilmaz@primemusavirlik.com.tr", sifre: DEMO_GIRIS_SIFRESI })
      expect(giris.statusCode).toBe(200)
    })
  })

  describe("DEV_ARACLARI=false", () => {
    let t: TestUygulamasi
    beforeAll(async () => {
      t = await testUygulamasi()
    })
    afterAll(() => t.kapat())

    it("dev uçları yok", async () => {
      expect((await t.istemci().post("/dev/reset")).statusCode).toBe(404)
      expect((await t.istemci().get("/dev/stats")).statusCode).toBe(404)
    })
  })
})
