import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  GelenSayacResponse,
  PortalResponse,
  PortalYukleme,
  TalepDetay,
} from "@prime/shared/types/api"

import { aktivite, bildirim, evrakTalebi, gelenEvrak } from "../src/db/schema/index.js"
import { gelenAnahtari } from "../src/dosya/dosya.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("müşteri portalı", () => {
  let t: TestUygulamasi
  let musteri: Istemci
  beforeAll(async () => {
    t = await testUygulamasi({ PORTAL_OKUMA_SINIRI: "8", PORTAL_YAZMA_SINIRI: "6" })
  })
  afterAll(() => t.kapat())

  let dakika = 0
  beforeEach(async () => {
    await t.fixtureYukle()
    // Her test ayrı bir dakikada: istek sınırı penceresi testler arasında taşmasın
    t.saat.sabitle(new Date(2026, 8, 23, 10, dakika++ * 2))
    musteri = t.istemci()
  })

  const portal = (token: string) => musteri.get(`/portal/${token}`)
  const yukle = (token: string, over: Record<string, unknown> = {}) =>
    musteri.post(`/portal/${token}/yukleme`, {
      istenen: "FIS_FATURA",
      ad: "fis.png",
      mimeType: "image/png",
      boyut: 68,
      dataUrl: PNG,
      ...over,
    })
  const musteriEylemleri = async () =>
    (
      await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.aktorId, "musteri"))
        .orderBy(sql`ctid`)
    ).map((a) => a.eylem)

  it("bilinmeyen token 404; süresi dolmuş / iptal / tamamlanmış durumları döner, yazmalar 410", async () => {
    const yok = await portal("yok")
    expect([yok.statusCode, yok.json().message]).toEqual([404, "Bu bağlantı geçersiz"])
    expect((await portal("tkn_sure")).json<PortalResponse>().durum).toBe("SURESI_DOLDU")
    expect((await portal("tkn_iptal")).json<PortalResponse>().durum).toBe("IPTAL")
    const tamam = (await portal("tkn_tamam")).json<PortalResponse>()
    expect(tamam.durum).toBe("TAMAMLANDI")
    // Hassas mükellef bilgisi dönmez
    expect(JSON.stringify(tamam)).not.toContain("9358005601")
    for (const alan of ["token", "mukellefId", "olusturanId", "gonderimler", "musteriNotu"])
      expect(tamam).not.toHaveProperty(alan)

    const y = await yukle("tkn_sure", { istenen: "KIMLIK" })
    expect([y.statusCode, y.json().message]).toEqual([410, "Bu bağlantının süresi dolmuş"])
    expect((await yukle("tkn_iptal", { istenen: "KIRA_SOZLESMESI" })).json().message).toBe(
      "Bu talep iptal edilmiş"
    )
    expect((await musteri.post("/portal/tkn_tamam/tamamla", {})).json().message).toBe(
      "Bu talep tamamlanmış"
    )
    expect((await musteri.post("/portal/yok/tamamla", {})).statusCode).toBe(404)
  })

  it("aktif talep: büro, istenenler ve yüklemeler (eskiden yeniye)", async () => {
    const p = (await portal("tkn_aktif")).json<PortalResponse>()
    expect(p).toMatchObject({
      durum: "AKTIF",
      buro: { ad: expect.any(String), telefon: expect.any(String) },
      mukellefUnvan: expect.stringContaining("Çınar"),
      istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
      donem: "2026-08",
      degisiklikYokSecilebilir: false,
      yuklemeler: [{ id: "g_bekleyen", istenen: "FIS_FATURA", durum: "BEKLIYOR" }],
    })
  })

  it("2 dosya yükle → tamamla → büroda talep yükleme sayısı artar, sayaç güncellenir", async () => {
    const ilk = await yukle("tkn_aktif")
    expect(ilk.statusCode).toBe(201)
    const ikinci = (
      await yukle("tkn_aktif", { istenen: "BANKA_EKSTRESI", ad: "ekstre.png" })
    ).json<PortalYukleme>()
    expect(ikinci).toMatchObject({
      istenen: "BANKA_EKSTRESI",
      ad: "ekstre.png",
      mimeType: "image/png",
      boyut: 70,
      durum: "BEKLIYOR",
    })
    expect(t.depo.nesneler.has(gelenAnahtari("e_aktif", ikinci.id))).toBe(true)

    const hata = async (over: Record<string, unknown>) => {
      const r = await yukle("tkn_aktif", over)
      return [r.statusCode, r.json().message]
    }
    expect(await hata({ istenen: "KIMLIK" })).toEqual([400, "Bu evrak bu talepte istenmiyor"])
    expect(await hata({ ad: "  " })).toEqual([400, "Dosya adı zorunludur"])
    const docx = `data:application/msword;base64,${Buffer.from("merhaba").toString("base64")}`
    expect((await hata({ ad: "belge.docx", dataUrl: docx }))[1]).toContain("Desteklenmeyen")

    const sonuc = await musteri.post("/portal/tkn_aktif/tamamla", { not: "  Hepsi bu kadar " })
    expect(sonuc.statusCode).toBe(200)
    expect(sonuc.json<PortalResponse>()).toMatchObject({ durum: "TAMAMLANDI" })
    expect(await musteriEylemleri()).toEqual(["EVRAK_YUKLENDI", "EVRAK_YUKLENDI", "TALEP_TAMAMLANDI"])
    const [tamamlama] = await t.db
      .select()
      .from(aktivite)
      .where(eq(aktivite.eylem, "TALEP_TAMAMLANDI"))
    expect(tamamlama!.aciklama).toBe("3 dosya")

    const ben = t.istemci(await t.girisYap(PERSONEL[1]!.id))
    const detay = (await ben.get("/evrak-talepleri/e_aktif")).json<TalepDetay>()
    expect(detay).toMatchObject({
      durum: "TAMAMLANDI",
      yuklemeSayisi: 3,
      bekleyenSayisi: 3,
      musteriNotu: "Hepsi bu kadar",
    })
    expect((await ben.get("/gelen-evrak/sayac")).json<GelenSayacResponse>().bekleyen).toBe(3)
  })

  it("yükleme bildirimi talebi oluşturan personele gider, bağlantı talebe açılır", async () => {
    const y = (await yukle("tkn_aktif")).json<PortalYukleme>()
    const [b] = await t.db.select().from(bildirim).where(eq(bildirim.hedefId, y.id))
    expect(b).toMatchObject({
      tur: "EVRAK_YUKLENDI",
      aktorId: "musteri",
      aliciId: "p_3",
      link: "/evrak-talepleri?talep=e_aktif",
    })
  })

  it("tamamlama için bekleyen dosya gerekir; değişiklik yok henüz seçilemez", async () => {
    await t.db.delete(gelenEvrak).where(eq(gelenEvrak.id, "g_bekleyen"))
    const bos = await musteri.post("/portal/tkn_aktif/tamamla", {})
    expect([bos.statusCode, bos.json().message]).toEqual([
      400,
      "Göndermeden önce en az bir dosya yükleyin",
    ])
    expect((await musteri.post("/portal/tkn_aktif/tamamla", { degisiklikYok: true })).statusCode).toBe(
      400
    )
    const [x] = await t.db.select().from(evrakTalebi).where(eq(evrakTalebi.id, "e_aktif"))
    expect(x!.durum).toBe("AKTIF")
  })

  it("müşteri incelenmemiş dosyasını silebilir, incelenmişi ve başka talebinkini silemez", async () => {
    const y = (await yukle("tkn_aktif")).json<PortalYukleme>()
    const sil = await musteri.delete(`/portal/tkn_aktif/yukleme/${y.id}`)
    expect([sil.statusCode, sil.json()]).toEqual([200, { id: y.id }])
    expect(await t.db.select().from(gelenEvrak).where(eq(gelenEvrak.id, y.id))).toEqual([])
    expect(t.depo.nesneler.has(gelenAnahtari("e_aktif", y.id))).toBe(false)

    await t.db.update(gelenEvrak).set({ durum: "ONAYLANDI" }).where(eq(gelenEvrak.id, "g_bekleyen"))
    expect((await musteri.delete("/portal/tkn_aktif/yukleme/g_bekleyen")).statusCode).toBe(409)
    // Başka talebin dosyası bu token ile bulunamaz
    expect((await musteri.delete("/portal/tkn_aktif/yukleme/g_red")).statusCode).toBe(404)
  })

  it("istek sınırı: IP + token başına dakikada okuma ve yazma ayrı sayılır", async () => {
    for (let i = 0; i < 8; i++) expect((await portal("tkn_aktif")).statusCode).toBe(200)
    const asim = await portal("tkn_aktif")
    expect(asim.statusCode).toBe(429)
    expect(asim.json().message).toContain("Çok fazla istek")
    // Başka token etkilenmez; yazma sınırı ayrı
    expect((await portal("tkn_tamam")).statusCode).toBe(200)
    for (let i = 0; i < 6; i++)
      expect((await musteri.post("/portal/yok/tamamla", {})).statusCode).toBe(404)
    expect((await musteri.post("/portal/yok/tamamla", {})).statusCode).toBe(429)
    // Pencere dolunca açılır
    t.saat.sabitle(new Date(t.saat.simdi().getTime() + 61_000))
    expect((await portal("tkn_aktif")).statusCode).toBe(200)
  })
})
