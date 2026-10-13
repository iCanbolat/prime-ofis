import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { DEMO_GIRIS_SIFRESI, PERSONEL } from "@prime/mock-data/factories/personel"

import { aktivite, oturum, personel } from "../src/db/schema/index.js"
import { testUygulamasi, type TestUygulamasi } from "./harness.js"

const zeynep = PERSONEL[2]!

describe("auth", () => {
  let t: TestUygulamasi
  beforeAll(async () => {
    t = await testUygulamasi({ GIRIS_DENEME_SINIRI: "3" })
  })
  afterAll(() => t.kapat())
  beforeEach(async () => {
    t.saat.sabitle(null)
    await t.fixtureYukle()
  })

  const giris = (eposta: string, sifre: string, ip = "10.0.0.1") =>
    t.istek({
      method: "POST",
      url: "/api/auth/login",
      payload: { eposta, sifre },
      remoteAddress: ip,
    })

  it("login personeli döner, httpOnly cookie verir ve GIRIS aktivitesi yazar", async () => {
    const yanit = await giris(zeynep.eposta.toUpperCase(), DEMO_GIRIS_SIFRESI)
    expect(yanit.statusCode).toBe(200)
    expect(yanit.json()).toEqual({ personel: zeynep })
    const c = yanit.cookies.find((c) => c.name === "sid")!
    expect(c).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" })
    expect(c.value).toHaveLength(43)
    // Cookie'deki ham değer veritabanında yok (yalnızca özeti)
    const oturumlar = await t.db.select().from(oturum)
    expect(oturumlar).toHaveLength(1)
    expect(oturumlar[0]!.idHash).not.toBe(c.value)

    const girisler = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "GIRIS"))
    expect(girisler.map((a) => a.aktorId)).toEqual([zeynep.id])
  })

  it("bilinmeyen kullanıcı / hatalı şifre aynı 401, pasif kullanıcı 403", async () => {
    const yok = await giris("yok@primemusavirlik.com.tr", DEMO_GIRIS_SIFRESI)
    const yanlis = await giris(zeynep.eposta, "yanlis-sifre")
    expect(yok.statusCode).toBe(401)
    expect(yanlis.statusCode).toBe(401)
    expect(yok.json()).toEqual(yanlis.json())
    expect(yok.json()).toEqual({ message: "Kullanıcı veya şifre hatalı" })
    expect(await t.db.select().from(aktivite)).toHaveLength(0)

    await t.db.update(personel).set({ aktif: false }).where(eq(personel.id, "p_4"))
    const pasif = await giris(PERSONEL[3]!.eposta, DEMO_GIRIS_SIFRESI)
    expect(pasif.statusCode).toBe(403)
    expect(pasif.json()).toEqual({ message: "Bu kullanıcı pasif durumda" })
  })

  it("hatalı deneme sınırı IP + e-posta başına; başarılı giriş sayacı sıfırlar", async () => {
    await giris(zeynep.eposta, DEMO_GIRIS_SIFRESI, "10.0.0.9")
    for (let i = 0; i < 3; i++) {
      expect((await giris(zeynep.eposta, "yanlis", "10.0.0.2")).statusCode).toBe(401)
    }
    const engel = await giris(zeynep.eposta, DEMO_GIRIS_SIFRESI, "10.0.0.2")
    expect(engel.statusCode).toBe(429)
    expect(engel.json().message).toMatch(/Çok fazla hatalı giriş/)
    // Başka IP etkilenmez
    expect((await giris(zeynep.eposta, DEMO_GIRIS_SIFRESI, "10.0.0.3")).statusCode).toBe(200)
    // 15 dk sonra açılır
    t.saat.sabitle(new Date(Date.now() + 16 * 60_000))
    expect((await giris(zeynep.eposta, DEMO_GIRIS_SIFRESI, "10.0.0.2")).statusCode).toBe(200)
  })

  it("korumalı uç oturumsuz 401; /auth/me oturumun personelini döner", async () => {
    const yok = await t.istemci().get("/personel")
    expect(yok.statusCode).toBe(401)
    expect(yok.json()).toEqual({ message: "Oturum bulunamadı, lütfen tekrar giriş yapın" })
    expect((await t.istemci("sid=uydurma").get("/auth/me")).statusCode).toBe(401)

    const cookie = await t.girisYap(zeynep.id)
    const me = await t.istemci(cookie).get("/auth/me")
    expect(me.statusCode).toBe(200)
    expect(me.json()).toEqual({ personel: zeynep })
  })

  it("X-Actor-Id başlığı yok sayılır", async () => {
    const yanit = await t.istek({
      method: "GET",
      url: "/api/auth/me",
      headers: { "x-actor-id": "p_1" },
    })
    expect(yanit.statusCode).toBe(401)
  })

  it("logout oturumu siler, CIKIS yazar; oturumsuz da 204", async () => {
    const cookie = await t.girisYap(zeynep.id)
    const cikis = await t.istemci(cookie).post("/auth/logout")
    expect(cikis.statusCode).toBe(204)
    expect(cikis.cookies.find((c) => c.name === "sid")?.value).toBe("")
    expect((await t.istemci(cookie).get("/auth/me")).statusCode).toBe(401)
    const cikislar = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "CIKIS"))
    expect(cikislar).toHaveLength(1)

    expect((await t.istemci().post("/auth/logout")).statusCode).toBe(204)
  })

  it("süre kayar: kullanılan oturum uzar, kullanılmayan 12 saatte düşer", async () => {
    const basla = new Date("2026-09-23T07:00:00.000Z")
    t.saat.sabitle(basla)
    const cookie = await t.girisYap(zeynep.id)

    t.saat.sabitle(new Date(basla.getTime() + 11 * 3_600_000))
    const yenilenen = await t.istemci(cookie).get("/auth/me")
    expect(yenilenen.statusCode).toBe(200)
    expect(yenilenen.cookies.find((c) => c.name === "sid")?.maxAge).toBe(12 * 3600)

    t.saat.sabitle(new Date(basla.getTime() + 22 * 3_600_000))
    expect((await t.istemci(cookie).get("/auth/me")).statusCode).toBe(200)

    t.saat.sabitle(new Date(basla.getTime() + 35 * 3_600_000))
    expect((await t.istemci(cookie).get("/auth/me")).statusCode).toBe(401)
  })

  it("pasife alınan personelin oturumu geçersiz olur", async () => {
    const cookie = await t.girisYap(zeynep.id)
    await t.db.update(personel).set({ aktif: false }).where(eq(personel.id, zeynep.id))
    expect((await t.istemci(cookie).get("/auth/me")).statusCode).toBe(401)
  })

  it("CSRF: yabancı Origin ya da cross-site istek 403", async () => {
    const cookie = await t.girisYap(zeynep.id)
    const yabanci = await t.istek({
      method: "POST",
      url: "/api/bildirim/okundu",
      headers: { cookie, origin: "https://kotu.example" },
    })
    expect(yabanci.statusCode).toBe(403)
    expect(yabanci.json()).toEqual({ message: "İstek kaynağı doğrulanamadı" })

    const crossSite = await t.istek({
      method: "POST",
      url: "/api/bildirim/okundu",
      headers: { cookie, "sec-fetch-site": "cross-site" },
    })
    expect(crossSite.statusCode).toBe(403)

    const ayni = await t.istek({
      method: "POST",
      url: "/api/bildirim/okundu",
      headers: { cookie, origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
    })
    expect(ayni.statusCode).toBe(204)
    // GET serbest
    const get = await t.istek({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie, origin: "https://kotu.example" },
    })
    expect(get.statusCode).toBe(200)
  })
})
