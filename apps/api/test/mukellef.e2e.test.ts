import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { DEMO_GIRIS_SIFRESI, PERSONEL } from "@prime/mock-data/factories/personel"
import { FIXTURE_MUKELLEFLER, FIXTURE_UCRETLER } from "@prime/mock-data/fixtures"
import { formValuesToInput, mukellefToFormValues } from "@prime/shared/mukellef/schemas"
import type {
  MukellefInput,
  MukellefListResponse,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type { Mukellef } from "@prime/shared/types/domain"

import { aktivite, bildirim, mukellef } from "../src/db/schema/index.js"
import { SeedYukleyici } from "../src/dev/seed-yukleyici.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const [SAHIS, LTD] = FIXTURE_MUKELLEFLER as [Mukellef, Mukellef]
const girdi = (m: Mukellef) => formValuesToInput(mukellefToFormValues(m))
const yeniSahis = (): MukellefInput => ({
  ...girdi(SAHIS),
  unvan: "Yeni Şahıs",
  tckn: "60465985014",
})

describe("mükellef", () => {
  let t: TestUygulamasi
  let mehmet: Istemci // p_2 (PERSONEL)
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  const liste = async (sorgu = "") =>
    (await mehmet.get(`/mukellefler${sorgu}`)).json<MukellefListResponse>()
  const aktiviteler = (eylem: string) =>
    t.db.select().from(aktivite).where(eq(aktivite.eylem, eylem as never))

  describe("GET /mukellefler — sayfalama, sıralama, durum (40 kayıtlık seed)", () => {
    beforeAll(async () => {
      await t.app.get(SeedYukleyici).sifirla()
      mehmet = t.istemci(await t.girisYap(PERSONEL[1]!.id))
    })

    it("sayfa parametresi yoksa tüm kayıtları döner", async () => {
      const r = await liste()
      expect(r.items).toHaveLength(40)
      expect(r).toMatchObject({ total: 40, sayfa: 1, sayfaBoyutu: 40 })
    })

    it("sayfalar ve toplamı döner; son sayfa aşılırsa son sayfaya sabitlenir", async () => {
      const s1 = await liste("?sayfa=1&sayfaBoyutu=15")
      const s2 = await liste("?sayfa=2&sayfaBoyutu=15")
      const s3 = await liste("?sayfa=3&sayfaBoyutu=15")
      expect(s1.items).toHaveLength(15)
      expect(s3.items).toHaveLength(10)
      expect(s3.total).toBe(40)
      expect((await liste("?sayfa=99&sayfaBoyutu=15")).sayfa).toBe(3)
      expect(new Set([...s1.items, ...s2.items, ...s3.items].map((m) => m.id)).size).toBe(40)
    })

    it("unvana göre azalan (Türkçe) ve kayıt tarihine göre sıralar", async () => {
      const desc = (await liste("?yon=desc")).items.map((m) => m.unvan)
      expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a, "tr-TR")))
      const tarih = (await liste("?sirala=olusturmaTarihi")).items.map((m) => m.olusturmaTarihi)
      expect(tarih).toEqual([...tarih].sort())
    })

    it("durum, tür (tekrarlı anahtar), sorumlu ve arama filtreleri", async () => {
      const aktif = await liste("?durum=aktif")
      const pasif = await liste("?durum=pasif")
      expect(aktif.total + pasif.total).toBe(40)
      expect(aktif.items.every((m) => m.aktif)).toBe(true)
      expect(pasif.items.every((m) => !m.aktif)).toBe(true)

      const sirket = await liste("?tur=LTD&tur=AS")
      expect(sirket.total).toBeGreaterThan(0)
      expect(sirket.items.every((m) => m.tur !== "SAHIS")).toBe(true)

      const p3 = await liste("?sorumlu=p_3")
      expect(p3.items.every((m) => m.sorumluPersonelId === "p_3")).toBe(true)

      const ornek = aktif.items[0]!
      const kelime = ornek.unvan.split(" ")[0]!.toLocaleUpperCase("tr-TR")
      expect((await liste(`?q=${encodeURIComponent(kelime)}`)).items.map((m) => m.id)).toContain(
        ornek.id
      )
      const no = (ornek.vkn ?? ornek.tckn)!.slice(0, 6)
      expect((await liste(`?q=${no}`)).items.map((m) => m.id)).toContain(ornek.id)
    })

    it("isteğe bağlı alanlar yanıtta null olarak görünmez", async () => {
      const sahis = (await liste("?tur=SAHIS")).items[0]!
      expect(sahis).not.toHaveProperty("vkn")
      expect(sahis).not.toHaveProperty("mersisNo")
    })
  })

  describe("yazma uçları (fixture)", () => {
    beforeEach(async () => {
      await t.fixtureYukle()
      mehmet = t.istemci(await t.girisYap(PERSONEL[1]!.id))
    })

    it("GET /:id kaydı döner (ücret dahil); olmayan 404", async () => {
      const r = await mehmet.get("/mukellefler/m_ltd")
      expect(r.json<Mukellef>().unvan).toBe(LTD.unvan)
      expect((await mehmet.get("/mukellefler/yok")).statusCode).toBe(404)
    })

    it("POST kaydı oluşturur, id/tarih atar ve aktivite + sorumluya bildirim yazar", async () => {
      const r = await mehmet.post("/mukellefler", { ...yeniSahis(), sorumluPersonelId: "p_3" })
      expect(r.statusCode).toBe(201)
      const created = r.json<Mukellef>()
      expect(created.id).toMatch(/^m_/)
      expect(created.olusturmaTarihi).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
      expect((await mehmet.get(`/mukellefler/${created.id}`)).json<Mukellef>().unvan).toBe(
        "Yeni Şahıs"
      )
      const loglar = (await aktiviteler("MUKELLEF_OLUSTURULDU")).filter(
        (a) => a.mukellefId === created.id
      )
      expect(loglar).toHaveLength(1)
      const bildirimler = await t.db
        .select()
        .from(bildirim)
        .where(eq(bildirim.mukellefId, created.id))
      expect(bildirimler.map((b) => b.aliciId)).toEqual(["p_3"])
    })

    it("formdan gelen ücret yok sayılır; tür dışı kimlik alanları atılır", async () => {
      const ltd = girdi(LTD)
      const r = await mehmet.post("/mukellefler", {
        ...ltd,
        unvan: "Yeni Ltd",
        vkn: "1234567890",
        tckn: "60465985014",
        ucret: { aylikBrut: 1, kdvOrani: 20, stopajVar: false, baslangicDonem: "2026-01" },
      })
      expect(r.statusCode).toBe(201)
      const created = r.json<Mukellef>()
      expect(created.tckn).toBeUndefined()
      expect(created.ucret).toBeUndefined()
      expect(created.defterTuru).toBe("BILANCO")
    })

    it("aynı TCKN ile ikinci kayıt 409 döner", async () => {
      const r = await mehmet.post("/mukellefler", { ...yeniSahis(), tckn: "10000000146" })
      expect(r.statusCode).toBe(409)
      expect(r.json().message).toContain("Ali Veli")
    })

    it("geçersiz VKN, bilinmeyen sorumlu, bozuk gövde 400 döner", async () => {
      const vkn = await mehmet.post("/mukellefler", { ...girdi(LTD), vkn: "0174520663" })
      expect(vkn.statusCode).toBe(400)
      expect(vkn.json().message).toBe("Geçerli bir VKN giriniz")
      const sorumlu = await mehmet.post("/mukellefler", { ...yeniSahis(), sorumluPersonelId: "p_99" })
      expect(sorumlu.json()).toEqual({ message: "Sorumlu personel bulunamadı" })
      const tur = await mehmet.post("/mukellefler", { ...yeniSahis(), tur: "KOOP" })
      expect(tur.json()).toEqual({ message: "Geçersiz mükellef türü" })
      const unvan = await mehmet.post("/mukellefler", { ...yeniSahis(), unvan: "  " })
      expect(unvan.json()).toEqual({ message: "Unvan zorunludur" })
      expect((await mehmet.post("/mukellefler", { tur: "SAHIS" })).statusCode).toBe(400)
    })

    it("oturum yoksa 401 döner", async () => {
      expect((await t.istemci().post("/mukellefler", yeniSahis())).statusCode).toBe(401)
      expect((await t.istemci().get("/mukellefler")).statusCode).toBe(401)
    })

    it("PUT günceller; kendi VKN'si çakışma sayılmaz, ücret ve oluşturma tarihi korunur", async () => {
      const r = await mehmet.put("/mukellefler/m_ltd", {
        ...girdi(LTD),
        unvan: "Çınar Yeni Unvan Ltd. Şti.",
        mersisNo: "",
      })
      expect(r.statusCode).toBe(200)
      const updated = r.json<Mukellef>()
      expect(updated.unvan).toBe("Çınar Yeni Unvan Ltd. Şti.")
      expect(updated.olusturmaTarihi).toBe(LTD.olusturmaTarihi)
      expect(updated.mersisNo).toBeUndefined()
      const [satir] = await t.db.select().from(mukellef).where(eq(mukellef.id, "m_ltd"))
      expect(satir?.ucret).toEqual(FIXTURE_UCRETLER.m_ltd)
      expect(satir?.ucret).toBeTruthy()
    })

    it("PUT başka mükellefin VKN'sini alamaz; olmayan kayıt 404", async () => {
      expect(
        (await mehmet.put("/mukellefler/m_ltd", { ...girdi(LTD), vkn: "9358005601" })).statusCode
      ).toBe(409)
      expect((await mehmet.put("/mukellefler/yok", girdi(LTD))).statusCode).toBe(404)
    })

    it("PUT sorumlu değişince yalnızca yeni sorumluya bildirim gider", async () => {
      await mehmet.put("/mukellefler/m_ltd", { ...girdi(LTD), sorumluPersonelId: "p_4" })
      const b = await t.db.select().from(bildirim).where(eq(bildirim.mukellefId, "m_ltd"))
      expect(b.map((x) => [x.aliciId, x.baslik])).toEqual([
        ["p_4", "Bir mükellefin sorumlusu oldunuz"],
      ])
    })

    it("toplu-atama seçilenlerin sorumlusunu değiştirir, her biri için aktivite yazar", async () => {
      const r = await mehmet.post("/mukellefler/toplu-atama", {
        ids: ["m_sahis", "m_as", "yok"],
        sorumluPersonelId: "p_4",
      })
      expect(r.statusCode).toBe(200)
      expect(r.json()).toEqual({ guncellenen: 2 })
      expect((await mehmet.get("/mukellefler/m_sahis")).json<Mukellef>().sorumluPersonelId).toBe(
        "p_4"
      )
      expect((await mehmet.get("/mukellefler/m_ltd")).json<Mukellef>().sorumluPersonelId).toBe(
        "p_3"
      )
      expect(await aktiviteler("MUKELLEF_GUNCELLENDI")).toHaveLength(2)
    })

    it("toplu-atama boş liste veya bilinmeyen personel 400", async () => {
      expect(
        (await mehmet.post("/mukellefler/toplu-atama", { ids: [], sorumluPersonelId: "p_4" }))
          .statusCode
      ).toBe(400)
      expect(
        (await mehmet.post("/mukellefler/toplu-atama", { ids: ["m_ltd"], sorumluPersonelId: "x" }))
          .statusCode
      ).toBe(400)
    })

    it("toplu içe aktarım: oluşturur, kayıtlıyı atlar, geçersizi satırıyla raporlar", async () => {
      const r = await mehmet.post("/mukellefler/toplu", {
        kayitlar: [
          { satir: 2, mukellef: yeniSahis() },
          { satir: 3, mukellef: { ...yeniSahis(), unvan: "Tekrar", tckn: "10000000146" } },
          { satir: 4, mukellef: { ...girdi(LTD), unvan: "Bozuk", vkn: "123" } },
        ],
      })
      expect(r.statusCode).toBe(200)
      expect(r.json<TopluAktarimSonucu>()).toEqual({
        olusturulan: 1,
        guncellenen: 0,
        atlanan: 1,
        hatalar: [{ satir: 4, mesaj: "Geçerli bir VKN giriniz" }],
      })
      const [log] = await aktiviteler("MUKELLEF_OLUSTURULDU")
      expect(log?.aciklama).toBe("Yeni Şahıs (içe aktarım)")
      expect(await t.db.select().from(bildirim)).toEqual([])
      expect((await mehmet.post("/mukellefler/toplu", { kayitlar: [] })).statusCode).toBe(400)
    })

    it("mükellef sorumlusu olan personel silinemez (409)", async () => {
      const yonetici = t.istemci(await t.girisYap(PERSONEL[0]!.id))
      const r = await yonetici.post("/personel/p_3/sil", { yoneticiSifresi: DEMO_GIRIS_SIFRESI })
      expect(r.statusCode).toBe(409)
      expect(r.json().message).toMatch(/1 mükellefin sorumlusu/)
    })

    it("GET /aktivite mükellefe göre filtreler", async () => {
      await mehmet.put("/mukellefler/m_ltd", girdi(LTD))
      await mehmet.put("/mukellefler/m_as", girdi(FIXTURE_MUKELLEFLER[2]!))
      const items = (await mehmet.get("/aktivite?mukellefId=m_ltd")).json<{ mukellefId: string }[]>()
      expect(items).toHaveLength(1)
      expect(
        await t.db
          .select()
          .from(aktivite)
          .where(and(eq(aktivite.mukellefId, "m_as"), eq(aktivite.aktorId, "p_2")))
      ).toHaveLength(1)
    })
  })
})
