import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  ArsivListResponse,
  GelenEvrakView,
  GelenSayacResponse,
  GorevDetay,
  TalepDetay,
  TalepView,
} from "@prime/shared/types/api"

import { aktivite, arsivDosya, bildirim, evrakTalebi, gelenEvrak, gorev } from "../src/db/schema/index.js"
import { arsivAnahtari, gelenAnahtari } from "../src/dosya/dosya.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const MEHMET = PERSONEL[1]!.id
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n")

describe("evrak talebi ve gelen evrak", () => {
  let t: TestUygulamasi
  let ben: Istemci
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    ben = t.istemci(await t.girisYap(MEHMET))
  })

  const eylemler = async (hedefId: string) =>
    (
      await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.hedefId, hedefId))
        .orderBy(sql`ctid`)
    ).map((a) => a.eylem)
  const talep = async (id: string) =>
    (await t.db.select().from(evrakTalebi).where(eq(evrakTalebi.id, id)))[0]!

  describe("evrak talepleri", () => {
    it("liste türetilmiş durum ve yükleme sayılarıyla döner, durum filtresi çalışır", async () => {
      const liste = (await ben.get("/evrak-talepleri")).json<TalepView[]>()
      expect(Object.fromEntries(liste.map((x) => [x.id, x.durum]))).toEqual({
        e_aktif: "AKTIF",
        e_sure: "SURESI_DOLDU",
        e_iptal: "IPTAL",
        e_tamam: "TAMAMLANDI",
      })
      expect(liste.map((x) => x.olusturmaTarihi)).toEqual(
        liste.map((x) => x.olusturmaTarihi).sort().reverse()
      )
      expect(liste.find((x) => x.id === "e_aktif")).toMatchObject({
        yuklemeSayisi: 1,
        bekleyenSayisi: 1,
        mukellefUnvan: expect.stringContaining("Çınar"),
        olusturan: { id: "p_3" },
      })
      expect(liste.find((x) => x.id === "e_tamam")).toMatchObject({
        yuklemeSayisi: 2,
        bekleyenSayisi: 0,
      })
      const sure = (await ben.get("/evrak-talepleri?durum=SURESI_DOLDU")).json<TalepView[]>()
      expect(sure.map((x) => x.id)).toEqual(["e_sure"])
      const ltd = (await ben.get("/evrak-talepleri?mukellefId=m_ltd")).json<TalepView[]>()
      expect(ltd.map((x) => x.id)).toEqual(["e_aktif"])
      const ara = (await ben.get(`/evrak-talepleri?q=${encodeURIComponent("kira")}`)).json<TalepView[]>()
      expect(ara.map((x) => x.id)).toEqual(["e_iptal"])
    })

    it("detay gelenleri yeniden eskiye döner; yoksa 404", async () => {
      const d = (await ben.get("/evrak-talepleri/e_tamam")).json<TalepDetay>()
      expect(d.gelenler.map((g) => g.id).sort()).toEqual(["g_onayli", "g_red"])
      expect(d.musteriNotu).toBe("Faturaların tamamı ekte.")
      expect((await ben.get("/evrak-talepleri/yok")).statusCode).toBe(404)
    })

    it("oluşturma: rastgele token, 7 gün sonra gün sonu, aktivite kaydı", async () => {
      const y = await ben.post("/evrak-talepleri", {
        mukellefId: "m_sahis",
        istenenler: ["BANKA_EKSTRESI", "FIS_FATURA", "FIS_FATURA"],
        donem: "2026-08",
        aciklama: "  Ekstreler PDF olsun  ",
        kanal: "WHATSAPP",
        gecerlilikGun: 7,
      })
      expect(y.statusCode).toBe(201)
      const x = y.json<TalepView>()
      expect(x.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(x.istenenler).toEqual(["FIS_FATURA", "BANKA_EKSTRESI"])
      expect(x).toMatchObject({
        durum: "AKTIF",
        aciklama: "Ekstreler PDF olsun",
        olusturanId: MEHMET,
        gonderimler: [],
        yuklemeSayisi: 0,
      })
      expect(new Date(x.sonKullanma)).toEqual(new Date(2026, 8, 30, 23, 59, 59))
      expect(await eylemler(x.id)).toEqual(["TALEP_OLUSTURULDU"])

      const hata = async (over: Record<string, unknown>) =>
        (
          await ben.post("/evrak-talepleri", {
            mukellefId: "m_sahis",
            istenenler: ["KIMLIK"],
            kanal: "EPOSTA",
            gecerlilikGun: 7,
            ...over,
          })
        ).statusCode
      expect(await hata({ istenenler: [] })).toBe(400)
      expect(await hata({ istenenler: ["YOK"] })).toBe(400)
      expect(await hata({ kanal: "SMS" })).toBe(400)
      expect(await hata({ donem: "2026-13" })).toBe(400)
      expect(await hata({ gecerlilikGun: 61 })).toBe(400)
      expect(await hata({ gecerlilikGun: 0 })).toBe(400)
      expect(await hata({ mukellefId: "m_yok" })).toBe(404)
    })

    it("gönderim kaydedilir; süresi dolmuş talep gönderilemez ama uzatılabilir", async () => {
      const g = (
        await ben.post("/evrak-talepleri/e_aktif/gonderim", { kanal: "EPOSTA" })
      ).json<TalepView>()
      expect(g.gonderimler).toHaveLength(2)
      expect(g.gonderimler[1]).toMatchObject({ kanal: "EPOSTA", gonderenId: MEHMET })
      expect(g.kanal).toBe("EPOSTA")
      expect((await ben.post("/evrak-talepleri/e_aktif/gonderim", { kanal: "SMS" })).statusCode).toBe(400)
      expect((await ben.post("/evrak-talepleri/e_sure/gonderim", { kanal: "EPOSTA" })).statusCode).toBe(409)

      const uzatilan = (await ben.post("/evrak-talepleri/e_sure/uzat", { gun: 7 })).json<TalepView>()
      expect(uzatilan.durum).toBe("AKTIF")
      expect(new Date(uzatilan.sonKullanma)).toEqual(new Date(2026, 8, 30, 23, 59, 59))
      // Dolmamış talep mevcut son günden itibaren uzar
      const aktif = (await ben.post("/evrak-talepleri/e_aktif/uzat", { gun: 3 })).json<TalepView>()
      expect(new Date(aktif.sonKullanma)).toEqual(new Date(2026, 9, 3, 23, 59, 59))
      expect((await ben.post("/evrak-talepleri/e_aktif/uzat", { gun: 99 })).statusCode).toBe(400)
      expect((await ben.post("/evrak-talepleri/e_iptal/uzat", { gun: 7 })).statusCode).toBe(409)
      expect(await eylemler("e_sure")).toEqual(["TALEP_UZATILDI"])
    })

    it("iptal ve yeniden açma", async () => {
      expect((await ben.post("/evrak-talepleri/e_aktif/iptal")).json<TalepView>().durum).toBe("IPTAL")
      expect((await ben.post("/evrak-talepleri/e_aktif/iptal")).statusCode).toBe(409)
      // İptal edilen talebin dosyaları gelen kutusunda görünmez
      expect((await ben.get("/gelen-evrak/sayac")).json<GelenSayacResponse>().bekleyen).toBe(0)
      expect((await ben.get("/gelen-evrak")).json<GelenEvrakView[]>().map((g) => g.id)).not.toContain(
        "g_bekleyen"
      )

      expect((await ben.post("/evrak-talepleri/e_aktif/yeniden-ac")).statusCode).toBe(409)
      const acik = (await ben.post("/evrak-talepleri/e_tamam/yeniden-ac")).json<TalepView>()
      expect(acik.durum).toBe("AKTIF")
      expect(acik.tamamlanmaTarihi).toBeUndefined()
      expect(new Date(acik.sonKullanma)).toEqual(new Date(2026, 8, 30, 23, 59, 59))
      expect(await eylemler("e_tamam")).toEqual(["TALEP_YENIDEN_ACILDI"])
    })

    it("görevler talebe bağlanır: detayda özet; başka mükellefin talebi 400", async () => {
      const [g] = await t.db.select().from(gorev).where(eq(gorev.mukellefId, "m_ltd")).limit(1)
      expect(g).toBeDefined()
      const ok = await ben.patch(`/gorevler/${g!.id}`, { bagliTalepIdler: ["e_aktif"] })
      expect(ok.statusCode).toBe(200)
      const detay = (await ben.get(`/gorevler/${g!.id}`)).json<GorevDetay>()
      expect(detay.bagliTalepler).toEqual([
        {
          id: "e_aktif",
          durum: "AKTIF",
          istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
          donem: "2026-08",
          olusturmaTarihi: expect.any(String),
        },
      ])
      expect((await ben.patch(`/gorevler/${g!.id}`, { bagliTalepIdler: ["e_iptal"] })).statusCode).toBe(
        400
      )
    })
  })

  describe("gelen evrak", () => {
    it("liste, filtreler ve sayaç", async () => {
      const tumu = (await ben.get("/gelen-evrak")).json<GelenEvrakView[]>()
      expect(tumu.map((g) => g.id).sort()).toEqual(["g_bekleyen", "g_onayli", "g_red"])
      expect(tumu.find((g) => g.id === "g_bekleyen")).toMatchObject({
        mukellefUnvan: expect.stringContaining("Çınar"),
        talep: { id: "e_aktif", donem: "2026-08", kanal: "WHATSAPP" },
      })
      expect((await ben.get("/gelen-evrak?durum=BEKLIYOR")).json<GelenEvrakView[]>()).toHaveLength(1)
      expect((await ben.get("/gelen-evrak?talepId=e_tamam")).json<GelenEvrakView[]>()).toHaveLength(2)
      expect((await ben.get("/gelen-evrak?mukellefId=m_ltd")).json<GelenEvrakView[]>()).toHaveLength(1)
      expect((await ben.get("/gelen-evrak/sayac")).json()).toEqual({ bekleyen: 1 })
      expect((await t.istemci().get("/gelen-evrak/sayac")).statusCode).toBe(401)
    })

    it("onay → dosya arşive doğru kategoride, içerik kopyalanmış olarak kaydedilir", async () => {
      await t.depo.koy(gelenAnahtari("e_aktif", "g_bekleyen"), PDF, "application/pdf")
      const y = await ben.post("/gelen-evrak/g_bekleyen/onayla", {
        kategori: "DIGER",
        ad: "  Ağustos faturaları.pdf ",
      })
      expect(y.statusCode).toBe(200)
      const onayli = y.json<GelenEvrakView>()
      expect(onayli).toMatchObject({ durum: "ONAYLANDI", inceleyenId: MEHMET })

      const { items } = (
        await ben.get("/arsiv?mukellefId=m_ltd&kategori=DIGER")
      ).json<ArsivListResponse>()
      expect(items.map((d) => d.ad)).toEqual(["Ağustos faturaları.pdf"])
      expect(items[0]).toMatchObject({ id: onayli.arsivDosyaId, mimeType: "application/pdf", boyut: 320_000 })
      expect(t.depo.nesneler.get(arsivAnahtari("m_ltd", items[0]!.id))?.icerik).toEqual(PDF)
      // Kaynak dosya gelen kutusunda kalır (müşteri portalında görünmeye devam eder)
      expect(t.depo.nesneler.has(gelenAnahtari("e_aktif", "g_bekleyen"))).toBe(true)

      expect(await eylemler("g_bekleyen")).toEqual(["EVRAK_ONAYLANDI"])
      expect(await eylemler(items[0]!.id)).toEqual([])
      // Onay bildirim üretmez (kural tablosunda yok)
      expect(await t.db.$count(bildirim, eq(bildirim.hedefId, "g_bekleyen"))).toBe(0)

      expect((await ben.post("/gelen-evrak/g_bekleyen/onayla", { kategori: "DIGER", ad: "x" })).statusCode).toBe(
        409
      )
      expect(
        await t.db.$count(
          arsivDosya,
          and(eq(arsivDosya.mukellefId, "m_ltd"), eq(arsivDosya.kategori, "DIGER"))
        )
      ).toBe(1)
    })

    it("eşzamanlı iki onaydan biri geçer; kaybedenin arşiv kopyası silinir", async () => {
      await t.depo.koy(gelenAnahtari("e_aktif", "g_bekleyen"), PDF, "application/pdf")
      const sonuclar = await Promise.all(
        [1, 2].map((i) =>
          ben.post("/gelen-evrak/g_bekleyen/onayla", { kategori: "DIGER", ad: `kopya ${i}` })
        )
      )
      expect(sonuclar.map((r) => r.statusCode).sort()).toEqual([200, 409])
      const arsivNesneleri = [...t.depo.nesneler.keys()].filter((k) => k.startsWith("arsiv/m_ltd/"))
      expect(arsivNesneleri).toHaveLength(1)
      expect(await eylemler("g_bekleyen")).toEqual(["EVRAK_ONAYLANDI"])
    })

    it("dönemli talepten gelen bordro evrakı döneme ve belge türüne bağlanır", async () => {
      await t.db.insert(gelenEvrak).values({
        id: "g_puantaj",
        talepId: "e_aktif",
        mukellefId: "m_ltd",
        istenen: "PUANTAJ",
        ad: "puantaj.pdf",
        mimeType: "application/pdf",
        boyut: 1000,
        yuklemeTarihi: "2026-09-22T10:00:00.000Z",
        durum: "BEKLIYOR",
      })
      // Kaynak nesne yok (seed gibi): production dışında nesnesiz kayıt, içerik placeholder
      const onayli = (
        await ben.post("/gelen-evrak/g_puantaj/onayla", { kategori: "BORDRO", ad: "Puantaj" })
      ).json<GelenEvrakView>()
      const [d] = await t.db.select().from(arsivDosya).where(eq(arsivDosya.id, onayli.arsivDosyaId!))
      expect(d).toMatchObject({ donem: "2026-08", bordroBelge: "PUANTAJ", kategori: "BORDRO" })
      const icerik = await ben.get(`/arsiv/${d!.id}/icerik`)
      expect(icerik.json<{ dataUrl: string }>().dataUrl).toMatch(/^data:application\/pdf/)
    })

    it("onay doğrulaması; yoksa 404", async () => {
      const durum = async (body: unknown) =>
        (await ben.post("/gelen-evrak/g_bekleyen/onayla", body)).statusCode
      expect(await durum({ kategori: "X", ad: "a" })).toBe(400)
      expect(await durum({ kategori: "DIGER", ad: " " })).toBe(400)
      expect(await durum({ kategori: "IMZA_SIRKULERI", ad: "a", gecerlilikTarihi: "x" })).toBe(400)
      expect((await ben.post("/gelen-evrak/yok/onayla", { kategori: "DIGER", ad: "a" })).statusCode).toBe(404)
      expect(t.depo.nesneler.size).toBe(0)
    })

    it("red → REDDEDILDI ve neden; yenidenAc tamamlanmış talebi aktif eder", async () => {
      await t.db.insert(gelenEvrak).values({
        id: "g_yeni",
        talepId: "e_tamam",
        mukellefId: "m_as",
        istenen: "FIS_FATURA",
        ad: "fatura.jpg",
        mimeType: "image/jpeg",
        boyut: 1000,
        yuklemeTarihi: "2026-09-22T10:00:00.000Z",
        durum: "BEKLIYOR",
      })
      expect((await ben.post("/gelen-evrak/g_yeni/reddet", { neden: " " })).statusCode).toBe(400)
      const red = (
        await ben.post("/gelen-evrak/g_yeni/reddet", { neden: "Okunmuyor", yenidenAc: true })
      ).json<GelenEvrakView>()
      expect(red).toMatchObject({ durum: "REDDEDILDI", redNedeni: "Okunmuyor", inceleyenId: MEHMET })
      const x = await talep("e_tamam")
      expect(x.durum).toBe("AKTIF")
      expect(x.tamamlanmaTarihi).toBeNull()
      expect(await eylemler("g_yeni")).toEqual(["EVRAK_REDDEDILDI"])
      expect((await ben.post("/gelen-evrak/g_yeni/reddet", { neden: "x" })).statusCode).toBe(409)
    })

    it("iptal edilmiş talepte red talebi yeniden açmaz", async () => {
      await t.db
        .update(evrakTalebi)
        .set({ durum: "IPTAL" })
        .where(eq(evrakTalebi.id, "e_aktif"))
      await ben.post("/gelen-evrak/g_bekleyen/reddet", { neden: "Eksik", yenidenAc: true })
      expect((await talep("e_aktif")).durum).toBe("IPTAL")
    })

    it("içerik erişim kaydıyla döner", async () => {
      await t.depo.koy(gelenAnahtari("e_aktif", "g_bekleyen"), PDF, "application/pdf")
      const y = (await ben.get("/gelen-evrak/g_bekleyen/icerik")).json<{ dataUrl: string }>()
      expect(y.dataUrl).toBe(`data:application/pdf;base64,${PDF.toString("base64")}`)
      expect(await eylemler("g_bekleyen")).toEqual(["DOSYA_GORUNTULENDI"])
      expect((await ben.get("/gelen-evrak/yok/icerik")).statusCode).toBe(404)
    })
  })
})
