import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type { BildirimListResponse } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../src/aktivite/aktivite.service.js"
import { BildirimService } from "../src/bildirim/bildirim.service.js"
import { bildirim } from "../src/db/schema/index.js"
import { testUygulamasi, type TestUygulamasi } from "./harness.js"

const [yonetici, mehmet, zeynep] = PERSONEL as [Personel, Personel, Personel]

describe("bildirimler", () => {
  let t: TestUygulamasi
  let log: AktiviteService["log"]
  const cookieler = new Map<string, string>()

  beforeAll(async () => {
    t = await testUygulamasi()
    const aktiviteler = t.app.get(AktiviteService)
    log = aktiviteler.log.bind(aktiviteler)
    // Görev modülü (Faz 3) gelene kadar: GOREV hedefinin atananı test çözücüsünden
    t.app.get(BildirimService).cozucuEkle({
      oncelik: 0,
      cozumle: async (l) =>
        l.hedefTip === "GOREV" && l.hedefId?.startsWith("o_")
          ? { alici: l.hedefId.slice(2) }
          : undefined,
    })
    // Mükellef sorumlusu (Faz 2): m_ltd → Zeynep
    t.app.get(BildirimService).cozucuEkle({
      oncelik: 100,
      cozumle: async (l) =>
        l.mukellefId === "m_ltd" ? { alici: zeynep.id } : undefined,
    })
  })
  afterAll(() => t.kapat())
  beforeEach(async () => {
    t.saat.sabitle("2026-09-23T07:00:00.000Z")
    await t.fixtureYukle()
    cookieler.clear()
    for (const p of [yonetici, mehmet, zeynep]) cookieler.set(p.id, await t.girisYap(p.id))
  })

  const istemci = (p: Personel) => t.istemci(cookieler.get(p.id))
  const liste = async (p: Personel, sorgu = "") =>
    (await istemci(p).get(`/bildirim${sorgu}`)).json<BildirimListResponse>()

  describe("alıcı kuralları", () => {
    it("görev atanana gider; aktör kendi eylemi için bildirim almaz", async () => {
      await log({
        aktorId: mehmet.id,
        eylem: "GOREV_OLUSTURULDU",
        hedefTip: "GOREV",
        hedefId: `o_${zeynep.id}`,
        mukellefId: "m_ltd",
        aciklama: "Kira sözleşmesini iste",
      })
      const z = await liste(zeynep)
      expect(z.items).toHaveLength(1)
      expect(z.items[0]).toEqual({
        id: expect.stringMatching(/^i_/),
        tur: "GOREV_OLUSTURULDU",
        aliciId: zeynep.id,
        aktorId: mehmet.id,
        baslik: "Size yeni bir görev atandı",
        aciklama: "Kira sözleşmesini iste",
        link: `/gorevler?gorev=o_${zeynep.id}`,
        mukellefId: "m_ltd",
        hedefTip: "GOREV",
        hedefId: `o_${zeynep.id}`,
        zaman: "2026-09-23T07:00:00.000Z",
        okundu: false,
        aktor: { id: mehmet.id, ad: mehmet.ad, soyad: mehmet.soyad, renk: mehmet.renk },
      })
      expect((await liste(mehmet)).items).toHaveLength(0)
    })

    it("kişi kendine görev atarsa bildirim üretilmez", async () => {
      await log({
        aktorId: mehmet.id,
        eylem: "GOREV_OLUSTURULDU",
        hedefTip: "GOREV",
        hedefId: `o_${mehmet.id}`,
      })
      expect(await t.db.select().from(bildirim)).toHaveLength(0)
    })

    it("atananı olmayan olay tüm kullanıcılara yayınlanır (aktör hariç)", async () => {
      await log({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI" })
      expect((await liste(yonetici)).items).toHaveLength(0)
      for (const p of [mehmet, zeynep]) {
        const [b] = (await liste(p)).items
        expect(b).toMatchObject({ tur: "SABLON_GUNCELLENDI", aliciId: null })
      }
    })

    it("mükellefe bağlı olay mükellefin sorumlusuna gider", async () => {
      await log({
        aktorId: yonetici.id,
        eylem: "ARSIV_YUKLENDI",
        hedefTip: "ARSIV",
        mukellefId: "m_ltd",
      })
      const z = await liste(zeynep)
      expect(z.items.map((b) => b.link)).toEqual(["/arsiv?mukellef=m_ltd"])
      expect((await liste(mehmet)).items).toHaveLength(0)
    })

    it("kural dışı eylemler bildirim üretmez; false bildirimi kapatır", async () => {
      await log({ aktorId: mehmet.id, eylem: "GIRIS" })
      await log({ aktorId: mehmet.id, eylem: "SIFRE_GORUNTULENDI", mukellefId: "m_ltd" })
      await log({ aktorId: mehmet.id, eylem: "ARSIV_YUKLENDI", mukellefId: "m_ltd" }, false)
      expect(await t.db.select().from(bildirim)).toHaveLength(0)
    })

    it("seçenekle alıcılar, tür ve başlık verilebilir", async () => {
      await log(
        { aktorId: yonetici.id, eylem: "GOREV_YORUMLANDI", hedefTip: "GOREV", hedefId: "o_x" },
        { alicilar: [mehmet.id, yonetici.id], tur: "GOREV_ANILDI", baslik: "Ayşe sizi andı" }
      )
      const [anma] = (await liste(mehmet)).items
      expect(anma).toMatchObject({ tur: "GOREV_ANILDI", baslik: "Ayşe sizi andı" })
      expect((await liste(yonetici)).items).toHaveLength(0)
    })
  })

  describe("liste ve okundu", () => {
    it("en yeni önce; limit; okunmamış sayısı limitten bağımsız", async () => {
      for (let i = 0; i < 3; i++) {
        t.saat.sabitle(`2026-09-23T0${7 + i}:00:00.000Z`)
        await log({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI", aciklama: `${i}` })
      }
      const sonuc = await liste(mehmet, "?limit=2")
      expect(sonuc.items.map((b) => b.aciklama)).toEqual(["2", "1"])
      expect(sonuc.okunmamis).toBe(3)
    })

    it("yayında okundu kişi başınadır", async () => {
      await log({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI" })
      const [b] = (await liste(mehmet)).items
      expect((await istemci(mehmet).post(`/bildirim/${b!.id}/okundu`)).statusCode).toBe(204)
      // Tekrar okundu yapmak çift kayıt üretmez
      await istemci(mehmet).post(`/bildirim/${b!.id}/okundu`)

      expect((await liste(mehmet)).items[0]?.okundu).toBe(true)
      expect((await liste(zeynep)).items[0]?.okundu).toBe(false)
      const [kayit] = await t.db.select().from(bildirim)
      expect(kayit!.okuyanlar).toEqual([yonetici.id, mehmet.id])
    })

    it("tümünü okundu yapar; okunmamış sayısı ve filtre buna uyar", async () => {
      await log({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI" })
      await log({
        aktorId: yonetici.id,
        eylem: "ARSIV_YUKLENDI",
        hedefTip: "ARSIV",
        mukellefId: "m_ltd",
      })
      expect((await liste(zeynep)).okunmamis).toBe(2)
      expect((await istemci(zeynep).post("/bildirim/okundu")).statusCode).toBe(204)
      expect(await liste(zeynep, "?sadeceOkunmamis=true")).toEqual({ items: [], okunmamis: 0 })
      expect((await liste(zeynep)).items).toHaveLength(2)
      expect((await liste(mehmet)).okunmamis).toBe(1)
    })

    it("başkasının bildirimi okundu yapılamaz", async () => {
      await log({
        aktorId: mehmet.id,
        eylem: "GOREV_ATANDI",
        hedefTip: "GOREV",
        hedefId: `o_${zeynep.id}`,
      })
      const [b] = await t.db.select().from(bildirim)
      const yanit = await istemci(yonetici).post(`/bildirim/${b!.id}/okundu`)
      expect(yanit.statusCode).toBe(404)
      expect(yanit.json()).toEqual({ message: "Bildirim bulunamadı" })
    })
  })
})
