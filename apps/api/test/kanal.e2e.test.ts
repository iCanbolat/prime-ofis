import { createHmac } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  BildirimTercihView,
  GonderimListResponse,
  KanalTestResponse,
  KanallarResponse,
  MukellefGonderResponse,
  TalepView,
} from "@prime/shared/types/api"
import type { Gonderim, KanalAyari } from "@prime/shared/types/domain"

import { AktiviteService } from "../src/aktivite/aktivite.service.js"
import { aktivite, gonderim, kanalAyari, mukellef, tahakkuk } from "../src/db/schema/index.js"
import { HatirlatmaService } from "../src/hatirlatma/hatirlatma.service.js"
import { GonderimService } from "../src/kanal/gonderim.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id
const UYGULAMA_GIZLISI = "meta-uygulama-gizlisi"

const WHATSAPP = {
  tip: "WHATSAPP",
  aktif: true,
  telefonNumarasiId: "109876543210",
  wabaId: "208765432109",
  gorunenNumara: "+90 216 345 67 89",
  erisimAnahtari: "EAAG-kalici-anahtar-9Zq1",
  sablonlar: { BORC_HATIRLATMA: "borc_hatirlatma_v1", TALEP: "evrak_talebi" },
}

describe("kanallar ve gönderim", () => {
  let t: TestUygulamasi
  let ben: Istemci
  let yonetici: Istemci
  let gonderimler: GonderimService

  beforeAll(async () => {
    t = await testUygulamasi({
      WHATSAPP_APP_SECRET: UYGULAMA_GIZLISI,
      WHATSAPP_VERIFY_TOKEN: "dogrulama-anahtari",
    })
    gonderimler = t.app.get(GonderimService)
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    ben = t.istemci(await t.girisYap(MEHMET))
    yonetici = t.istemci(await t.girisYap(YONETICI))
  })

  const gonder = async (body: Record<string, unknown>) => {
    const y = await ben.post("/gonderim/mukellef", body)
    expect(y.statusCode, y.body).toBe(200)
    return y.json<MukellefGonderResponse>()
  }
  const satirlar = () => t.db.select().from(gonderim)

  describe("kanal yapılandırması", () => {
    it("yalnızca yönetici; gizli anahtar şifreli saklanır, son 4 hane döner; hatalı anahtar 422", async () => {
      expect((await ben.put("/kanallar/WHATSAPP", WHATSAPP)).statusCode).toBe(403)
      expect(
        (await yonetici.put("/kanallar/WHATSAPP", { ...WHATSAPP, erisimAnahtari: "hatali-anahtar" }))
          .statusCode
      ).toBe(422)
      const k = await yonetici.put("/kanallar/WHATSAPP", WHATSAPP)
      expect(k.statusCode).toBe(200)
      expect(k.json<KanalAyari>()).toMatchObject({ durum: "BAGLI", gizliIpucu: "9Zq1" })
      expect((await ben.get("/kanallar")).body).not.toContain(WHATSAPP.erisimAnahtari)
      const [satir] = await t.db.select().from(kanalAyari).where(eq(kanalAyari.tip, "WHATSAPP"))
      expect(satir!.gizli).toMatch(/^v1:/)
      expect(satir!.gizli).not.toContain("9Zq1")

      // Güncellemede anahtar boş bırakılırsa mevcut korunur
      const g = await yonetici.put("/kanallar/WHATSAPP", {
        ...WHATSAPP,
        erisimAnahtari: undefined,
        gorunenNumara: "+90 216 000 00 00",
      })
      expect(g.json()).toMatchObject({ gizliIpucu: "9Zq1", gorunenNumara: "+90 216 000 00 00" })
      const [sonra] = await t.db.select().from(kanalAyari).where(eq(kanalAyari.tip, "WHATSAPP"))
      expect(sonra!.gizli).toBe(satir!.gizli)

      expect(
        await t.db.select().from(aktivite).where(eq(aktivite.eylem, "KANAL_GUNCELLENDI"))
      ).toHaveLength(2)
      expect(
        (await yonetici.put("/kanallar/WHATSAPP", { ...WHATSAPP, wabaId: "abc" })).json()
      ).toEqual({ message: "WhatsApp Business hesap kimliği (WABA ID) rakamlardan oluşmalı" })
      expect((await yonetici.put("/kanallar/SMS", { tip: "SMS" })).statusCode).toBe(404)
      expect((await yonetici.put("/kanallar/EPOSTA", WHATSAPP)).json()).toEqual({
        message: "Kanal tipi uyuşmuyor",
      })
    })

    it("Telegram ertelendi: yapılandırılamaz, listede null", async () => {
      const y = await yonetici.put("/kanallar/TELEGRAM", {
        tip: "TELEGRAM",
        aktif: true,
        botKullaniciAdi: "PrimeOfisBot",
        token: "123456:ABCdefGhIJKlmNoPQRsTUVwxyZ",
      })
      expect(y.statusCode).toBe(400)
      expect(y.json()).toEqual({ message: "Telegram kanalı henüz desteklenmiyor" })
      expect((await ben.get("/kanallar")).json<KanallarResponse>().TELEGRAM).toBeNull()
      expect((await ben.post("/bildirim-tercihleri/ben/telegram")).statusCode).toBe(404)
    })

    it("test mesajı kullanıcının kendi adresine; kaldırılan kanal null döner", async () => {
      const y = await yonetici.post("/kanallar/EPOSTA/test")
      expect(y.statusCode).toBe(200)
      expect(y.json<KanalTestResponse>().gonderim).toMatchObject({
        kanal: "EPOSTA",
        durum: "GONDERILDI",
        kaynak: "TEST",
        adres: "ay***@primemusavirlik.com.tr",
        denemeSayisi: 1,
      })
      expect((await ben.get("/kanallar")).json<KanallarResponse>().EPOSTA?.sonTest).toBeDefined()
      expect((await ben.post("/kanallar/WHATSAPP/test")).json()).toEqual({
        message: "Kanal yapılandırılmamış",
      })
      expect((await ben.delete("/kanallar/EPOSTA")).statusCode).toBe(403)
      expect((await yonetici.delete("/kanallar/EPOSTA")).statusCode).toBe(204)
      expect((await yonetici.delete("/kanallar/EPOSTA")).statusCode).toBe(404)
      expect((await ben.get("/kanallar")).json<KanallarResponse>().EPOSTA).toBeNull()
    })
  })

  describe("personel bildirimlerinin dış kanallara dağıtımı", () => {
    const gorevAtandi = () =>
      t.app.get(AktiviteService).log({
        aktorId: YONETICI,
        eylem: "GOREV_ATANDI",
        hedefTip: "GOREV",
        hedefId: "o_banka",
        mukellefId: "m_ltd",
      })

    it("varsayılan tercih: yalnızca hatırlatma ve tebligat e-postayla gider; kuyruk işlenir", async () => {
      await gorevAtandi()
      expect(await satirlar()).toHaveLength(0)
      // Mehmet'e (p_2) atanmış geciken görev → "uyari" kategorisi
      expect(await t.app.get(HatirlatmaService).uret()).toBeGreaterThan(0)
      const kuyruk = (await satirlar()).filter((g) => g.aliciId === MEHMET)
      expect(kuyruk.length).toBeGreaterThan(0)
      expect(kuyruk.every((g) => g.kanal === "EPOSTA" && g.durum === "KUYRUKTA")).toBe(true)
      expect(kuyruk[0]!.metin).toContain("http://localhost:5173/gorevler?gorev=")

      expect(await gonderimler.bekleyenleriIsle()).toBeGreaterThan(0)
      const islenen = (await satirlar()).filter((g) => g.aliciId === MEHMET)
      expect(islenen.every((g) => g.durum === "GONDERILDI" && g.denemeSayisi === 1)).toBe(true)
      expect(await gonderimler.bekleyenleriIsle()).toBe(0)
      // Hatırlatma ikinci kez üretilmez, gönderim de tekrarlanmaz
      expect(await t.app.get(HatirlatmaService).uret()).toBe(0)
    })

    it("tercih değişir; geçersiz kanal 400", async () => {
      const v = await ben.get("/bildirim-tercihleri/ben")
      expect(v.json<BildirimTercihView>()).toMatchObject({
        kanallar: { uyari: ["EPOSTA", "TELEGRAM"] },
        telegramBagli: false,
      })
      const k = await ben.put("/bildirim-tercihleri/ben", {
        kanallar: { gorev: ["EPOSTA"], uyari: [] },
      })
      expect(k.json<BildirimTercihView>().kanallar).toEqual({ gorev: ["EPOSTA"], uyari: [] })
      await gorevAtandi()
      const g = (await satirlar()).filter((x) => x.aliciId === MEHMET)
      expect(g.map((x) => [x.kanal, x.kaynak])).toEqual([["EPOSTA", "BILDIRIM"]])
      expect(
        (await ben.put("/bildirim-tercihleri/ben", { kanallar: { gorev: ["SMS"] } })).json()
      ).toEqual({ message: "Geçersiz kanal" })
      expect(
        (await ben.put("/bildirim-tercihleri/ben", { kanallar: { yok: [] } })).json()
      ).toEqual({ message: "Geçersiz kategori" })
    })
  })

  describe("mükellefe gönderim", () => {
    it("WhatsApp yapılandırılmamışsa wa.me bağlantısı (ELLE); borç mesajı bakiye ve dönemi içerir", async () => {
      const { sonuclar } = await gonder({
        sablon: "BORC_HATIRLATMA",
        hedefler: [{ mukellefId: "m_ltd" }],
      })
      expect(sonuclar[0]).toMatchObject({ kanal: "WHATSAPP", durum: "ELLE", sunucudan: false })
      expect(sonuclar[0]!.link).toMatch(/^https:\/\/wa\.me\/90533/)
      expect(sonuclar[0]!.mesaj).toContain("₺20.000,00")
      expect(sonuclar[0]!.mesaj).toContain("Ağustos 2026")
      expect((await satirlar()).filter((g) => g.durum === "ELLE")).toHaveLength(1)
      expect(
        await t.db.select().from(aktivite).where(eq(aktivite.eylem, "MUKELLEFE_GONDERILDI"))
      ).toHaveLength(1)
    })

    it("WhatsApp Business bağlıysa şablonla kuyruktan; şablonu eşlenmemiş türde hata", async () => {
      await yonetici.put("/kanallar/WHATSAPP", WHATSAPP)
      const borc = await gonder({ sablon: "BORC_HATIRLATMA", hedefler: [{ mukellefId: "m_ltd" }] })
      expect(borc.sonuclar[0]).toMatchObject({ durum: "KUYRUKTA", sunucudan: true })
      await gonderimler.bekleyenleriIsle()
      const [g] = await t.db
        .select()
        .from(gonderim)
        .where(eq(gonderim.id, borc.sonuclar[0]!.gonderimId!))
      expect(g).toMatchObject({
        durum: "GONDERILDI",
        sablon: "BORC_HATIRLATMA",
        adres: "+90 533 *** ** 67",
      })
      expect(g!.parametreler!.length).toBeGreaterThan(0)

      await t.db.insert(tahakkuk).values({
        id: "h_1",
        mukellefId: "m_ltd",
        tip: "KDV",
        donem: "2026-08",
        odenecek: 6749.5,
        vade: "2026-09-28",
        yukleyenId: "p_1",
        yuklemeTarihi: "2026-09-20T10:00:00.000Z",
      })
      const tk = await gonder({
        sablon: "TAHAKKUK",
        hedefler: [{ mukellefId: "m_ltd", tahakkukId: "h_1" }],
      })
      expect(tk.sonuclar[0]!.mesaj).toContain("₺6.749,50")
      await gonderimler.bekleyenleriIsle()
      const [hatali] = await t.db
        .select()
        .from(gonderim)
        .where(eq(gonderim.id, tk.sonuclar[0]!.gonderimId!))
      expect(hatali).toMatchObject({ durum: "HATA" })
      expect(hatali!.hataMesaji).toMatch(/şablonu eşlenmemiş/)
    })

    it("e-posta kanalı: düzenlenmiş metin gider; borcu olmayana gönderilmez; önizleme yazmaz", async () => {
      const on = await gonder({
        sablon: "BORC_HATIRLATMA",
        kanal: "EPOSTA",
        hedefler: [{ mukellefId: "m_ltd" }, { mukellefId: "m_sahis" }],
        onizleme: true,
      })
      expect(on.sonuclar.map((s) => [s.mukellefId, s.durum, s.hataMesaji])).toEqual([
        ["m_ltd", undefined, undefined],
        ["m_sahis", undefined, "Açık borcu yok"],
      ])
      expect(await satirlar()).toHaveLength(0)

      const { sonuclar } = await gonder({
        sablon: "BORC_HATIRLATMA",
        kanal: "EPOSTA",
        hedefler: [{ mukellefId: "m_ltd" }],
        metin: "Özel metin",
      })
      expect(sonuclar[0]).toMatchObject({ durum: "KUYRUKTA", mesaj: "Özel metin" })
      await gonderimler.bekleyenleriIsle()
      const [g] = await satirlar()
      expect(g).toMatchObject({ durum: "GONDERILDI", metin: "Özel metin", hedefAdres: "info@cinaryazilim.com.tr" })
    })

    it("evrak talebi gönderimi talebin geçmişine yazılır; pasif talep reddedilir", async () => {
      const { sonuclar } = await gonder({
        sablon: "TALEP",
        kanal: "EPOSTA",
        hedefler: [{ mukellefId: "m_ltd", talepId: "e_aktif" }],
      })
      expect(sonuclar[0]!.durum).toBe("KUYRUKTA")
      expect(sonuclar[0]!.mesaj).toContain("http://localhost:5173/p/")
      const talep = (await ben.get("/evrak-talepleri/e_aktif")).json<TalepView>()
      expect(talep.gonderimler.at(-1)).toMatchObject({ kanal: "EPOSTA", gonderenId: MEHMET })
      expect(
        await t.db.select().from(aktivite).where(eq(aktivite.eylem, "TALEP_GONDERILDI"))
      ).toHaveLength(1)
      const sure = await gonder({
        sablon: "TALEP",
        hedefler: [{ mukellefId: "m_sahis", talepId: "e_sure" }],
      })
      expect(sure.sonuclar[0]).toMatchObject({ durum: "HATA", hataMesaji: "Talep aktif değil" })
    })

    it("SMS kanalı yok; boş ve fazla hedef 400", async () => {
      const sms = await ben.post("/gonderim/mukellef", {
        sablon: "TALEP",
        kanal: "SMS",
        hedefler: [{ mukellefId: "m_ltd" }],
      })
      expect(sms.statusCode).toBe(400)
      expect((await ben.post("/gonderim/mukellef", { sablon: "TALEP", hedefler: [] })).json()).toEqual({
        message: "En az bir mükellef seçin",
      })
      const cok = Array.from({ length: 201 }, () => ({ mukellefId: "m_ltd" }))
      expect((await ben.post("/gonderim/mukellef", { sablon: "TALEP", hedefler: cok })).statusCode).toBe(400)
    })
  })

  describe("gönderim geçmişi ve kuyruk", () => {
    it("yalnızca yönetici; hatalı gönderim yeniden denenir", async () => {
      expect((await ben.get("/gonderimler")).statusCode).toBe(403)
      await t.db.update(mukellef).set({ eposta: "gecersiz" }).where(eq(mukellef.id, "m_ltd"))
      await gonder({ sablon: "BORC_HATIRLATMA", kanal: "EPOSTA", hedefler: [{ mukellefId: "m_ltd" }] })
      await gonderimler.bekleyenleriIsle()
      const l = (await yonetici.get("/gonderimler?durum=HATA")).json<GonderimListResponse>()
      expect(l.items).toHaveLength(1)
      expect(l.hataliSon7Gun).toBe(1)
      expect(l.items[0]).not.toHaveProperty("hedefAdres")
      // Adres hâlâ geçersiz: yeniden deneme de hatalı
      expect((await yonetici.post(`/gonderimler/${l.items[0]!.id}/tekrar`)).json()).toMatchObject({
        durum: "HATA",
        denemeSayisi: 2,
      })
      await t.db
        .update(mukellef)
        .set({ eposta: "info@cinaryazilim.com.tr" })
        .where(eq(mukellef.id, "m_ltd"))
      const y = await yonetici.post(`/gonderimler/${l.items[0]!.id}/tekrar`)
      expect(y.json<Gonderim>()).toMatchObject({ durum: "GONDERILDI", denemeSayisi: 3 })
      expect((await yonetici.post(`/gonderimler/${l.items[0]!.id}/tekrar`)).json()).toEqual({
        message: "Yalnızca hatalı gönderim yeniden denenir",
      })
      expect((await yonetici.post("/gonderimler/gn_yok/tekrar")).statusCode).toBe(404)
    })

    it("liste filtreleri ve sayfalama (taşan sayfa son sayfaya)", async () => {
      await yonetici.post("/kanallar/EPOSTA/test")
      await gonder({ sablon: "BORC_HATIRLATMA", hedefler: [{ mukellefId: "m_ltd" }] })
      const hepsi = (await yonetici.get("/gonderimler")).json<GonderimListResponse>()
      expect(hepsi.total).toBe(2)
      const elle = (await yonetici.get("/gonderimler?durum=ELLE&aliciTip=MUKELLEF")).json<GonderimListResponse>()
      expect(elle.items.map((g) => g.kaynak)).toEqual(["BORC"])
      const tasan = (await yonetici.get("/gonderimler?sayfa=9&sayfaBoyutu=1")).json<GonderimListResponse>()
      expect(tasan).toMatchObject({ sayfa: 2, sayfaBoyutu: 1 })
    })

    it("aynı bildirim aynı kişiye aynı kanaldan bir kez kuyruğa girer", async () => {
      const yeni = {
        kanal: "EPOSTA" as const,
        aliciTip: "PERSONEL" as const,
        aliciId: MEHMET,
        aliciAd: "Mehmet",
        hedefAdres: "mehmet@ornek.com",
        konu: "Konu",
        metin: "Metin",
        kaynak: "BILDIRIM" as const,
        anahtar: "BILDIRIM:i_1:p_2:EPOSTA",
      }
      expect(await gonderimler.kuyrugaAl([yeni])).toHaveLength(1)
      expect(await gonderimler.kuyrugaAl([yeni])).toHaveLength(0)
    })
  })

  describe("WhatsApp webhook", () => {
    const imzala = (govde: string, gizli = UYGULAMA_GIZLISI) =>
      `sha256=${createHmac("sha256", gizli).update(govde).digest("hex")}`
    const gonderWebhook = (govde: object, imza?: string) => {
      const ham = JSON.stringify(govde)
      return t.istek({
        method: "POST",
        url: "/api/webhooks/whatsapp",
        headers: {
          "content-type": "application/json",
          ...(imza !== undefined ? { "x-hub-signature-256": imza } : { "x-hub-signature-256": imzala(ham) }),
        },
        payload: ham,
      })
    }

    it("abonelik doğrulaması", async () => {
      const ok = await t.istek({
        method: "GET",
        url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=dogrulama-anahtari&hub.challenge=42",
      })
      expect(ok.statusCode).toBe(200)
      expect(ok.body).toBe("42")
      const yanlis = await t.istek({
        method: "GET",
        url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=42",
      })
      expect(yanlis.statusCode).toBe(403)
    })

    it("imzalı teslim hatası gönderimi HATA yapar; imzasız istek 403", async () => {
      await yonetici.put("/kanallar/WHATSAPP", WHATSAPP)
      const { sonuclar } = await gonder({ sablon: "BORC_HATIRLATMA", hedefler: [{ mukellefId: "m_ltd" }] })
      await gonderimler.bekleyenleriIsle()
      const [g] = await t.db.select().from(gonderim).where(eq(gonderim.id, sonuclar[0]!.gonderimId!))
      expect(g!.saglayiciId).toBeTruthy()
      const olay = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: g!.saglayiciId,
                      status: "failed",
                      errors: [{ code: 131026, message: "Message undeliverable" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      expect((await gonderWebhook(olay, "sha256=00")).statusCode).toBe(403)
      expect((await gonderWebhook(olay, imzala(JSON.stringify(olay), "baska"))).statusCode).toBe(403)
      expect((await gonderWebhook(olay)).statusCode).toBe(200)
      const [sonra] = await t.db
        .select()
        .from(gonderim)
        .where(and(eq(gonderim.id, g!.id), eq(gonderim.durum, "HATA")))
      expect(sonra!.hataMesaji).toBe("Message undeliverable (131026)")
    })
  })
})
