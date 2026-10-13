import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import { createSeed } from "@prime/mock-data/seed"
import type { TakvimOlayi, TakvimOzetResponse } from "@prime/shared/types/api"

import { aktivite, bildirim, mukellef, takvimDurum } from "../src/db/schema/index.js"
import { SeedYukleyici } from "../src/dev/seed-yukleyici.js"
import { BeyanDurumuService } from "../src/takvim/beyan-durumu.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const eylul = "baslangic=2026-09-01&bitis=2026-09-30"
const id = encodeURIComponent("m_ltd:KDV:2026-07")

describe("takvim", () => {
  let t: TestUygulamasi
  let mehmet: Istemci // p_2
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    mehmet = t.istemci(await t.girisYap(PERSONEL[1]!.id))
  })

  const liste = async (sorgu: string) => {
    const r = await mehmet.get(`/takvim?${sorgu}`)
    expect(r.statusCode).toBe(200)
    return r.json<TakvimOlayi[]>()
  }
  const kayit = async () =>
    (await t.db.select().from(takvimDurum).where(eq(takvimDurum.mukellefId, "m_ltd")))[0]

  describe("GET /takvim", () => {
    it("aralıktaki yükümlülükleri mükellef bilgisiyle döner", async () => {
      const olaylar = await liste(eylul)
      expect(olaylar.filter((o) => o.mukellefId === "m_sahis").map((o) => o.tip)).toEqual(["KDV"])
      expect(olaylar.filter((o) => o.mukellefId === "m_ltd").map((o) => o.tip)).toEqual([
        "KDV",
        "MUHTASAR_SGK",
        "BA_BS",
        "E_DEFTER_BERAT",
      ])
      expect(olaylar.find((o) => o.id === "m_ltd:KDV:2026-08")).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        sorumluPersonelId: "p_3",
        sonTarih: "2026-09-28",
        durum: "BEKLIYOR",
        gecikti: false,
      })
    })

    it("son günü geçmiş ve onaylanmamış olay gecikmiş sayılır", async () => {
      const agustos = await liste("baslangic=2026-08-01&bitis=2026-08-31")
      expect(agustos.find((o) => o.id === "m_ltd:KDV:2026-07")).toMatchObject({
        sonTarih: "2026-08-28",
        gecikti: true,
      })
    })

    it("tip, tür, sorumlu, mükellef ve durum filtreleri", async () => {
      expect((await liste(`${eylul}&tip=KDV`)).every((o) => o.tip === "KDV")).toBe(true)
      const ikiTip = await liste(`${eylul}&tip=KDV&tip=BA_BS`)
      expect(new Set(ikiTip.map((o) => o.tip))).toEqual(new Set(["KDV", "BA_BS"]))
      expect((await liste(`${eylul}&tur=AS`)).every((o) => o.mukellefId === "m_as")).toBe(true)
      expect((await liste(`${eylul}&sorumlu=p_3`)).every((o) => o.mukellefId === "m_ltd")).toBe(
        true
      )
      const as = await liste(`${eylul}&mukellefId=m_as`)
      expect(as.length).toBeGreaterThan(0)
      expect(as.every((o) => o.mukellefId === "m_as")).toBe(true)

      const gecikenler = await liste("baslangic=2026-06-01&bitis=2026-09-30&durum=gecikti")
      expect(gecikenler.length).toBeGreaterThan(0)
      expect(gecikenler.every((o) => o.gecikti && o.sonTarih < "2026-09-23")).toBe(true)
    })

    it("pasif mükellef takvimde görünmez", async () => {
      await t.db.update(mukellef).set({ aktif: false }).where(eq(mukellef.id, "m_as"))
      expect((await liste(eylul)).some((o) => o.mukellefId === "m_as")).toBe(false)
    })

    it("geçersiz veya çok uzun aralık 400", async () => {
      for (const sorgu of [
        "baslangic=2026-09-30&bitis=2026-09-01",
        "baslangic=2025-01-01&bitis=2026-12-31",
        "baslangic=abc&bitis=2026-09-01",
        "",
      ]) {
        const r = await mehmet.get(`/takvim?${sorgu}`)
        expect(r.statusCode).toBe(400)
        expect(r.json().message).toEqual(expect.any(String))
      }
    })

    it("oturumsuz 401", async () => {
      expect((await t.istemci().get(`/takvim?${eylul}`)).statusCode).toBe(401)
    })
  })

  describe("PATCH /takvim/:id", () => {
    it("durumu kaydeder, gecikmeyi kaldırır ve aktivite + sorumluya bildirim yazar", async () => {
      const r = await mehmet.patch(`/takvim/${id}`, { durum: "ONAYLANDI" })
      expect(r.statusCode).toBe(200)
      expect(r.json()).toEqual({ id: "m_ltd:KDV:2026-07", durum: "ONAYLANDI" })
      expect(await kayit()).toMatchObject({
        tip: "KDV",
        donem: "2026-07",
        durum: "ONAYLANDI",
        guncelleyenId: "p_2",
      })

      const kdv = (await liste("baslangic=2026-08-01&bitis=2026-08-31")).find(
        (o) => o.id === "m_ltd:KDV:2026-07"
      )
      expect(kdv).toMatchObject({
        durum: "ONAYLANDI",
        gecikti: false,
        guncelleyenId: "p_2",
      })

      const [log] = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, "BEYAN_DURUMU_GUNCELLENDI"))
      expect(log).toMatchObject({
        mukellefId: "m_ltd",
        hedefTip: "TAKVIM",
        hedefId: "m_ltd:KDV:2026-07",
        aciklama: "KDV Temmuz 2026: Onaylandı",
      })
      const bildirimler = await t.db
        .select()
        .from(bildirim)
        .where(eq(bildirim.tur, "BEYAN_DURUMU_GUNCELLENDI"))
      expect(bildirimler.map((b) => b.aliciId)).toEqual(["p_3"])
    })

    it("Bekliyor'a çekmek kaydı siler", async () => {
      await mehmet.patch(`/takvim/${id}`, { durum: "HAZIRLANDI" })
      expect(await kayit()).toMatchObject({ durum: "HAZIRLANDI" })
      await mehmet.patch(`/takvim/${id}`, { durum: "BEKLIYOR" })
      expect(await kayit()).toBeUndefined()
    })

    it("mükellefe uygulanmayan yükümlülük 404, geçersiz durum 400, oturumsuz 401", async () => {
      const uygulanmaz = await mehmet.patch(
        `/takvim/${encodeURIComponent("m_sahis:KURUMLAR:2025")}`,
        { durum: "ONAYLANDI" }
      )
      expect(uygulanmaz.statusCode).toBe(404)
      expect(
        (
          await mehmet.patch("/takvim/m_yok:KDV:2026-07", {
            durum: "ONAYLANDI",
          })
        ).json()
      ).toEqual({
        message: "Mükellef bulunamadı",
      })
      expect((await mehmet.patch("/takvim/m_ltd:KDV:abc", { durum: "ONAYLANDI" })).statusCode).toBe(
        404
      )
      expect((await mehmet.patch(`/takvim/${id}`, { durum: "BITTI" })).statusCode).toBe(400)
      expect((await mehmet.patch(`/takvim/${id}`)).statusCode).toBe(400)
      expect((await t.istemci().patch(`/takvim/${id}`, { durum: "ONAYLANDI" })).statusCode).toBe(
        401
      )
    })
  })

  describe("BeyanDurumuService — yalnızca ileri", () => {
    it("geri ve aynı yöne yazmaz; ileri yazar", async () => {
      const s = t.app.get(BeyanDurumuService)
      const anahtar = "m_ltd:KDV:2026-07"
      expect(await s.yaz(anahtar, "HAZIRLANDI", "p_2", { yalnizIleri: true })).toBe(true)
      expect(await s.yaz(anahtar, "HAZIRLANDI", "p_2", { yalnizIleri: true })).toBe(false)
      expect(
        await s.yaz(anahtar, "ONAYLANDI", "p_2", {
          yalnizIleri: true,
          aciklamaEki: " (test)",
        })
      ).toBe(true)
      expect(await s.yaz(anahtar, "HAZIRLANDI", "p_2", { yalnizIleri: true })).toBe(false)
      expect(await s.yaz(anahtar, "BEKLIYOR", "p_2", { yalnizIleri: true })).toBe(false)
      expect(await s.oku(anahtar)).toBe("ONAYLANDI")
      const loglar = await t.db
        .select({ aciklama: aktivite.aciklama })
        .from(aktivite)
        .where(eq(aktivite.eylem, "BEYAN_DURUMU_GUNCELLENDI"))
      expect(loglar.map((l) => l.aciklama).sort()).toEqual([
        "KDV Temmuz 2026: Hazırlandı",
        "KDV Temmuz 2026: Onaylandı (test)",
      ])
    })
  })

  describe("GET /takvim/ozet", () => {
    it("bu hafta, gecikenler, onay bekleyenler ve personel dağılımı", async () => {
      await mehmet.patch(`/takvim/${encodeURIComponent("m_as:KDV:2026-08")}`, {
        durum: "HAZIRLANDI",
      })
      const ozet = (await mehmet.get("/takvim/ozet")).json<TakvimOzetResponse>()

      expect(ozet.bugun).toBe("2026-09-23")
      expect(ozet.buHafta.map((o) => o.id).sort()).toEqual(
        [
          "m_sahis:KDV:2026-08",
          "m_as:BA_BS:2026-08",
          "m_as:E_DEFTER_BERAT:2026-06",
          "m_as:KDV:2026-08",
          "m_as:MUHTASAR_SGK:2026-08",
          "m_ltd:BA_BS:2026-08",
          "m_ltd:E_DEFTER_BERAT:2026-06",
          "m_ltd:KDV:2026-08",
          "m_ltd:MUHTASAR_SGK:2026-08",
        ].sort()
      )
      expect(ozet.geciken.length).toBeGreaterThan(0)
      expect(ozet.geciken.every((o) => o.gecikti)).toBe(true)
      expect(ozet.onayBekleyen).toBe(1)
      expect(ozet.yogunluk).toHaveLength(14)
      expect(ozet.yogunluk[0]!.tarih).toBe("2026-09-23")
      expect(ozet.personel.find((p) => p.personelId === "p_3")!.acik).toBeGreaterThan(0)
    })

    it("sorumlu filtresiyle yalnızca o personelin mükellefleri", async () => {
      const ozet = (await mehmet.get("/takvim/ozet?sorumlu=p_3")).json<TakvimOzetResponse>()
      const hepsi = [...ozet.buHafta, ...ozet.geciken]
      expect(hepsi.length).toBeGreaterThan(0)
      expect(hepsi.every((o) => o.sorumluPersonelId === "p_3")).toBe(true)
    })
  })

  describe("seed durumları", () => {
    it("deterministik; geçmiş dönemlerin çoğu onaylı, bir kısmı gecikmiş", async () => {
      expect(createSeed().takvim).toEqual(createSeed().takvim)
      await t.app.get(SeedYukleyici).sifirla()
      mehmet = t.istemci(await t.girisYap(PERSONEL[1]!.id))
      const yaz = await liste("baslangic=2026-06-01&bitis=2026-08-31")
      const onayli = yaz.filter((o) => o.durum === "ONAYLANDI").length
      expect(onayli / yaz.length).toBeGreaterThan(0.8)
      expect(yaz.some((o) => o.gecikti)).toBe(true)
    })
  })
})
