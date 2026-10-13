import { desc, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  MizanDetay,
  MizanView,
  TahakkukIceAktarKalem,
  TahakkukIceAktarResponse,
  TahakkukView,
} from "@prime/shared/types/api"
import type { AktiviteEylem, MizanHesap } from "@prime/shared/types/domain"

import { aktivite, arsivDosya, gorev, mizan, tahakkuk, takvimDurum } from "../src/db/schema/index.js"
import { arsivAnahtari } from "../src/dosya/dosya.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const MEHMET = PERSONEL[1]!.id

const PDF = {
  ad: "tahakkuk.pdf",
  dataUrl: `data:application/pdf;base64,${Buffer.from(
    "%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"
  ).toString("base64")}`,
}
const CSV = {
  ad: "mizan.csv",
  dataUrl: `data:text/csv;base64,${Buffer.from(
    "Hesap Kodu;Hesap Adı;Borç;Alacak\n100;KASA;1000;200\n"
  ).toString("base64")}`,
}
const PNG = {
  ad: "mizan.png",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
}

const h = (kod: string, borc: number, alacak: number): MizanHesap => ({ kod, ad: "", borc, alacak })

describe("içe aktarım", () => {
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

  const tahakkukGonder = async (kalemler: Partial<TahakkukIceAktarKalem>[]) => {
    const y = await ben.post("/ice-aktarim/tahakkuklar", {
      kalemler: kalemler.map((k) => ({ dosya: PDF, ...k })),
    })
    expect(y.statusCode).toBe(200)
    return y.json<TahakkukIceAktarResponse>()
  }
  const mizanGonder = (ek: Record<string, unknown>) =>
    ben.post("/ice-aktarim/mizanlar", {
      mukellefId: "m_ltd",
      donem: "2026-08",
      dosya: CSV,
      hesaplar: denk,
      ...ek,
    })
  const sonAktivite = async (eylem: AktiviteEylem) =>
    (
      await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, eylem))
        .orderBy(desc(aktivite.zaman))
        .limit(1)
    )[0]
  const takvim = async (mukellefId: string, tip: string, donem: string) =>
    (
      await t.db
        .select()
        .from(takvimDurum)
        .where(eq(takvimDurum.mukellefId, mukellefId))
    ).find((d) => d.tip === tip && d.donem === donem)

  const denk = [h("100", 1000, 200), h("102", 10000, 0), h("360", 0, 6749.5), h("600", 0, 4050.5)]

  describe("tahakkuk", () => {
    it("takvimi onaylar, arşive yazar, aynı dönemi günceller; hatalı kalemler ayrı raporlanır", async () => {
      const { sonuclar } = await tahakkukGonder([
        {
          mukellefId: "m_ltd",
          tip: "KDV",
          donem: "2026-08",
          beyannameKodu: "KDV1",
          odenecek: 6749.5,
          vade: "2026-09-28",
        },
        // Şahıs, işçisi yoksa MUHSGK yükümlüsü değil
        { mukellefId: "m_sahis", tip: "MUHTASAR_SGK", donem: "2026-08" },
        // Aylık KDV mükellefi için çeyrek dönem
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-Q3" },
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-10" },
        { mukellefId: "yok", tip: "KDV", donem: "2026-08" },
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-07", dosya: { ad: "x", dataUrl: "" } },
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-07", odenecek: -1 },
      ])
      expect(sonuclar).toEqual([
        { sira: 0, durum: "EKLENDI" },
        { sira: 1, durum: "HATA", mesaj: "Ali Veli Muhtasar ve prim hizmet yükümlüsü değil" },
        { sira: 2, durum: "HATA", mesaj: "Mükellef aylık KDV veriyor; dönem uyuşmuyor" },
        { sira: 3, durum: "HATA", mesaj: "Gelecek dönemin tahakkuku olamaz" },
        { sira: 4, durum: "HATA", mesaj: "Mükellef bulunamadı" },
        { sira: 5, durum: "HATA", mesaj: "Dosya içeriği eksik" },
        { sira: 6, durum: "HATA", mesaj: "Ödenecek tutar geçersiz" },
      ])

      expect((await takvim("m_ltd", "KDV", "2026-08"))?.durum).toBe("ONAYLANDI")
      const liste = (await ben.get("/ice-aktarim/tahakkuklar")).json<TahakkukView[]>()
      expect(liste).toHaveLength(1)
      expect(liste[0]).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        beyannameKodu: "KDV1",
        odenecek: 6749.5,
        vade: "2026-09-28",
        yukleyenId: MEHMET,
      })
      expect(liste[0]).not.toHaveProperty("tahakkukNo")
      const [dosya] = await t.db
        .select()
        .from(arsivDosya)
        .where(eq(arsivDosya.id, liste[0]!.arsivDosyaId!))
      expect(dosya).toMatchObject({ kategori: "TAHAKKUK", mukellefId: "m_ltd", mimeType: "application/pdf" })
      expect(t.depo.nesneler.has(arsivAnahtari("m_ltd", dosya!.id))).toBe(true)
      expect(await sonAktivite("TAHAKKUK_ICE_AKTARILDI")).toMatchObject({
        hedefId: "m_ltd:KDV:2026-08",
      })

      const tekrar = await tahakkukGonder([
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", odenecek: 7000 },
      ])
      expect(tekrar.sonuclar[0]!.durum).toBe("GUNCELLENDI")
      const kayitlar = await t.db.select().from(tahakkuk)
      expect(kayitlar).toHaveLength(1)
      expect(kayitlar[0]).toMatchObject({ odenecek: 7000, beyannameKodu: null })
      expect(
        (await ben.get("/ice-aktarim/tahakkuklar?mukellefId=m_as")).json<TahakkukView[]>()
      ).toEqual([])
    })

    it("onaylanmış beyan için tekrar takvim aktivitesi yazılmaz", async () => {
      await tahakkukGonder([{ mukellefId: "m_ltd", tip: "KDV", donem: "2026-08" }])
      await tahakkukGonder([{ mukellefId: "m_ltd", tip: "KDV", donem: "2026-08" }])
      const beyan = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, "BEYAN_DURUMU_GUNCELLENDI"))
      expect(beyan.filter((a) => a.hedefId === "m_ltd:KDV:2026-08")).toHaveLength(1)
    })

    it("desteklenmeyen dosya kalemi düşürür", async () => {
      const { sonuclar } = await tahakkukGonder([
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", dosya: CSV },
      ])
      expect(sonuclar[0]).toMatchObject({ durum: "HATA", mesaj: expect.stringContaining("Desteklenmeyen") })
      expect(await t.db.select().from(tahakkuk)).toEqual([])
    })

    it("boş, fazla kalemli ve oturumsuz istek reddedilir", async () => {
      expect((await ben.post("/ice-aktarim/tahakkuklar", { kalemler: [] })).statusCode).toBe(400)
      const fazla = Array.from({ length: 51 }, () => ({ mukellefId: "m_ltd" }))
      expect((await ben.post("/ice-aktarim/tahakkuklar", { kalemler: fazla })).json()).toEqual({
        message: "Tek seferde en fazla 50 tahakkuk",
      })
      expect((await t.istemci().get("/ice-aktarim/tahakkuklar")).statusCode).toBe(401)
    })

    it("gövde sınırı bu uçta 60 MB, diğer uçlarda 15 MB", async () => {
      const buyuk = { kalemler: [{ mukellefId: "yok", dolgu: "x".repeat(20 * 1024 * 1024) }] }
      const y = await ben.post("/ice-aktarim/tahakkuklar", buyuk)
      expect(y.statusCode).toBe(200)
      expect(y.json<TahakkukIceAktarResponse>().sonuclar[0]!.mesaj).toBe("Mükellef bulunamadı")
      expect((await ben.post("/ice-aktarim/mizanlar", buyuk)).statusCode).toBe(413)
    })
  })

  describe("mizan", () => {
    it("kontrolleri çalıştırır, 360'ı dönem tahakkuklarıyla karşılaştırır, arşive yazar", async () => {
      await tahakkukGonder([
        { mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", odenecek: 6749.5 },
      ])
      const y = await mizanGonder({})
      expect(y.statusCode).toBe(201)
      const z = y.json<MizanView>()
      expect(z.kontroller.map((k) => [k.kod, k.durum])).toEqual([
        ["DENKLIK", "GECTI"],
        ["KASA", "GECTI"],
        ["VERGI_360", "GECTI"],
      ])
      expect(z).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        dosyaAdi: "mizan.csv",
        hesapSayisi: 4,
        ozet: { toplamBorc: 11000, toplamAlacak: 11000, donemSonucu: 4050.5 },
      })
      expect(z).not.toHaveProperty("hesaplar")
      const [dosya] = await t.db.select().from(arsivDosya).where(eq(arsivDosya.id, z.arsivDosyaId!))
      expect(dosya).toMatchObject({ kategori: "MIZAN", mimeType: "text/csv" })
      expect(await sonAktivite("MIZAN_ICE_AKTARILDI")).toMatchObject({
        aciklama: "Ağustos 2026 · sorun yok",
      })

      const detay = (await ben.get(`/ice-aktarim/mizanlar/${z.id}`)).json<MizanDetay>()
      expect(detay.hesaplar).toHaveLength(4)
      expect((await ben.get("/ice-aktarim/mizanlar")).json<MizanView[]>()).toHaveLength(1)
      expect((await ben.get("/ice-aktarim/mizanlar?mukellefId=m_as")).json()).toEqual([])
      expect((await ben.get("/ice-aktarim/mizanlar/yok")).statusCode).toBe(404)
    })

    it("tahakkuk yoksa 360 karşılaştırması yapılmaz; tutmayan tahakkuk uyarı verir", async () => {
      const ilk = (await mizanGonder({})).json<MizanView>()
      expect(ilk.kontroller.map((k) => k.kod)).not.toContain("VERGI_360")
      await tahakkukGonder([{ mukellefId: "m_ltd", tip: "KDV", donem: "2026-08", odenecek: 100 }])
      const ikinci = await mizanGonder({})
      expect(ikinci.statusCode).toBe(200)
      expect(ikinci.json<MizanView>().kontroller.find((k) => k.kod === "VERGI_360")?.durum).not.toBe(
        "GECTI"
      )
    })

    it("çeyrek sonu hatasız mizan geçici vergi görevindeki maddeyi işaretler", async () => {
      const [kaynak] = await t.db.select().from(gorev).where(eq(gorev.id, "o_kdv_ltd"))
      await t.db.insert(gorev).values({
        ...kaynak!,
        id: "o_gecici",
        tip: "GECICI_VERGI",
        donem: "2026-Q2",
        otomatikAnahtar: "m_ltd:GECICI_VERGI:2026-Q2",
        checklist: [
          { id: "c1", metin: "Mizan kontrol edildi", tamam: false },
          { id: "c2", metin: "Geçici vergi hesaplandı", tamam: false },
        ],
      })
      const maddeler = async () =>
        (await t.db.select().from(gorev).where(eq(gorev.id, "o_gecici")))[0]!.checklist

      const hatali = (
        await mizanGonder({ donem: "2026-06", hesaplar: [h("100", 0, 500), h("600", 500, 0)] })
      ).json<MizanView>()
      expect(hatali.isaretlenenGorevId).toBeUndefined()
      expect((await maddeler())[0]!.tamam).toBe(false)

      // Aynı dönem yeniden yüklenince kayıt güncellenir ve bu kez madde işaretlenir
      const y = await mizanGonder({ donem: "2026-06" })
      expect(y.statusCode).toBe(200)
      const duzgun = y.json<MizanView>()
      expect(duzgun.id).toBe(hatali.id)
      expect(duzgun.isaretlenenGorevId).toBe("o_gecici")
      expect((await maddeler())[0]).toMatchObject({ tamam: true, tamamlayanId: MEHMET })
      expect(await t.db.select().from(mizan)).toHaveLength(1)
    })

    it("geçersiz istekler reddedilir", async () => {
      const durum = async (ek: Record<string, unknown>) => (await mizanGonder(ek)).statusCode
      expect(await durum({ donem: "2026-10" })).toBe(400)
      expect(await durum({ donem: "2026-13" })).toBe(400)
      expect(await durum({ hesaplar: [h("12", 1, 1)] })).toBe(400)
      expect(await durum({ hesaplar: [] })).toBe(400)
      expect(await durum({ hesaplar: [{ kod: "100", borc: "1", alacak: 0 }] })).toBe(400)
      expect(await durum({ dosya: { ad: "x" } })).toBe(400)
      expect(await durum({ mukellefId: "yok" })).toBe(404)
      const png = await mizanGonder({ dosya: PNG })
      expect(png.statusCode).toBe(400)
      expect(png.json<{ message: string }>().message).toContain("XLSX")
      expect(await t.db.select().from(mizan)).toEqual([])
      expect(t.depo.nesneler.size).toBe(0)
    })
  })
})
