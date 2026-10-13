import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { AktiviteKaydi } from "@prime/shared/types/api"

import { AktiviteService } from "../src/aktivite/aktivite.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

describe("GET /aktivite", () => {
  let t: TestUygulamasi
  let c: Istemci
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())
  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle("2026-09-23T07:00:00.000Z")
    c = t.istemci(await t.girisYap("p_2"))
    const a = t.app.get(AktiviteService)
    const kayitlar = [
      { aktorId: "p_1", eylem: "ARSIV_YUKLENDI", hedefId: "d_1", mukellefId: "m_ltd" },
      { aktorId: "sistem", eylem: "BEYAN_DURUMU_GUNCELLENDI", mukellefId: "m_ltd" },
      { aktorId: "p_3", eylem: "DOSYA_INDIRILDI", hedefId: "d_1", mukellefId: "m_as" },
    ] as const
    for (const [i, k] of kayitlar.entries()) {
      t.saat.sabitle(`2026-09-23T${String(8 + i).padStart(2, "0")}:00:00.000Z`)
      await a.log({ ...k }, false)
    }
  })

  const getir = async (sorgu = "") => (await c.get(`/aktivite${sorgu}`)).json<AktiviteKaydi[]>()

  it("en yeni önce; aktör özeti; personel olmayan aktörde null", async () => {
    const liste = await getir()
    expect(liste.map((a) => a.eylem)).toEqual([
      "DOSYA_INDIRILDI",
      "BEYAN_DURUMU_GUNCELLENDI",
      "ARSIV_YUKLENDI",
      "GIRIS",
    ])
    expect(liste[0]).toMatchObject({
      aktor: { id: "p_3", ad: "Zeynep", soyad: "Demir", renk: "amber" },
      zaman: "2026-09-23T10:00:00.000Z",
    })
    expect(liste[1]!.aktor).toBeNull()
    // Boş alanlar yanıtta yok
    expect(liste[1]).not.toHaveProperty("hedefId")
  })

  it("mükellef, hedef, virgüllü eylem filtresi ve limit", async () => {
    expect((await getir("?mukellefId=m_ltd")).map((a) => a.eylem)).toEqual([
      "BEYAN_DURUMU_GUNCELLENDI",
      "ARSIV_YUKLENDI",
    ])
    expect((await getir("?hedefId=d_1")).map((a) => a.aktorId)).toEqual(["p_3", "p_1"])
    expect(
      (await getir("?eylem=ARSIV_YUKLENDI,DOSYA_INDIRILDI")).map((a) => a.eylem)
    ).toEqual(["DOSYA_INDIRILDI", "ARSIV_YUKLENDI"])
    expect(await getir("?limit=1")).toHaveLength(1)
    expect((await getir("?limit=500")).length).toBeLessThanOrEqual(100)
  })
})
