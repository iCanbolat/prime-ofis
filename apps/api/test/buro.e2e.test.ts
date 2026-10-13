import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { BURO, PERSONEL } from "@prime/mock-data/factories/personel"

import { bildirim, buro } from "../src/db/schema/index.js"
import { testUygulamasi, type TestUygulamasi } from "./harness.js"

describe("büro", () => {
  let t: TestUygulamasi
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())
  beforeEach(() => t.fixtureYukle())

  it("GET /buro büro bilgisini döner; boş isteğe bağlı alanlar yanıtta yok", async () => {
    const c = t.istemci(await t.girisYap("p_2"))
    const yanit = await c.get("/buro")
    expect(yanit.json()).toEqual(BURO)
    expect(yanit.json()).not.toHaveProperty("iban")
  })

  it("büro yoksa (kurulum yapılmadı) 404", async () => {
    const c = t.istemci(await t.girisYap("p_1"))
    await t.db.delete(buro)
    const yanit = await c.get("/buro")
    expect(yanit.statusCode).toBe(404)
    expect(yanit.json()).toEqual({ message: "Büro bilgisi bulunamadı" })
  })

  it("şablonları yalnızca yönetici değiştirir", async () => {
    const c = t.istemci(await t.girisYap("p_2"))
    const yanit = await c.put("/buro/sablonlar", { TALEP: "x {link}" })
    expect(yanit.statusCode).toBe(403)
    expect(yanit.json()).toEqual({
      message: "Mesaj şablonlarını yalnızca yönetici değiştirebilir",
    })
  })

  it("şablon güncellenir; gönderilmeyen tür korunur; herkese yayın bildirimi", async () => {
    const c = t.istemci(await t.girisYap("p_1"))
    const yanit = await c.put("/buro/sablonlar", { TALEP: "  Merhaba {unvan}, {link}  " })
    expect(yanit.statusCode).toBe(200)
    expect(yanit.json().mesajSablonlari).toEqual({
      ...BURO.mesajSablonlari,
      TALEP: "Merhaba {unvan}, {link}",
    })
    const bildirimler = await t.db.select().from(bildirim)
    expect(bildirimler).toMatchObject([
      { tur: "SABLON_GUNCELLENDI", aliciId: null, link: "/ayarlar/sablonlar", okuyanlar: ["p_1"] },
    ])

    const z = t.istemci(await t.girisYap(PERSONEL[2]!.id))
    const liste = (await z.get("/bildirim")).json()
    expect(liste.okunmamis).toBe(1)
  })

  it("geçersiz şablon 400", async () => {
    const c = t.istemci(await t.girisYap("p_1"))
    const bos = await c.put("/buro/sablonlar", { TALEP: "  " })
    expect(bos.json()).toEqual({ message: "Şablon boş olamaz" })
    const eksik = await c.put("/buro/sablonlar", { TALEP: "link yok" })
    expect(eksik.json()).toEqual({ message: "Şablon {link} değişkenini içermeli" })
  })
})
