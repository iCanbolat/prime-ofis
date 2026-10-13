import { HttpException } from "@nestjs/common"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { envOku } from "../src/config/env.js"
import { hataGovdesi } from "../src/core/hata.filter.js"
import { newId } from "../src/core/id.js"
import { istegeBagliSayfala, sayfala, sayfaParametreleri } from "../src/core/sayfala.js"
import { ZodPipe } from "../src/core/zod.pipe.js"
import { IsKuyrugu } from "../src/jobs/jobs.module.js"
import { tablolariBosalt, testUygulamasi, type TestUygulamasi } from "./harness.js"

describe("HTTP altyapısı", () => {
  let t: TestUygulamasi
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  it("GET /api/health veritabanı ve depoyu kontrol eder", async () => {
    const yanit = await t.istek({ method: "GET", url: "/api/health" })
    expect(yanit.statusCode).toBe(200)
    expect(yanit.json()).toEqual({ durum: "ok", db: "ok", depo: "ok" })
  })

  it("depo erişilemezse 503 ve { message } döner", async () => {
    const ping = vi.spyOn(t.depo, "ping").mockRejectedValueOnce(new Error("yok"))
    const yanit = await t.istek({ method: "GET", url: "/api/health" })
    expect(yanit.statusCode).toBe(503)
    expect(yanit.json()).toMatchObject({ message: "Servis kullanılamıyor", depo: "hata" })
    ping.mockRestore()
  })

  it("bilinmeyen yol 404 { message }", async () => {
    const yanit = await t.istek({ method: "GET", url: "/api/yok" })
    expect(yanit.statusCode).toBe(404)
    expect(yanit.json()).toEqual({ message: "İstenen adres bulunamadı" })
  })

  it("bozuk JSON 400 { message }", async () => {
    const yanit = await t.istek({
      method: "POST",
      url: "/api/health",
      headers: { "content-type": "application/json" },
      payload: "{bozuk",
    })
    expect(yanit.statusCode).toBe(400)
    expect(yanit.json()).toEqual({ message: "Geçersiz istek" })
  })

  it("15 MB'ı aşan gövde 413 { message }", async () => {
    const yanit = await t.istek({
      method: "POST",
      url: "/api/health",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ dataUrl: "a".repeat(16 * 1024 * 1024) }),
    })
    expect(yanit.statusCode).toBe(413)
    expect(yanit.json()).toEqual({ message: "İstek çok büyük" })
  })

  it("güvenlik başlıkları eklenir", async () => {
    const yanit = await t.istek({ method: "GET", url: "/api/health" })
    expect(yanit.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("tablolariBosalt tablo yokken de çalışır", async () => {
    await expect(tablolariBosalt(t.db)).resolves.toBeUndefined()
  })
})

describe("hata biçimi", () => {
  it("ek alanlar korunur, Nest alanları atılır", () => {
    const { status, govde } = hataGovdesi(
      new HttpException({ message: "Zaten arşivde", arsivDosyaId: "d_1" }, 409)
    )
    expect(status).toBe(409)
    expect(govde).toEqual({ message: "Zaten arşivde", arsivDosyaId: "d_1" })
  })

  it("dizi mesajı birleştirilir, beklenmeyen hata 500", () => {
    expect(hataGovdesi(new HttpException({ message: ["a", "b"] }, 400)).govde).toEqual({
      message: "a. b",
    })
    expect(hataGovdesi(new Error("iç")).govde).toEqual({ message: "Sunucu hatası" })
  })
})

describe("ZodPipe", () => {
  const sema = z.object({ donem: z.string().regex(/^\d{4}-\d{2}$/, "Geçersiz dönem") })

  it("geçerli girdiyi döndürür", () => {
    expect(new ZodPipe(sema).transform({ donem: "2026-08" })).toEqual({ donem: "2026-08" })
  })

  it("ilk sorunu alan yoluyla ve istenen status ile verir", () => {
    const hata = (() => {
      try {
        new ZodPipe(sema, 422).transform({ donem: "2026/8" })
      } catch (e) {
        return e as HttpException
      }
    })()
    expect(hata?.getStatus()).toBe(422)
    expect(hataGovdesi(hata).govde).toEqual({ message: "donem: Geçersiz dönem" })
  })
})

describe("sayfalama", () => {
  const liste = Array.from({ length: 45 }, (_, i) => i)

  it("kirp: taşan sayfa son sayfaya döner", () => {
    const s = sayfala(liste, { sayfa: "9", sayfaBoyutu: "20" })
    expect(s).toMatchObject({ sayfa: 3, sayfaBoyutu: 20, total: 45 })
    expect(s.items).toEqual([40, 41, 42, 43, 44])
  })

  it("serbest: taşan sayfa boş döner", () => {
    expect(sayfala(liste, { sayfa: 9 }, { kip: "serbest" }).items).toEqual([])
  })

  it("sayfaBoyutu 1–100, varsayılan kullanılır", () => {
    expect(sayfaParametreleri({ sayfaBoyutu: "500" }, 1000).sayfaBoyutu).toBe(100)
    expect(sayfaParametreleri({}, 10, { varsayilan: 24 }).sayfaBoyutu).toBe(24)
    expect(sayfaParametreleri({ sayfa: "-3" }, 0)).toMatchObject({ sayfa: 1, offset: 0 })
  })

  it("isteğe bağlı: sayfa yoksa tüm liste", () => {
    expect(istegeBagliSayfala(liste, {})).toMatchObject({ total: 45, sayfa: 1, sayfaBoyutu: 45 })
    expect(istegeBagliSayfala(liste, { sayfa: "2" }).items[0]).toBe(20)
  })
})

describe("yardımcılar", () => {
  it("newId önek + 16 base62 karakter, çakışmasız", () => {
    const idler = new Set(Array.from({ length: 2000 }, () => newId("m")))
    expect(idler.size).toBe(2000)
    for (const id of idler) expect(id).toMatch(/^m_[0-9A-Za-z]{16}$/)
  })

  it("production'da SECRET_KEY zorunlu, DEV_ARACLARI kapalı", () => {
    const temel = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      S3_ENDPOINT: "http://minio:9000",
      S3_ACCESS_KEY: "a",
      S3_SECRET_KEY: "b",
    }
    expect(() => envOku(temel)).toThrow(/SECRET_KEY/)
    expect(() =>
      envOku({ ...temel, SECRET_KEY: Buffer.alloc(32).toString("base64"), DEV_ARACLARI: "true" })
    ).toThrow(/DEV_ARACLARI/)
    expect(envOku({ ...temel, SECRET_KEY: Buffer.alloc(32).toString("base64") }).PORT).toBe(3000)
  })
})

describe("iş kuyruğu (pg-boss)", () => {
  it("tanımlanan iş kuyruğa atılınca çalışır", async () => {
    const t = await testUygulamasi({ JOB_WORKERS: "true" })
    try {
      const kuyruk = t.app.get(IsKuyrugu)
      // tanimla normalde onModuleInit'te çağrılır; test için açılıştan sonra elle bağlanır
      const calisti = new Promise<object>((coz) => {
        kuyruk.tanimla<{ deger: number }>(
          "test-isi",
          async ([is]) => coz(is!.data),
          { pollingIntervalSeconds: 0.5 }
        )
      })
      await kuyruk.onApplicationBootstrap()
      await kuyruk.gonder("test-isi", { deger: 42 })
      await expect(calisti).resolves.toEqual({ deger: 42 })
    } finally {
      await t.kapat()
    }
  }, 60_000)
})
