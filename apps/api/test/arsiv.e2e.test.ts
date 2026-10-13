import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  ArsivAgacResponse,
  ArsivDosyaView,
  ArsivIcerikResponse,
  ArsivListResponse,
  ArsivOzetResponse,
  ArsivYukleRequest,
} from "@prime/shared/types/api"

import { aktivite, arsivDosya } from "../src/db/schema/index.js"
import { arsivAnahtari } from "../src/dosya/dosya.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const MEHMET = PERSONEL[1]!.id

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const PDF = `data:application/pdf;base64,${Buffer.from(
  "%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"
).toString("base64")}`

const yukleme = (over: Partial<ArsivYukleRequest> = {}): ArsivYukleRequest => ({
  mukellefId: "m_ltd",
  kategori: "IMZA_SIRKULERI",
  ad: "imza.png",
  mimeType: "image/png",
  boyut: 68,
  gecerlilikTarihi: "2027-01-01",
  dataUrl: PNG,
  ...over,
})

describe("arşiv", () => {
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

  const sorgu = (p: Record<string, unknown>) =>
    new URLSearchParams(Object.entries(p).map(([k, v]): [string, string] => [k, String(v)])).toString()
  const sayfali = async (p: Record<string, unknown> = {}) =>
    (await ben.get(`/arsiv?${sorgu(p)}`)).json<ArsivListResponse>()
  const liste = async (p: Record<string, unknown> = {}) => (await sayfali(p)).items
  const yukle = async (over: Partial<ArsivYukleRequest> = {}) => {
    const y = await ben.post("/arsiv", yukleme(over))
    expect(y.statusCode).toBe(201)
    return y.json<ArsivDosyaView>()
  }

  describe("GET /arsiv", () => {
    it("çöp kutusundakiler hariç listeler, mükellef ve kategoriye göre filtreler", async () => {
      expect(await liste()).toHaveLength(8)
      const ltd = await liste({ mukellefId: "m_ltd" })
      expect(ltd.map((d) => d.id).sort()).toEqual(["d_ltd_faaliyet", "d_ltd_gazete", "d_ltd_levha"])
      expect(ltd[0]).toMatchObject({ mukellefUnvan: expect.stringContaining("Çınar") })
      expect(await liste({ kategori: "VERGI_LEVHASI" })).toHaveLength(3)
      expect((await liste({ cop: true })).map((d) => d.id)).toEqual(["d_sahis_cop"])
    })

    it("arama dosya adı ve mükellef unvanında Türkçe duyarlı çalışır", async () => {
      expect((await liste({ q: "İMZA" })).map((d) => d.id)).toEqual(["d_as_imza"])
      expect(await liste({ q: "öztürk" })).toHaveLength(3)
    })

    it("geçerlilik filtresi: süresi dolmuş / 30 gün içinde dolacak", async () => {
      expect((await liste({ gecerlilik: "DOLDU" })).map((d) => d.id)).toEqual(["d_as_imza"])
      expect((await liste({ gecerlilik: "YAKINDA" })).map((d) => d.id)).toEqual(["d_ltd_faaliyet"])
    })

    it("boyuta göre azalan sıralar", async () => {
      const [ilk] = await liste({ sirala: "boyut", yon: "desc" })
      expect(ilk!.id).toBe("d_sahis_kimlik")
    })

    it("sayfa verilince sayfalar; aşan sayfa son sayfaya döner", async () => {
      const tumu = await liste({ sirala: "ad" })
      const ilk = await sayfali({ sirala: "ad", sayfa: 1, sayfaBoyutu: 3 })
      expect(ilk).toMatchObject({ total: tumu.length, sayfa: 1, sayfaBoyutu: 3 })
      expect(ilk.items.map((d) => d.id)).toEqual(tumu.slice(0, 3).map((d) => d.id))
      const ikinci = await sayfali({ sirala: "ad", sayfa: 2, sayfaBoyutu: 3 })
      expect(ikinci.items.map((d) => d.id)).toEqual(tumu.slice(3, 6).map((d) => d.id))
      const asan = await sayfali({ sirala: "ad", sayfa: 99, sayfaBoyutu: 3 })
      expect(asan.sayfa).toBe(Math.ceil(tumu.length / 3))
    })

    it("oturum ister", async () => {
      expect((await t.istemci().get("/arsiv")).statusCode).toBe(401)
    })
  })

  describe("GET /arsiv/agac ve /ozet", () => {
    it("ağaç mükellef ve kategori sayılarını, eksik zorunluları döner", async () => {
      const agac = (await ben.get("/arsiv/agac")).json<ArsivAgacResponse>()
      expect(agac.copSayisi).toBe(1)
      const ltd = agac.mukellefler.find((m) => m.mukellefId === "m_ltd")!
      expect(ltd.toplam).toBe(3)
      expect(ltd.kategoriler).toEqual({
        VERGI_LEVHASI: 1,
        TICARET_SICIL_GAZETESI: 1,
        FAALIYET_BELGESI: 1,
      })
      expect(ltd.eksikZorunlu).toEqual(["IMZA_SIRKULERI"])
      expect(agac.mukellefler.find((m) => m.mukellefId === "m_sahis")!.toplam).toBe(2)
    })

    it("özet: süresi dolan ve yakında dolan belgeler, eksikler", async () => {
      const ozet = (await ben.get("/arsiv/ozet")).json<ArsivOzetResponse>()
      expect(ozet.gecerlilik.map((d) => [d.id, d.gecerlilik, d.kalanGun])).toEqual([
        ["d_as_imza", "DOLDU", -22],
        ["d_ltd_faaliyet", "YAKINDA", 20],
      ])
      expect(ozet.eksikZorunlu).toEqual([
        { mukellefId: "m_ltd", unvan: expect.any(String), eksik: ["IMZA_SIRKULERI"] },
      ])
      const benim = (await ben.get("/arsiv/ozet?sorumlu=p_3")).json<ArsivOzetResponse>()
      expect(benim.gecerlilik.map((d) => d.id)).toEqual(["d_ltd_faaliyet"])
    })
  })

  describe("dosya işlemleri", () => {
    it("yükle → yeniden adlandır/taşı → sil → geri al → kalıcı sil", async () => {
      const dosya = await yukle()
      expect(dosya).toMatchObject({
        kategori: "IMZA_SIRKULERI",
        yukleyenId: MEHMET,
        yukleyen: { id: MEHMET },
        mimeType: "image/png",
        // İstemcinin bildirdiği 68 değil, gerçek bayt sayısı
        boyut: 70,
        gecerlilikTarihi: "2027-01-01",
        silindi: false,
      })
      const anahtar = arsivAnahtari("m_ltd", dosya.id)
      expect(t.depo.nesneler.has(anahtar)).toBe(true)
      const icerik = (await ben.get(`/arsiv/${dosya.id}/icerik`)).json<ArsivIcerikResponse>()
      expect(icerik.dataUrl).toBe(PNG)

      const agac = (await ben.get("/arsiv/agac")).json<ArsivAgacResponse>()
      expect(agac.mukellefler.find((m) => m.mukellefId === "m_ltd")!.eksikZorunlu).toEqual([])

      const tasindi = (
        await ben.patch(`/arsiv/${dosya.id}`, { ad: "Yeni ad.png", kategori: "DIGER" })
      ).json<ArsivDosyaView>()
      // Süreli olmayan kategoriye taşınınca geçerlilik tarihi kalkar
      expect(tasindi).toMatchObject({ ad: "Yeni ad.png", kategori: "DIGER" })
      expect(tasindi.gecerlilikTarihi).toBeUndefined()

      expect((await ben.delete(`/arsiv/${dosya.id}?kalici=true`)).statusCode).toBe(400)

      expect((await ben.delete(`/arsiv/${dosya.id}`)).json()).toEqual({ id: dosya.id })
      expect((await liste({ mukellefId: "m_ltd" })).some((d) => d.id === dosya.id)).toBe(false)
      expect((await liste({ cop: true })).some((d) => d.id === dosya.id)).toBe(true)
      expect((await ben.delete(`/arsiv/${dosya.id}`)).statusCode).toBe(400)

      expect((await ben.post(`/arsiv/${dosya.id}/geri-al`)).statusCode).toBe(200)
      expect((await liste({ mukellefId: "m_ltd" })).some((d) => d.id === dosya.id)).toBe(true)
      expect((await ben.post(`/arsiv/${dosya.id}/geri-al`)).statusCode).toBe(400)

      await ben.delete(`/arsiv/${dosya.id}`)
      expect((await ben.delete(`/arsiv/${dosya.id}?kalici=true`)).statusCode).toBe(200)
      expect(await t.db.select().from(arsivDosya).where(eq(arsivDosya.id, dosya.id))).toEqual([])
      expect(t.depo.nesneler.has(anahtar)).toBe(false)
      expect((await ben.get(`/arsiv/${dosya.id}/icerik`)).statusCode).toBe(404)

      // Saat sabit: zamanlar aynı, ekleme sırasıyla (aktivite satırları güncellenmez)
      const eylemler = (
        await t.db
          .select()
          .from(aktivite)
          .where(eq(aktivite.hedefId, dosya.id))
          .orderBy(sql`ctid`)
      ).map((a) => a.eylem)
      expect(eylemler).toEqual([
        "ARSIV_YUKLENDI",
        "DOSYA_GORUNTULENDI",
        "ARSIV_GUNCELLENDI",
        "ARSIV_SILINDI",
        "ARSIV_GERI_ALINDI",
        "ARSIV_SILINDI",
        "ARSIV_KALICI_SILINDI",
      ])
    })

    it("bordro dosyası döneme bağlanır, dönemle filtrelenir; dönem dışı kategoride alanlar silinir", async () => {
      const bordro = await yukle({
        kategori: "BORDRO",
        ad: "pusula.png",
        donem: "2026-08",
        bordroBelge: "PUSULA",
      })
      expect(bordro).toMatchObject({ donem: "2026-08", bordroBelge: "PUSULA" })
      expect(bordro.gecerlilikTarihi).toBeUndefined()
      // Dönem dışı kategoride yükleme alanları yok sayılır
      const imza = await yukle({ donem: "2026-08", bordroBelge: "ICMAL" })
      expect(imza.donem).toBeUndefined()

      expect((await liste({ mukellefId: "m_ltd", donem: "2026-08" })).map((d) => d.id)).toEqual([
        bordro.id,
      ])

      const patch = async (body: unknown) =>
        (await ben.patch(`/arsiv/${bordro.id}`, body)).json<ArsivDosyaView>()
      expect(await patch({ bordroBelge: "IMZALI" })).toMatchObject({
        donem: "2026-08",
        bordroBelge: "IMZALI",
      })
      // Dönem kaldırılınca tür de düşer
      expect((await patch({ donem: null })).bordroBelge).toBeUndefined()

      await patch({ donem: "2026-07", bordroBelge: "ICMAL" })
      const tasindi = await patch({ kategori: "DIGER" })
      expect(tasindi.donem).toBeUndefined()
      expect(tasindi.bordroBelge).toBeUndefined()

      const durum = async (body: unknown) =>
        (await ben.patch(`/arsiv/${bordro.id}`, body)).statusCode
      expect(await durum({ donem: "2026-13" })).toBe(400)
      expect(await durum({ bordroBelge: "MAAS" })).toBe(400)
      expect(await durum({ ad: "  " })).toBe(400)
      expect(await durum({ gecerlilikTarihi: "23.09.2026" })).toBe(400)
      expect((await ben.patch("/arsiv/yok", { ad: "x" })).statusCode).toBe(404)
    })

    it("seed dosyasının nesnesi yoksa (production dışı) placeholder üretir; erişim kaydı yazılır", async () => {
      const y = await ben.get("/arsiv/d_ltd_levha/icerik?islem=indir")
      expect(y.json<ArsivIcerikResponse>().dataUrl).toMatch(/^data:application\/pdf;base64,/)
      const [kayit] = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.hedefId, "d_ltd_levha"))
      expect(kayit).toMatchObject({ eylem: "DOSYA_INDIRILDI", aktorId: MEHMET })
    })

    it("tür içerikten belirlenir: PDF baytı PDF olarak saklanır, istemcinin bildirdiği MIME yok sayılır", async () => {
      const pdf = await yukle({ ad: "sirkuler.pdf", mimeType: "image/png", dataUrl: PDF })
      expect(pdf.mimeType).toBe("application/pdf")
      expect((await ben.get(`/arsiv/${pdf.id}/icerik`)).json<ArsivIcerikResponse>().dataUrl).toBe(PDF)
    })

    it("doğrulama: mükellef, kategori, ad, tür, boyut, tarih", async () => {
      const hata = async (over: Partial<ArsivYukleRequest>) => {
        const y = await ben.post("/arsiv", yukleme(over))
        return [y.statusCode, y.json<{ message: string }>().message]
      }
      expect(await hata({ mukellefId: "m_yok" })).toEqual([404, "Mükellef bulunamadı"])
      expect(await hata({ kategori: "X" as never })).toEqual([400, "Geçersiz kategori"])
      expect(await hata({ ad: " " })).toEqual([400, "Dosya adı zorunludur"])
      const docx = `data:application/msword;base64,${Buffer.from("merhaba dünya").toString("base64")}`
      expect((await hata({ ad: "rapor.docx", dataUrl: docx }))[1]).toContain("Desteklenmeyen")
      const buyuk = `data:application/pdf;base64,${"A".repeat(Math.ceil((11 * 1024 * 1024 * 4) / 3))}`
      expect((await hata({ dataUrl: buyuk }))[1]).toContain("10 MB")
      expect(await hata({ gecerlilikTarihi: "2027/01/01" })).toEqual([
        400,
        "Geçersiz geçerlilik tarihi",
      ])
      expect(await hata({ kategori: "BORDRO", donem: "2026-13" })).toEqual([400, "Geçersiz dönem"])
      expect(await t.db.$count(arsivDosya)).toBe(9)
      expect(t.depo.nesneler.size).toBe(0)
    })

    it("oturum yoksa yazma işlemleri 401 döner", async () => {
      expect((await t.istemci().delete("/arsiv/d_ltd_levha")).statusCode).toBe(401)
    })
  })
})
