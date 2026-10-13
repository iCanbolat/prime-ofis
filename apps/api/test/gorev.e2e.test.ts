import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  DonemOlusturResponse,
  DonemPlanSatiri,
  GorevDetay,
  GorevOzetResponse,
  GorevTopluResponse,
  GorevView,
  TakvimOlayi,
} from "@prime/shared/types/api"

import { aktivite, bildirim, gorev, takvimDurum } from "../src/db/schema/index.js"
import { GorevMaddesiService } from "../src/gorev/gorev-maddesi.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const [YONETICI, MEHMET, ZEYNEP] = PERSONEL.map((p) => p.id) as [string, string, string]

describe("görev", () => {
  let t: TestUygulamasi
  let oturumlar: Record<string, string>
  let ben: Istemci
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    oturumlar = {}
    for (const id of [YONETICI, MEHMET, ZEYNEP]) oturumlar[id] = await t.girisYap(id)
    oturum(MEHMET)
  })

  const oturum = (id: string) => {
    ben = t.istemci(oturumlar[id])
  }
  const liste = async (sorgu = "") => (await ben.get(`/gorevler${sorgu}`)).json<GorevView[]>()
  const idler = async (sorgu: string) => (await liste(sorgu)).map((g) => g.id)
  const tasi = (id: string, durum: string) => ben.post(`/gorevler/${id}/tasi`, { durum })
  const satir = async (id: string) => (await t.db.select().from(gorev).where(eq(gorev.id, id)))[0]
  const aktiviteler = (eylem: string) =>
    t.db
      .select()
      .from(aktivite)
      .where(eq(aktivite.eylem, eylem as never))

  describe("GET /gorevler", () => {
    it("mükellef bilgisi ve gecikme ile döner, son tarihe göre sıralı", async () => {
      const gorevler = await liste()
      expect(gorevler).toHaveLength(6)
      expect(gorevler[0]).toMatchObject({ id: "o_kdv_sahis" })
      expect(gorevler.find((g) => g.id === "o_vergi")).toMatchObject({
        mukellefUnvan: "Ali Veli",
        mukellefTur: "SAHIS",
        gecikti: true,
      })
      expect(gorevler.find((g) => g.id === "o_kdv_sahis")?.gecikti).toBe(false)
    })

    it("birden çok atanan verilirse herhangi birine atanmışlar döner", async () => {
      const hepsi = await liste()
      const ikisi = await idler("?atanan=p_2&atanan=p_3")
      expect(ikisi).toEqual(
        hepsi.filter((g) => ["p_2", "p_3"].includes(g.atananId)).map((g) => g.id)
      )
      expect(ikisi.length).toBeGreaterThan((await liste("?atanan=p_2")).length)
    })

    it("filtre kombinasyonu: atanan + tip + dönem", async () => {
      expect(await idler("?atanan=p_2&tip=KDV&donem=2026-08")).toEqual(["o_kdv_as"])
      expect(await idler("?atanan=p_3&tip=KDV&tip=MUHTASAR_SGK")).toEqual([
        "o_kdv_ltd",
        "o_muh_ltd",
      ])
      expect(await idler("?tip=DIGER&mukellefId=m_ltd")).toEqual(["o_banka"])
      expect(await idler("?geciken=true")).toEqual(["o_vergi"])
      expect(await idler("?durum=KONTROL&durum=TAMAM")).toEqual(["o_kdv_sahis", "o_muh_ltd"])
      expect(await idler("?q=banka")).toEqual(["o_banka"])
      expect(await idler(`?q=${encodeURIComponent("öztürk")}`)).toEqual(["o_kdv_as"])
    })

    it("özet: kişi başı açık ve gecikmiş görev sayıları", async () => {
      const ozet = (await ben.get("/gorevler/ozet")).json<GorevOzetResponse>()
      expect(ozet).toMatchObject({ acik: 5, geciken: 1 })
      expect(ozet.personel).toEqual(
        expect.arrayContaining([
          { personelId: "p_2", acik: 3, geciken: 1 },
          { personelId: "p_3", acik: 2, geciken: 0 },
        ])
      )
      expect((await ben.get("/gorevler/ozet?atanan=p_3")).json()).toMatchObject({
        acik: 2,
        geciken: 0,
      })
    })

    it("detay: takvimdeki beyan durumu ve bağlı evrak talepleri (talep modülünden)", async () => {
      const banka = (await ben.get("/gorevler/o_banka")).json<GorevDetay>()
      expect(banka.bagliTalepler).toEqual([
        {
          id: "e_aktif",
          durum: "AKTIF",
          istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
          donem: "2026-08",
          olusturmaTarihi: expect.any(String),
        },
      ])
      expect(banka.beyanDurumu).toBeUndefined()
      const kdv = (await ben.get("/gorevler/o_kdv_ltd")).json<GorevDetay>()
      expect(kdv.beyanDurumu).toBe("BEKLIYOR")
      expect((await ben.get("/gorevler/o_yok")).statusCode).toBe(404)
    })

    it("bağlanan talepler tekilleştirilir; bilinmeyen talep 400", async () => {
      expect(
        (await ben.patch("/gorevler/o_banka", { bagliTalepIdler: ["e_aktif", "e_aktif"] })).json()
      ).toMatchObject({ bagliTalepIdler: ["e_aktif"] })
      expect(
        (await ben.patch("/gorevler/o_banka", { bagliTalepIdler: ["e_yok"] })).statusCode
      ).toBe(400)
    })
  })

  describe("taşıma", () => {
    it("durum güncellenir, aktiviteye yazılır, atanan dışındaki aktörden bildirim gider", async () => {
      oturum(ZEYNEP)
      const r = await tasi("o_kdv_ltd", "KONTROL")
      expect(r.statusCode).toBe(200)
      expect(r.json<GorevView>().durum).toBe("KONTROL")
      expect(await aktiviteler("GOREV_DURUMU_DEGISTI")).toMatchObject([
        {
          aktorId: "p_3",
          hedefId: "o_kdv_ltd",
          mukellefId: "m_ltd",
          aciklama: expect.stringContaining("Devam → Kontrol"),
        },
      ])

      // Atanan (p_3) kendi eylemi için bildirim almaz; başkası taşıyınca atanana gider
      oturum(MEHMET)
      await tasi("o_kdv_ltd", "DEVAM")
      const bildirimler = await t.db
        .select()
        .from(bildirim)
        .where(eq(bildirim.tur, "GOREV_DURUMU_DEGISTI"))
      expect(bildirimler.map((b) => b.aliciId)).toEqual(["p_3"])
    })

    it("personel başkasına atanmış görevi Tamam'a taşıyamaz, yönetici taşıyabilir", async () => {
      const red = await tasi("o_muh_ltd", "TAMAM")
      expect(red.statusCode).toBe(403)
      expect(red.json().message).toBe(
        "Başkasına atanmış bir görevi yalnızca yönetici tamamlayabilir"
      )
      expect((await satir("o_muh_ltd"))?.durum).toBe("KONTROL")
      expect((await tasi("o_muh_ltd", "DEVAM")).json().durum).toBe("DEVAM")

      oturum(YONETICI)
      expect((await tasi("o_muh_ltd", "TAMAM")).json()).toMatchObject({
        durum: "TAMAM",
        tamamlanmaTarihi: expect.any(String),
      })
      expect((await tasi("o_muh_ltd", "BITTI")).statusCode).toBe(400)
    })

    it("takvim senkronu: Kontrol → Hazırlandı, Tamam → Onaylandı; geri taşıma takvimi düşürmez", async () => {
      oturum(ZEYNEP)
      const beyan = async () =>
        (
          await ben.get("/takvim?baslangic=2026-09-01&bitis=2026-09-30&mukellefId=m_ltd&tip=KDV")
        ).json<TakvimOlayi[]>()[0]!

      expect(await beyan()).toMatchObject({
        durum: "BEKLIYOR",
        gorevId: "o_kdv_ltd",
        gorevDurum: "DEVAM",
      })
      await tasi("o_kdv_ltd", "KONTROL")
      expect((await beyan()).durum).toBe("HAZIRLANDI")
      await tasi("o_kdv_ltd", "TAMAM")
      expect(await beyan()).toMatchObject({ durum: "ONAYLANDI", gorevDurum: "TAMAM" })
      expect((await aktiviteler("BEYAN_DURUMU_GUNCELLENDI")).map((a) => a.aciklama)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Hazırlandı \(görevden\)$/),
          expect.stringMatching(/Onaylandı \(görevden\)$/),
        ])
      )

      await tasi("o_kdv_ltd", "DEVAM")
      expect((await beyan()).durum).toBe("ONAYLANDI")
      expect((await satir("o_kdv_ltd"))?.tamamlanmaTarihi).toBeNull()
    })

    it("serbest görev takvime dokunmaz", async () => {
      await tasi("o_banka", "TAMAM")
      expect(await t.db.select().from(takvimDurum)).toEqual([])
    })

    it("toplu: yetkisiz olanlar reddedilir, diğerleri güncellenir", async () => {
      const sonuc = (
        await ben.post("/gorevler/toplu", {
          ids: ["o_kdv_as", "o_muh_ltd", "o_vergi"],
          durum: "TAMAM",
        })
      ).json<GorevTopluResponse>()
      expect(sonuc).toEqual({ guncellenen: ["o_kdv_as", "o_vergi"], reddedilen: ["o_muh_ltd"] })

      const atama = (
        await ben.post("/gorevler/toplu", { ids: ["o_kdv_ltd", "o_muh_ltd"], atananId: "p_4" })
      ).json<GorevTopluResponse>()
      expect(atama.guncellenen).toHaveLength(2)
      expect((await satir("o_muh_ltd"))?.atananId).toBe("p_4")
      expect(await aktiviteler("GOREV_ATANDI")).toHaveLength(2)

      for (const govde of [
        { ids: [] },
        { ids: ["o_banka"] },
        { ids: ["o_banka"], durum: "X" },
        { ids: ["o_banka"], atananId: "p_yok" },
      ]) {
        expect((await ben.post("/gorevler/toplu", govde)).statusCode).toBe(400)
      }
    })
  })

  describe("dönem görevleri", () => {
    it("önizleme mevcut görevi işaretler; iki kez çalıştırma çift kayıt üretmez", async () => {
      const onizleme = (
        await ben.post("/gorevler/donem/onizleme", { tip: "KDV", donem: "2026-08" })
      ).json<DonemPlanSatiri[]>()
      expect(onizleme.map((s) => [s.mukellefId, s.mevcutGorevId])).toEqual([
        ["m_sahis", undefined],
        ["m_ltd", "o_kdv_ltd"],
        ["m_as", "o_kdv_as"],
      ])

      const hepsi = { tip: "KDV", donem: "2026-08", mukellefIdler: ["m_sahis", "m_ltd", "m_as"] }
      expect((await ben.post("/gorevler/donem", hepsi)).json()).toEqual({
        olusturulan: 1,
        atlanan: 2,
      })
      expect((await ben.post("/gorevler/donem", hepsi)).json()).toEqual({
        olusturulan: 0,
        atlanan: 3,
      })
      const kdv = await t.db
        .select()
        .from(gorev)
        .where(eq(gorev.otomatikAnahtar, "m_sahis:KDV:2026-08"))
      expect(kdv).toHaveLength(1)
      expect(kdv[0]).toMatchObject({
        baslik: "KDV beyannamesi — Ağustos 2026",
        atananId: "p_2",
        sonTarih: "2026-09-28",
        durum: "YAPILACAK",
        olusturanId: "p_2",
      })
      expect(kdv[0]!.checklist.map((m) => m.metin)).toEqual([
        "Faturalar alındı",
        "Beyanname hazırlandı",
        "Müşteri onayı",
        "Tahakkuk gönderildi",
      ])
      expect(await aktiviteler("DONEM_GOREVLERI_OLUSTURULDU")).toHaveLength(1)
    })

    it("eşzamanlı iki çağrı çift kayıt üretmez", async () => {
      const govde = { tip: "MUHTASAR_SGK", donem: "2026-07", mukellefIdler: ["m_ltd", "m_as"] }
      const [a, b] = await Promise.all([
        ben.post("/gorevler/donem", govde),
        ben.post("/gorevler/donem", govde),
      ])
      const sonuclar = [a!.json<DonemOlusturResponse>(), b!.json<DonemOlusturResponse>()]
      expect(sonuclar.reduce((t, s) => t + s.olusturulan, 0)).toBe(2)
      expect(
        await t.db
          .select()
          .from(gorev)
          .where(and(eq(gorev.tip, "MUHTASAR_SGK"), eq(gorev.donem, "2026-07")))
      ).toHaveLength(2)
    })

    it("yalnızca seçili mükellefler için oluşturur", async () => {
      expect(
        (
          await ben.post("/gorevler/donem", {
            tip: "MUHTASAR_SGK",
            donem: "2026-07",
            mukellefIdler: ["m_as"],
          })
        ).json()
      ).toEqual({ olusturulan: 1, atlanan: 0 })
      expect(
        await t.db
          .select({ m: gorev.mukellefId })
          .from(gorev)
          .where(and(eq(gorev.tip, "MUHTASAR_SGK"), eq(gorev.donem, "2026-07")))
      ).toEqual([{ m: "m_as" }])
      expect((await ben.post("/gorevler/donem", { tip: "KDV", donem: "2026-13" })).statusCode).toBe(
        400
      )
    })

    it("elle oluşturma; aynı dönem için ikinci beyan görevi açılamaz (409)", async () => {
      const yeni = {
        baslik: "KDV",
        mukellefId: "m_ltd",
        tip: "KDV",
        donem: "2026-08",
        atananId: "p_3",
        oncelik: "NORMAL",
        sonTarih: "2026-09-28",
        checklist: [],
      }
      const cakisma = await ben.post("/gorevler", yeni)
      expect(cakisma.statusCode).toBe(409)
      expect(cakisma.json().message).toBe(
        "Bu dönem için zaten bir görev var: KDV beyannamesi — Ağustos 2026"
      )

      const r = await ben.post("/gorevler", {
        ...yeni,
        baslik: " Kira sözleşmesi ",
        tip: "DIGER",
        checklist: ["Sözleşme alındı", " "],
      })
      expect(r.statusCode).toBe(201)
      expect(r.json<GorevView>()).toMatchObject({
        baslik: "Kira sözleşmesi",
        durum: "YAPILACAK",
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        checklist: [{ metin: "Sözleşme alındı", tamam: false }],
        olusturanId: "p_2",
      })
      expect(r.json().otomatikAnahtar).toBeUndefined()
      // Atanana bildirim
      const [b] = await t.db.select().from(bildirim).where(eq(bildirim.tur, "GOREV_OLUSTURULDU"))
      expect(b).toMatchObject({ aliciId: "p_3", baslik: "Size yeni bir görev atandı" })

      for (const [degisiklik, status] of [
        [{ baslik: "" }, 400],
        [{ mukellefId: "m_yok" }, 404],
        [{ atananId: "p_yok" }, 400],
        [{ tip: "X" }, 400],
        [{ oncelik: "X" }, 400],
        [{ sonTarih: "28.09.2026" }, 400],
        [{ donem: "2026-13" }, 400],
      ] as const) {
        expect((await ben.post("/gorevler", { ...yeni, ...degisiklik })).statusCode).toBe(status)
      }
    })
  })

  describe("güncelleme, yorum, silme", () => {
    it("kontrol listesi maddesi işaretlenince tamamlayan kaydedilir", async () => {
      const g = (await satir("o_kdv_as"))!
      const r = await ben.patch("/gorevler/o_kdv_as", {
        checklist: g.checklist.map((m, i) => (i === 0 ? { ...m, tamam: true } : m)),
      })
      expect(r.statusCode).toBe(200)
      expect(r.json<GorevDetay>().checklist[0]).toMatchObject({
        tamam: true,
        tamamlayanId: "p_2",
        tamamlanmaTarihi: expect.any(String),
      })
      expect((await aktiviteler("GOREV_GUNCELLENDI"))[0]?.aciklama).toContain(
        "“Faturalar alındı” tamamlandı"
      )
    })

    it("atanan değişince GOREV_ATANDI; geçersiz alanlar 400", async () => {
      const r = await ben.patch("/gorevler/o_banka", { atananId: "p_4", oncelik: "YUKSEK" })
      expect(r.json<GorevDetay>()).toMatchObject({ atananId: "p_4", oncelik: "YUKSEK" })
      const [log] = await aktiviteler("GOREV_ATANDI")
      expect(log?.aciklama).toMatch(/öncelik, atanan: /)
      for (const govde of [
        { baslik: " " },
        { atananId: "p_yok" },
        { oncelik: "X" },
        { sonTarih: "x" },
        { checklist: "x" },
      ]) {
        expect((await ben.patch("/gorevler/o_banka", govde)).statusCode).toBe(400)
      }
      expect((await ben.patch("/gorevler/o_yok", {})).statusCode).toBe(404)
    })

    it("yalnızca aynı mükellefin talepleri bağlanabilir", async () => {
      const r = await ben.patch("/gorevler/o_banka", { bagliTalepIdler: ["e_iptal"] })
      expect(r.statusCode).toBe(400)
      expect(r.json().message).toBe("Yalnızca aynı mükellefin evrak talepleri bağlanabilir")
      expect((await ben.patch("/gorevler/o_banka", { bagliTalepIdler: [] })).statusCode).toBe(200)
    })

    it("yorumdaki @bahsetmeler çözülür ve anılana bildirim gider", async () => {
      const r = await ben.post("/gorevler/o_banka/yorum", {
        metin: "@Zeynep Demir ekstreleri kontrol eder misin?",
      })
      expect(r.statusCode).toBe(200)
      expect(r.json<GorevDetay>().yorumlar).toMatchObject([
        { yazarId: "p_2", bahsedilenler: ["p_3"] },
      ])
      const bildirimler = await t.db.select().from(bildirim)
      expect(bildirimler.filter((b) => b.tur === "GOREV_ANILDI")).toMatchObject([
        { aliciId: "p_3", baslik: "Mehmet Kaya sizi bir yorumda andı" },
      ])
      // Atanan (p_3) anıldığı için ayrıca "yorum" bildirimi almaz
      expect(bildirimler.filter((b) => b.tur === "GOREV_YORUMLANDI")).toEqual([])
      expect((await ben.post("/gorevler/o_banka/yorum", { metin: " " })).statusCode).toBe(400)
    })

    it("görevi yalnızca oluşturan veya yönetici silebilir", async () => {
      expect((await ben.delete("/gorevler/o_banka")).statusCode).toBe(403)
      expect((await ben.delete("/gorevler/o_vergi")).statusCode).toBe(204)
      oturum(YONETICI)
      expect((await ben.delete("/gorevler/o_banka")).statusCode).toBe(204)
      expect(await t.db.select().from(gorev)).toHaveLength(4)
      expect((await ben.delete("/gorevler/o_banka")).statusCode).toBe(404)
      const silindi = await t.db.select().from(bildirim).where(eq(bildirim.tur, "GOREV_SILINDI"))
      expect(silindi.map((b) => b.aliciId).sort()).toEqual(["p_2"])
    })
  })

  describe("kancalar", () => {
    it("açık görevi olan personel silinemez", async () => {
      oturum(YONETICI)
      await ben.post("/gorevler/toplu", { ids: ["o_banka"], atananId: "p_4" })
      const r = await ben.post(`/personel/p_4/sil`, { yoneticiSifresi: "demo1234" })
      expect(r.statusCode).toBe(409)
      expect(r.json().message).toMatch(/1 açık görevin atananı/)
      // Görev tamamlanınca silinebilir (atanan FK değil)
      await tasi("o_banka", "TAMAM")
      expect(
        (await ben.post(`/personel/p_4/sil`, { yoneticiSifresi: "demo1234" })).statusCode
      ).toBe(204)
      expect((await satir("o_banka"))?.atananId).toBe("p_4")
    })

    it("GorevMaddesiService.tamamla otomatik görevin maddesini bir kez işaretler", async () => {
      const s = t.app.get(GorevMaddesiService)
      expect(await s.tamamla("m_as:KDV:2026-08", "Faturalar alındı", "sistem")).toBe("o_kdv_as")
      expect(await s.tamamla("m_as:KDV:2026-08", "Faturalar alındı", "sistem")).toBeUndefined()
      expect(await s.tamamla("m_yok:KDV:2026-08", "Faturalar alındı", "sistem")).toBeUndefined()
      const madde = (await satir("o_kdv_as"))!.checklist.find((m) => m.metin === "Faturalar alındı")
      expect(madde).toMatchObject({ tamam: true, tamamlayanId: "sistem" })
    })
  })
})
