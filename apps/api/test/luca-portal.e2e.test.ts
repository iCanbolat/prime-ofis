import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { mockFaturaKalemleri } from "@prime/mock-data/entegrator"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { mockDogrulamaKodu } from "@prime/mock-data/kamu/mock-adapter"
import {
  LUCA_EK_FIRMALAR,
  lucaFirmaId,
  mockUblXml,
  type MockLucaPortal,
} from "@prime/mock-data/luca-portal"
import { lucaFirmaTuru } from "@prime/shared/e-belge/luca-mukellef"
import { ublKalemleri } from "@prime/shared/e-belge/ubl-kalemler"
import type {
  EBelgeDetay,
  KontorOzetResponse,
  LucaFirmaAktarimSonucu,
  LucaDogrulamaView,
  LucaFirma,
  LucaHesapView,
  SenkronResponse,
} from "@prime/shared/types/api"

import { aktivite, ebelge, entegratorBaglanti, lucaHesap, mukellef } from "../src/db/schema/index.js"
import { LucaPortal } from "../src/e-belge/luca-portal/luca-portal.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id
const LTD = "m_ltd"

describe("Luca portalı", () => {
  let t: TestUygulamasi
  let ben: Istemci
  let yonetici: Istemci

  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    ben = t.istemci(await t.girisYap(MEHMET))
    yonetici = t.istemci(await t.girisYap(YONETICI))
  })

  const portal = () => t.app.get(LucaPortal) as unknown as MockLucaPortal
  const hesapSatiri = async () => (await t.db.select().from(lucaHesap))[0]
  const bagla = () => yonetici.put("/luca-hesap", { kullanici: "12345678901", sifre: "gizli-sifre-1234" })

  describe("hesap", () => {
    it("fixture hesabı bağlı, şifre şifreli; tanımlı değilse 404; yalnızca yönetici kaydeder", async () => {
      expect((await ben.get("/luca-hesap")).json<LucaHesapView>()).toMatchObject({
        kullanici: "12345678901",
        durum: "BAGLI",
      })
      expect((await hesapSatiri())!.sifre).toMatch(/^v1:/)
      await t.db.delete(lucaHesap)
      expect((await ben.get("/luca-hesap")).statusCode).toBe(404)
      const y = await ben.put("/luca-hesap", { kullanici: "a", sifre: "b" })
      expect(y.statusCode).toBe(403)

      const k = await bagla()
      expect(k.statusCode, k.body).toBe(200)
      expect(k.body).not.toContain("gizli-sifre")
      expect(k.json<LucaHesapView>()).toMatchObject({
        kullanici: "12345678901",
        sifreIpucu: "1234",
        durum: "BAGLI",
        sonGiris: t.saat.simdiIso(),
      })
      const s = await hesapSatiri()
      expect(s!.sifre).not.toContain("gizli-sifre")
      expect(s!.sifre.startsWith("v1:")).toBe(true)
    })

    it("hatalı şifre 422 ve HATA; şifre değişene kadar giriş denenmez", async () => {
      const y = await yonetici.put("/luca-hesap", { kullanici: "12345678901", sifre: "hatali" })
      expect(y.statusCode).toBe(422)
      expect((await ben.get("/luca-hesap")).json<LucaHesapView>().durum).toBe("HATA")
      // HATA'da firma listesi yeniden giriş denemeden 409 döner
      const f = await ben.get("/luca-hesap/firmalar")
      expect(f.statusCode).toBe(409)
      expect(f.json<{ message: string }>().message).toContain("Luca hesabı")
    })

    it("kullanıcı adı aynıysa şifre boş geçilebilir; farklıysa zorunlu", async () => {
      await bagla()
      expect((await yonetici.put("/luca-hesap", { kullanici: "12345678901" })).statusCode).toBe(200)
      expect((await yonetici.put("/luca-hesap", { kullanici: "baska" })).statusCode).toBe(400)
    })

    it("silinince oturum da kapanır", async () => {
      await bagla()
      expect((await yonetici.delete("/luca-hesap")).statusCode).toBe(204)
      expect((await ben.get("/luca-hesap/firmalar")).statusCode).toBe(409)
      const [a] = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "LUCA_HESABI_KALDIRILDI"))
      expect(a).toBeDefined()
    })
  })

  describe("doğrulama (CAPTCHA personel tarafından)", () => {
    const dogrulamaIste = async () => {
      const y = await yonetici.put("/luca-hesap", { kullanici: "dogrulama-01", sifre: "sifre-9876" })
      expect(y.statusCode).toBe(409)
      expect(y.json()).toMatchObject({ dogrulama: true })
    }

    it("görsel verilir, portal oturum kimliği dönmez; doğru kodla BAGLI", async () => {
      await dogrulamaIste()
      const g = await ben.get("/luca-dogrulama")
      expect(g.statusCode).toBe(200)
      const d = g.json<LucaDogrulamaView>()
      expect(d.gorselDataUrl).toMatch(/^data:image\/svg/)
      const oturumId = (await hesapSatiri())!.dogrulamaOturumId!
      expect(g.body).not.toContain(oturumId)

      const y = await ben.post("/luca-dogrulama", { kod: mockDogrulamaKodu(oturumId) })
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json<LucaHesapView>().durum).toBe("BAGLI")
      expect((await hesapSatiri())!.dogrulamaGorsel).toBeNull()
    })

    it("yanlış kod 422 + yeni görsel; süresi dolunca 410, yenileyince yeni süre", async () => {
      await dogrulamaIste()
      const ilk = (await hesapSatiri())!.dogrulamaOturumId
      const y = await ben.post("/luca-dogrulama", { kod: "00000" })
      expect(y.statusCode).toBe(422)
      expect(y.json()).toMatchObject({ dogrulama: true })
      expect((await hesapSatiri())!.dogrulamaOturumId).not.toBe(ilk)

      t.saat.sabitle(new Date(2026, 8, 23, 10, 6))
      expect((await ben.post("/luca-dogrulama", { kod: "12345" })).statusCode).toBe(410)
      const yeni = await ben.post("/luca-dogrulama/yenile")
      expect(yeni.statusCode).toBe(200)
      expect(yeni.json<LucaDogrulamaView>().sonGecerlilik > t.saat.simdiIso()).toBe(true)
    })

    it("boş kod 400; bekleyen doğrulama yoksa 404", async () => {
      expect((await ben.post("/luca-dogrulama", { kod: "1" })).statusCode).toBe(404)
      await dogrulamaIste()
      expect((await ben.post("/luca-dogrulama", { kod: " " })).statusCode).toBe(400)
    })
  })

  describe("firma eşleme ve senkron", () => {
    it("firmalar: eşli mükellef, VKN'si kayıtlı mükellef ve uygulamada olmayan firmalar", async () => {
      const f = await ben.get("/luca-hesap/firmalar")
      expect(f.statusCode).toBe(200)
      const liste = f.json<LucaFirma[]>()
      expect(liste.find((x) => x.firmaId === lucaFirmaId(LTD))).toMatchObject({ mukellefId: LTD })
      // m_sahis'in bağlantısı yok: VKN/TCKN eşleşmesi önerilir
      expect(liste.find((x) => x.firmaId === lucaFirmaId("m_sahis"))).toMatchObject({
        eslesenMukellefId: "m_sahis",
      })
      const ekler = liste.filter((x) => LUCA_EK_FIRMALAR.some((e) => e.firmaId === x.firmaId))
      expect(ekler).toHaveLength(LUCA_EK_FIRMALAR.length)
      expect(ekler.every((x) => !x.mukellefId && !x.eslesenMukellefId)).toBe(true)
    })

    it("senkron faturaları ve kontör bakiyesini alır", async () => {
      const y = await ben.post("/e-belge/senkron", { mukellefId: LTD })
      expect(y.statusCode, y.body).toBe(200)
      const s = y.json<SenkronResponse>()
      expect(s.hatali).toEqual([])
      expect(s.mukellefSayisi).toBe(1)

      const k = (await ben.get("/e-belge/kontor")).json<KontorOzetResponse>()
      expect(k.lucaBakiye).toBe(k.kalan)
      expect(k.lucaBakiyeTarihi).toBe(t.saat.simdiIso())
    })

    it("oturum düşerse bir kez yeniden giriş yapılır", async () => {
      portal().oturumlariDusur()
      const y = await ben.post("/e-belge/senkron", { mukellefId: LTD })
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json<SenkronResponse>().hatali).toEqual([])
    })

    it("yeniden girişte doğrulama istenirse senkron 409 dogrulama ile durur", async () => {
      await yonetici.put("/luca-hesap", { kullanici: "dogrulama-01", sifre: "sifre-9876" })
      const oturumId = (await hesapSatiri())!.dogrulamaOturumId!
      await ben.post("/luca-dogrulama", { kod: mockDogrulamaKodu(oturumId) })
      portal().oturumlariDusur()

      const y = await ben.post("/e-belge/senkron")
      expect(y.statusCode).toBe(409)
      expect(y.json()).toMatchObject({ dogrulama: true })
      expect((await hesapSatiri())!.durum).toBe("DOGRULAMA")
    })

    it("fatura kalemleri faturanın XML'inden okunur", async () => {
      const [f] = await t.db.select().from(ebelge).where(eq(ebelge.id, "f_bekleyen"))
      const d = await ben.get("/e-belge/faturalar/f_bekleyen")
      expect(d.statusCode, d.body).toBe(200)
      expect(d.json<EBelgeDetay>().kalemler).toEqual(mockFaturaKalemleri(f!))
    })
  })

  describe("Luca firmalarından mükellef", () => {
    const aktar = (kim: Istemci, firmaIdler: string[], sorumluPersonelId = MEHMET) =>
      kim.post("/luca-hesap/firmalar/aktar", { firmaIdler, sorumluPersonelId })
    const [ltdFirma, , , , sahisFirma] = LUCA_EK_FIRMALAR

    it("yalnızca yönetici; firma ve sorumlu zorunlu", async () => {
      expect((await aktar(ben, [ltdFirma!.firmaId])).statusCode).toBe(403)
      expect((await aktar(yonetici, [])).statusCode).toBe(400)
      expect(
        (await yonetici.post("/luca-hesap/firmalar/aktar", { firmaIdler: ["LE-001"] })).statusCode
      ).toBe(400)
    })

    it("yeni mükellef açar ve eşler, kayıtlı VKN'yi eşler, eşliyi atlar, bilinmeyeni raporlar", async () => {
      const y = await aktar(yonetici, [
        ltdFirma!.firmaId,
        sahisFirma!.firmaId,
        lucaFirmaId("m_sahis"),
        lucaFirmaId(LTD),
        "LE-yok",
      ])
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json<LucaFirmaAktarimSonucu>()).toEqual({
        olusturulan: 2,
        eslenen: 1,
        atlanan: 1,
        hatalar: [{ firmaId: "LE-yok", unvan: "—", mesaj: "Firma Luca hesabında bulunamadı" }],
      })

      const [sirket] = await t.db.select().from(mukellef).where(eq(mukellef.vkn, ltdFirma!.vknTckn!))
      expect(sirket).toMatchObject({
        tur: "LTD",
        unvan: ltdFirma!.unvan,
        vergiDairesi: ltdFirma!.vergiDairesi,
        il: ltdFirma!.il,
        sorumluPersonelId: MEHMET,
        defterTuru: "BILANCO",
        eDefterMukellefi: true,
      })
      const [sahis] = await t.db.select().from(mukellef).where(eq(mukellef.tckn, sahisFirma!.vknTckn!))
      expect(sahis).toMatchObject({ tur: "SAHIS", defterTuru: "ISLETME", vkn: null })

      const [b] = await t.db
        .select()
        .from(entegratorBaglanti)
        .where(eq(entegratorBaglanti.mukellefId, sirket!.id))
      expect(b).toMatchObject({ durum: "BAGLI", lucaFirmaId: ltdFirma!.firmaId, eFatura: true })
      const [sahisBag] = await t.db
        .select()
        .from(entegratorBaglanti)
        .where(eq(entegratorBaglanti.mukellefId, "m_sahis"))
      expect(sahisBag?.lucaFirmaId).toBe(lucaFirmaId("m_sahis"))

      // Ek firmadan açılan mükellef listede ikinci kez görünmez; tekrar aktarım atlanır
      const liste = (await ben.get("/luca-hesap/firmalar")).json<LucaFirma[]>()
      expect(liste.filter((f) => f.vknTckn === ltdFirma!.vknTckn)).toEqual([
        expect.objectContaining({ firmaId: ltdFirma!.firmaId, mukellefId: sirket!.id }),
      ])
      expect((await aktar(yonetici, [ltdFirma!.firmaId])).json<LucaFirmaAktarimSonucu>().atlanan).toBe(1)

      const loglar = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, "LUCA_FIRMALARI_AKTARILDI"))
      expect(loglar.map((l) => l.aciklama)).toEqual(["2 yeni mükellef, 1 eşleme"])
    })

    it("aktarılan mükellef senkronlanır", async () => {
      await aktar(yonetici, [ltdFirma!.firmaId])
      const [m] = await t.db.select().from(mukellef).where(eq(mukellef.vkn, ltdFirma!.vknTckn!))
      const s = await ben.post("/e-belge/senkron", { mukellefId: m!.id })
      expect(s.statusCode, s.body).toBe(200)
      expect(s.json<SenkronResponse>()).toMatchObject({ mukellefSayisi: 1, hatali: [] })
    })
  })
})

describe("UBL kalem ayrıştırıcı", () => {
  it("mock XML ile kalemleri birebir geri verir", () => {
    const f = {
      ettn: "3f1c2b7a-0000-4000-8000-000000000001",
      belgeNo: "ABC2026000000123",
      faturaTipi: "SATIS" as const,
      matrah: 1234.56,
      kdv: 246.91,
      paraBirimi: "TRY" as const,
    }
    expect(ublKalemleri(mockUblXml(f))).toEqual(mockFaturaKalemleri(f))
  })

  it("ad alanı öneki, varlıklar ve KDV dışı vergi alt toplamı", () => {
    const xml = `<inv:Invoice xmlns:inv="x"><inv:InvoiceLine><x:ID>2</x:ID>
      <x:InvoicedQuantity unitCode="HUR">3.5</x:InvoicedQuantity>
      <x:LineExtensionAmount>700.00</x:LineExtensionAmount>
      <y:TaxTotal><y:TaxSubtotal><x:Percent>0.5</x:Percent><y:TaxCategory><y:TaxScheme><x:TaxTypeCode>9015</x:TaxTypeCode></y:TaxScheme></y:TaxCategory></y:TaxSubtotal>
      <y:TaxSubtotal><x:Percent>20</x:Percent><y:TaxCategory><y:TaxScheme><x:TaxTypeCode>0015</x:TaxTypeCode></y:TaxScheme></y:TaxCategory></y:TaxSubtotal></y:TaxTotal>
      <y:Item><x:Name>Danışmanlık &amp; eğitim</x:Name></y:Item>
      <y:Price><x:PriceAmount>200</x:PriceAmount></y:Price></inv:InvoiceLine></inv:Invoice>`
    expect(ublKalemleri(xml)).toEqual([
      { sira: 2, ad: "Danışmanlık & eğitim", miktar: 3.5, birim: "Saat", birimFiyat: 200, kdvOrani: 20, tutar: 700 },
    ])
  })
})

describe("Luca firması → mükellef türü", () => {
  it("kart türü öncelikli; yoksa TCKN şahıs, unvanda A.Ş. anonim, diğerleri limited", () => {
    expect(lucaFirmaTuru({ tur: "AS", unvan: "X Ltd. Şti.", vknTckn: "1" })).toBe("AS")
    expect(lucaFirmaTuru({ unvan: "Ayşe Kaya", vknTckn: "10000000146" })).toBe("SAHIS")
    expect(lucaFirmaTuru({ unvan: "Kuzey Enerji A.Ş.", vknTckn: "1234567890" })).toBe("AS")
    expect(lucaFirmaTuru({ unvan: "Kuzey Enerji AŞ", vknTckn: "1234567890" })).toBe("AS")
    expect(lucaFirmaTuru({ unvan: "Mavi Anonim Şirketi", vknTckn: "1234567890" })).toBe("AS")
    expect(lucaFirmaTuru({ unvan: "Ege Gıda Ltd. Şti.", vknTckn: "1234567890" })).toBe("LTD")
  })
})
