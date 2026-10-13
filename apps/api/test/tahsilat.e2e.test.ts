import { and, eq, like } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import { toYmd } from "@prime/shared/lib/tarih"
import { ucretDonemleri } from "@prime/shared/tahsilat/kurallar"
import type {
  AcilisTopluRequest,
  CariEkstreResponse,
  CariListResponse,
  KesintiIceAktarimView,
  KesintiRaporResponse,
  TahsilatOzetResponse,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type { Buro, CariHareket, Mukellef } from "@prime/shared/types/domain"

import { aktivite, cariHareket, kesintiIceAktarim, mukellef } from "../src/db/schema/index.js"
import { UcretBorclari } from "../src/tahsilat/ucret-borclari.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id

describe("tahsilat", () => {
  let t: TestUygulamasi
  let ben: Istemci
  let yonetici: Istemci
  let ucretler: UcretBorclari
  beforeAll(async () => {
    t = await testUygulamasi()
    ucretler = t.app.get(UcretBorclari)
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    ben = t.istemci(await t.girisYap(MEHMET))
    yonetici = t.istemci(await t.girisYap(YONETICI))
  })

  const ekstre = async (id: string) => {
    const y = await ben.get(`/tahsilat/cari/${id}`)
    expect(y.statusCode).toBe(200)
    return y.json<CariEkstreResponse>()
  }
  const hareketler = (mukellefId: string) =>
    t.db.select().from(cariHareket).where(eq(cariHareket.mukellefId, mukellefId))
  const odeme = (mukellefId: string, tutar: number, ek: Record<string, unknown> = {}) =>
    ben.post("/tahsilat/hareketler", {
      tip: "ODEME",
      mukellefId,
      kalem: "ODEME",
      tarih: "2026-09-20",
      tutar,
      ...ek,
    })

  describe("aylık ücret borçları", () => {
    it("eksik aylar iş çalışınca bir kez üretilir (idempotent); GET yalnızca okur", async () => {
      expect((await ekstre("m_ltd")).hareketler.filter((h) => h.kalem === "AYLIK_UCRET")).toHaveLength(2)
      expect(await ucretler.uret()).toBe(1)
      const e = await ekstre("m_ltd")
      const ucretli = e.hareketler.filter((h) => h.kalem === "AYLIK_UCRET")
      expect(ucretli.map((h) => h.donem)).toEqual(["2026-07", "2026-08", "2026-09"])
      expect(ucretli[2]).toMatchObject({
        tarih: "2026-09-01",
        brut: 10_000,
        stopaj: 2_000,
        tutar: 10_000,
        aciklama: "Eylül 2026 hizmet bedeli",
        olusturanAd: "Otomatik",
      })
      expect(await ucretler.uret()).toBe(0)
      expect(
        await t.db.select().from(cariHareket).where(like(cariHareket.otomatikAnahtar, "UCRET:m_ltd:%"))
      ).toHaveLength(3)
      expect(e.durum).toMatchObject({ bakiye: 20_000, acikBorc: 20_000, geciken: true })
    })

    it("eşzamanlı üretim çift kayıt açmaz", async () => {
      const sonuc = await Promise.all([ucretler.uret(), ucretler.uret(), ucretler.mukellefIcin("m_ltd")])
      expect(sonuc.reduce((a, b) => a + b, 0)).toBe(1)
    })

    it("avans yeni borca otomatik uygulanır", async () => {
      expect((await odeme("m_ltd", 25_000)).statusCode).toBe(201)
      let e = await ekstre("m_ltd")
      expect(e.avans).toBe(5_000)
      expect(e.durum.bakiye).toBe(-5_000)

      // Ekim gelince 5.000 avans Ekim borcunu kısmen kapatır
      t.saat.sabitle(new Date(2026, 9, 2, 10, 0))
      await ucretler.uret()
      ben = t.istemci(await t.girisYap(MEHMET))
      e = await ekstre("m_ltd")
      expect(e.avans).toBe(0)
      expect(e.acikBorclar).toEqual([expect.objectContaining({ donem: "2026-10", kalan: 5_000 })])
    })

    it("ücret değişikliği yalnızca yönetici; geçmiş borçlar değişmez", async () => {
      const ucret = { aylikBrut: 12_000, kdvOrani: 20, stopajVar: true, baslangicDonem: "2026-06" }
      const red = await ben.put("/mukellefler/m_ltd/ucret", { ucret })
      expect(red.statusCode).toBe(403)
      expect(red.json()).toEqual({ message: "Ücreti yalnızca yönetici değiştirebilir" })
      expect((await yonetici.put("/mukellefler/m_ltd/ucret", { ucret: { ...ucret, kdvOrani: 18 } })).json()).toEqual({
        message: "Geçersiz KDV oranı",
      })
      expect((await yonetici.put("/mukellefler/yok/ucret", { ucret })).statusCode).toBe(404)

      const y = await yonetici.put("/mukellefler/m_ltd/ucret", { ucret })
      expect(y.statusCode).toBe(200)
      expect(y.json<Mukellef>().ucret?.aylikBrut).toBe(12_000)
      const e = await ekstre("m_ltd")
      const byDonem = Object.fromEntries(
        e.hareketler.filter((h) => h.donem).map((h) => [h.donem, h.brut])
      )
      // Haziran yeni başlangıçla üretildi; Temmuz–Eylül eski tutarında kaldı
      expect(byDonem).toEqual({
        "2026-06": 12_000,
        "2026-07": 10_000,
        "2026-08": 10_000,
        "2026-09": 10_000,
      })

      // Ücret kaldırılınca sonraki aylar borçlandırılmaz
      expect((await yonetici.put("/mukellefler/m_ltd/ucret", { ucret: null })).json<Mukellef>()).not.toHaveProperty(
        "ucret"
      )
      t.saat.sabitle(new Date(2026, 9, 2, 10, 0))
      expect(await ucretler.uret()).toBe(0)
    })

    it("mükellef formu ücreti değiştiremez", async () => {
      const m = (await ben.get("/mukellefler/m_ltd")).json<Mukellef>()
      const { id: _, olusturmaTarihi: __, ...govde } = m
      const guncel = await ben.put("/mukellefler/m_ltd", { ...govde, ucret: { ...m.ucret!, aylikBrut: 1 } })
      expect(guncel.json<Mukellef>().ucret?.aylikBrut).toBe(10_000)
    })
  })

  describe("POST /tahsilat/hareketler", () => {
    it("ödeme FIFO ile en eski borcu kapatır; elle kapatma doğrulanır", async () => {
      const y = await odeme("m_ltd", 12_000)
      expect(y.statusCode).toBe(201)
      const o = y.json<CariHareket>()
      // Eylül borcu ödemeden önce üretildi
      expect(o.kapatmalar).toEqual([
        { borcId: "ch_2", tutar: 10_000 },
        { borcId: expect.any(String), tutar: 2_000 },
      ])
      const hatali = await odeme("m_ltd", 100, { kapatmalar: [{ borcId: "ch_1", tutar: 100 }] })
      expect(hatali.statusCode).toBe(400)
      expect(hatali.json()).toEqual({ message: "Kapatılacak borç bulunamadı veya zaten kapalı" })

      const [a] = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "TAHSILAT_ODEME_ALINDI"))
      expect(a).toMatchObject({ hedefId: o.id, mukellefId: "m_ltd", aciklama: "Ödeme · ₺12.000,00" })
    })

    it("elle kapatma seçilen borca uygulanır, kalan avans olur", async () => {
      await ucretler.uret()
      const eylul = (await hareketler("m_ltd")).find((h) => h.donem === "2026-09")!
      const o = (await odeme("m_ltd", 3_000, { kapatmalar: [{ borcId: eylul.id, tutar: 1_000 }] })).json<CariHareket>()
      expect(o.kapatmalar).toEqual([{ borcId: eylul.id, tutar: 1_000 }])
      expect((await ekstre("m_ltd")).avans).toBe(2_000)
    })

    it("eşzamanlı iki ödeme aynı borcu iki kez kapatmaz", async () => {
      await ucretler.uret()
      await Promise.all([odeme("m_ltd", 10_000), odeme("m_ltd", 10_000)])
      const e = await ekstre("m_ltd")
      expect(e.acikBorclar).toEqual([])
      expect(e.avans).toBe(0)
      // Borç başına kapatılan toplam borç tutarını aşmaz
      const kapatilan = new Map<string, number>()
      for (const k of e.hareketler.filter((h) => h.tip === "ODEME").flatMap((h) => h.kapatmalar ?? []))
        kapatilan.set(k.borcId, (kapatilan.get(k.borcId) ?? 0) + k.tutar)
      expect(Object.fromEntries(kapatilan)).toEqual({
        ch_1: 10_000,
        ch_2: 10_000,
        [e.hareketler.find((h) => h.donem === "2026-09")!.id]: 10_000,
      })
    })

    it("ek hizmet borcu KDV ve stopajla; gelecek tarih ve boş açıklama reddedilir", async () => {
      const y = await ben.post("/tahsilat/hareketler", {
        tip: "BORC",
        mukellefId: "m_sahis",
        tarih: "2026-09-20",
        brut: 2_000,
        kdvOrani: 20,
        stopajVar: false,
        aciklama: "Yıllık gelir vergisi beyannamesi",
        makbuzNo: " 42 ",
      })
      expect(y.statusCode).toBe(201)
      expect(y.json()).toMatchObject({ kalem: "EK_HIZMET", kdv: 400, stopaj: 0, tutar: 2_400, makbuzNo: "42" })
      const temel = { tip: "BORC", mukellefId: "m_sahis", brut: 1, kdvOrani: 20, stopajVar: true }
      const durum = async (ek: Record<string, unknown>) =>
        (await ben.post("/tahsilat/hareketler", { ...temel, ...ek })).json<{ message: string }>().message
      expect(await durum({ tarih: "2026-09-30", aciklama: "x" })).toBe("Gelecek tarihli kayıt girilemez")
      expect(await durum({ tarih: "2026-09-20", aciklama: " " })).toBe("Açıklama zorunludur")
      expect(await durum({ tarih: "2026-09-20", aciklama: "x", brut: "5" })).toBe(
        "Brüt tutar sıfırdan büyük olmalı"
      )
      expect((await ben.post("/tahsilat/hareketler", { ...temel, tarih: "2026-09-20", aciklama: "x", mukellefId: "yok" })).statusCode).toBe(404)
    })

    it("silme yalnızca yönetici; otomatik ücret silinemez; silinen borcun ödemesi avansa döner", async () => {
      const red = await ben.delete("/tahsilat/hareketler/ch_4")
      expect(red.statusCode).toBe(403)
      expect(red.json()).toEqual({ message: "Cari hareketleri yalnızca yönetici silebilir" })
      expect((await yonetici.delete("/tahsilat/hareketler/ch_1")).statusCode).toBe(409)
      expect((await yonetici.delete("/tahsilat/hareketler/yok")).statusCode).toBe(404)
      await odeme("m_as", 5_000)
      expect((await yonetici.delete("/tahsilat/hareketler/ch_4")).statusCode).toBe(204)
      const e = await ekstre("m_as")
      expect(e.avans).toBe(5_000)
      expect(e.durum.bakiye).toBe(-5_000)
      const [a] = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "TAHSILAT_HAREKET_SILINDI"))
      expect(a).toMatchObject({ mukellefId: "m_as", aciklama: "Ticaret sicil tadil tescili · ₺5.000,00" })
    })
  })

  describe("liste ve özet", () => {
    beforeEach(() => ucretler.uret())

    it("geciken ve bakiyeli filtreleri, gecikmeye göre sıralama", async () => {
      const l = (await ben.get("/tahsilat/cari?geciken=true")).json<CariListResponse>()
      expect(l.items.map((s) => s.mukellefId)).toEqual(["m_as", "m_ltd"])
      expect(l.toplamBakiye).toBe(25_000)
      const tumu = (await ben.get("/tahsilat/cari")).json<CariListResponse>()
      expect(tumu).toMatchObject({ total: 3, sayfa: 1, sayfaBoyutu: 20 })
      const bakiyeli = (await ben.get(`/tahsilat/cari?bakiyeli=true&q=${encodeURIComponent("çınar")}`)).json<CariListResponse>()
      expect(bakiyeli.items.map((s) => s.mukellefId)).toEqual(["m_ltd"])
      expect(bakiyeli.items[0]).toMatchObject({ sonOdeme: "2026-07-15", ucret: { aylikBrut: 10_000 } })
      const tasan = (await ben.get("/tahsilat/cari?sayfa=9&sayfaBoyutu=2&sirala=unvan&yon=asc")).json<CariListResponse>()
      expect(tasan.sayfa).toBe(2)
      expect(tasan.items).toHaveLength(1)
    })

    it("özet: alacak, bu ay tahakkuk, yaşlandırma", async () => {
      const o = (await ben.get("/tahsilat/ozet")).json<TahsilatOzetResponse>()
      expect(o).toMatchObject({
        toplamAlacak: 25_000,
        buAyTahakkuk: 10_000,
        buAyTahsilat: 0,
        gecikenMukellef: 2,
        ucretliMukellef: 1,
        yaslandirma: { "0-30": 10_000, "31-60": 10_000, "61-90": 0, "90+": 5_000 },
      })
      expect(o.aylik).toHaveLength(12)
      expect(o.enGecikenler.map((s) => s.mukellefId)).toEqual(["m_as", "m_ltd"])
    })

    it("oturum gerekir", async () => {
      expect((await t.istemci().get("/tahsilat/ozet")).statusCode).toBe(401)
    })
  })

  describe("hızlı başlangıç: POST /tahsilat/acilis-toplu", () => {
    const govde = (ek: Partial<AcilisTopluRequest> = {}): AcilisTopluRequest => ({
      uzerineYaz: false,
      kayitlar: [
        {
          satir: 2,
          mukellefId: "m_as",
          ucret: { aylikBrut: 5000, kdvOrani: 20, stopajVar: true, baslangicDonem: "2026-10" },
          bakiye: { tutar: 12_500, tarih: "2026-09-23" },
        },
      ],
      ...ek,
    })

    it("yalnızca yönetici aktarabilir", async () => {
      expect((await ben.post("/tahsilat/acilis-toplu", govde())).statusCode).toBe(403)
    })

    it("ücreti tanımlar, açılış borcunu bir kez yazar; başlangıçtan önceki aylar borçlandırılmaz", async () => {
      const ilk = await yonetici.post("/tahsilat/acilis-toplu", govde())
      expect(ilk.statusCode).toBe(200)
      expect(ilk.json<TopluAktarimSonucu>()).toMatchObject({ olusturulan: 1 })
      const [m] = await t.db.select().from(mukellef).where(eq(mukellef.id, "m_as"))
      expect(m!.ucret?.aylikBrut).toBe(5000)
      const acilis = (await hareketler("m_as")).filter((h) => h.kalem === "ACILIS")
      expect(acilis).toMatchObject([{ tip: "BORC", tutar: 12_500, brut: 12_500, kdv: 0 }])
      expect((await hareketler("m_as")).filter((h) => h.kalem === "AYLIK_UCRET")).toHaveLength(0)

      // Tekrar aktarım: bakiye yeniden yazılmaz, ücret korunur
      expect((await yonetici.post("/tahsilat/acilis-toplu", govde())).json<TopluAktarimSonucu>()).toMatchObject({
        olusturulan: 0,
        atlanan: 1,
      })
      expect((await hareketler("m_as")).filter((h) => h.kalem === "ACILIS")).toHaveLength(1)

      // uzerineYaz: tanımlı ücret güncellenir
      const ust = govde({ uzerineYaz: true })
      ust.kayitlar[0]!.ucret!.aylikBrut = 6000
      expect((await yonetici.post("/tahsilat/acilis-toplu", ust)).json<TopluAktarimSonucu>()).toMatchObject({
        guncellenen: 1,
      })
    })

    it("eksi bakiye avans olarak açık borçlara dağıtılır; hatalı satırlar raporlanır", async () => {
      const y = await yonetici.post("/tahsilat/acilis-toplu", {
        uzerineYaz: false,
        kayitlar: [
          { satir: 2, mukellefId: "m_ltd", bakiye: { tutar: -1000, tarih: "2026-09-23" } },
          { satir: 3, mukellefId: "yok" },
          { satir: 4, mukellefId: "m_as", bakiye: { tutar: 1, tarih: "dün" } },
          { satir: 5, mukellefId: "m_as", ucret: { aylikBrut: 0, kdvOrani: 20, stopajVar: true, baslangicDonem: "2026-01" } },
        ],
      })
      expect(y.json<TopluAktarimSonucu>().hatalar).toEqual([
        { satir: 3, mesaj: "Mükellef bulunamadı" },
        { satir: 4, mesaj: "Açılış bakiyesi geçersiz" },
        { satir: 5, mesaj: "Aylık ücret sıfırdan büyük olmalı" },
      ])
      const [avans] = (await hareketler("m_ltd")).filter((h) => h.kalem === "ACILIS")
      expect(avans).toMatchObject({ tip: "ODEME", tutar: 1000 })
      expect(avans!.kapatmalar?.reduce((top, k) => top + k.tutar, 0)).toBe(1000)
    })
  })

  describe("kesinti kontrolü", () => {
    const kayit = (donem: string, kesinti: number, vkn = "0174520662") => ({
      vkn,
      unvan: "",
      donem,
      matrah: kesinti * 5,
      kesinti,
    })

    it("içe aktarım yıl başına tek kayıt; rapor durumları", async () => {
      await ucretler.uret()
      await ben.post("/tahsilat/kesinti/ice-aktar", { yil: 2026, dosyaAdi: "ilk.xlsx", kayitlar: [kayit("2026-07", 1)] })
      const y = await ben.post("/tahsilat/kesinti/ice-aktar", {
        yil: 2026,
        dosyaAdi: "kesinti.xlsx",
        kayitlar: [kayit("2026-07", 2_000), kayit("2026-08", 500, "9358005601")],
      })
      expect(y.statusCode).toBe(201)
      expect(y.json<KesintiIceAktarimView>()).toMatchObject({ yil: 2026, satirSayisi: 2, yukleyenAd: "Mehmet Kaya" })
      expect(await t.db.select().from(kesintiIceAktarim)).toHaveLength(1)

      const r = (await ben.get("/tahsilat/kesinti?yil=2026")).json<KesintiRaporResponse>()
      expect(r.iceAktarim?.dosyaAdi).toBe("kesinti.xlsx")
      expect(r.satirlar.map((s) => [s.mukellefId, s.donem, s.durum])).toEqual([
        ["m_ltd", "2026-07", "ESLESTI"],
        ["m_as", "2026-08", "KAYITSIZ"],
      ])
      expect(r.ozet).toMatchObject({ ESLESTI: 1, KAYITSIZ: 1 })
      expect(r.yillar).toEqual([2026])
      // Yıl verilmezse en son aktarım yılı; aktarımı olmayan yıl boş
      expect((await ben.get("/tahsilat/kesinti")).json<KesintiRaporResponse>().yil).toBe(2026)
      expect((await ben.get("/tahsilat/kesinti?yil=2025")).json<KesintiRaporResponse>()).toMatchObject({
        satirlar: [],
        yillar: [2026],
      })
      const [a] = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "KESINTI_ICE_AKTARILDI"))
      expect(a?.aciklama).toBe("2026 · 1 satır")
    })

    it("başka yıla ait ve geçersiz satır reddedilir", async () => {
      const mesaj = async (b: unknown) =>
        (await ben.post("/tahsilat/kesinti/ice-aktar", b)).json<{ message: string }>().message
      expect(await mesaj({ yil: 2026, dosyaAdi: "x", kayitlar: [kayit("2025-12", 5)] })).toBe(
        "1 satır 2026 yılına ait değil"
      )
      expect(await mesaj({ yil: 2026, kayitlar: [kayit("2026-01", 0)] })).toBe("Geçersiz VKN veya kesinti tutarı")
      expect(await mesaj({ yil: 1999, kayitlar: [kayit("1999-01", 1)] })).toBe("Geçersiz yıl")
      expect(await mesaj({ yil: 2026, kayitlar: [] })).toBe("İçe aktarılacak satır yok")
    })
  })

  describe("PATCH /buro", () => {
    it("IBAN yalnızca yönetici, TR biçimi doğrulanır", async () => {
      expect((await ben.patch("/buro", { iban: "TR" })).statusCode).toBe(403)
      expect((await yonetici.patch("/buro", { iban: "DE12" })).statusCode).toBe(400)
      const b = await yonetici.patch("/buro", { iban: "tr33 0006 1005 1978 6457 8413 26" })
      expect(b.statusCode).toBe(200)
      expect(b.json<Buro>().iban).toBe("TR330006100519786457841326")
      expect((await yonetici.patch("/buro", { iban: "" })).json<Buro>()).not.toHaveProperty("iban")
      const kayit = await t.db
        .select()
        .from(aktivite)
        .where(and(eq(aktivite.eylem, "BURO_GUNCELLENDI"), eq(aktivite.aktorId, YONETICI)))
      expect(kayit).toHaveLength(2)
    })
  })
})

describe("ücret borçları işi", () => {
  it("açılışta bir kez çalışır ve kaçırılan ayları üretir", async () => {
    const hazirlik = await testUygulamasi()
    await hazirlik.fixtureYukle()
    const isci = await testUygulamasi({ JOB_WORKERS: "true" })
    try {
      // İşçi gerçek saatle çalışır: Temmuz'dan bu aya kadar
      const beklenen = ucretDonemleri({ baslangicDonem: "2026-07" }, toYmd(new Date())).length
      await expect
        .poll(
          async () =>
            (
              await isci.db
                .select()
                .from(cariHareket)
                .where(like(cariHareket.otomatikAnahtar, "UCRET:m_ltd:%"))
            ).length,
          { timeout: 20_000, interval: 250 }
        )
        .toBe(beklenen)
    } finally {
      await isci.kapat()
      await hazirlik.kapat()
    }
  })
})
