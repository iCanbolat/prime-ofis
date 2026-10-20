import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { gibOturumKodu } from "@prime/mock-data/gib-tebligat"
import { mockDogrulamaKodu } from "@prime/mock-data/kamu/mock-adapter"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type { GibTebligatBelgesi } from "@prime/shared/tebligat/gib-adapter"
import type {
  KamuDogrulamaCozResponse,
  KamuDogrulamaView,
  TebligatErisimSatiri,
  TebligatListResponse,
  TebligatMukellefTaraResponse,
  TebligatOzetResponse,
  TebligatView,
} from "@prime/shared/types/api"
import type { Gorev } from "@prime/shared/types/domain"

import {
  aktivite,
  arsivDosya,
  bildirim,
  credential,
  kamuDogrulama,
  tebligat,
  tebligatErisim,
} from "../src/db/schema/index.js"
import { HatirlatmaService } from "../src/hatirlatma/hatirlatma.service.js"
import { GibTebligat, KamuGiris } from "../src/tebligat/gib-adapter.js"
import { TebligatService } from "../src/tebligat/tebligat.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id
const PDF = "data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDw+PgplbmRvYmoK"

describe("e-Tebligat", () => {
  let t: TestUygulamasi
  let ben: Istemci
  let yonetici: Istemci
  let gib: GibTebligat
  let giris: KamuGiris

  beforeAll(async () => {
    t = await testUygulamasi()
    gib = t.app.get(GibTebligat)
    giris = t.app.get(KamuGiris)
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    vi.restoreAllMocks()
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
    ben = t.istemci(await t.girisYap(MEHMET))
    yonetici = t.istemci(await t.girisYap(YONETICI))
  })

  const servis = () => t.app.get(TebligatService)
  const liste = async (sorgu: Record<string, string> = {}) => {
    const qs = new URLSearchParams(sorgu).toString()
    const y = await ben.get(`/tebligat${qs ? `?${qs}` : ""}`)
    expect(y.statusCode, y.body).toBe(200)
    return y.json<TebligatListResponse>()
  }
  /** Kutuya verilen belgeleri döndüren sahte GİB kutusu (kullanıcı koduna göre) */
  const kutu = (belgeler: Record<string, { belgeId: string; belgeTuru: string }[]>) =>
    vi.spyOn(gib, "yeniBelgeler").mockImplementation(async (o) => ({
      gecerli: true,
      belgeler: (belgeler[gibOturumKodu(o)] ?? []).map(
        (b): GibTebligatBelgesi => ({
          ...b,
          kurum: "GIB",
          konu: b.belgeTuru,
          ulasmaTarihi: new Date(2026, 8, 22, 15, 0).toISOString(),
        })
      ),
    }))
  const erisimDb = async (id: string) =>
    (await t.db.select().from(tebligatErisim).where(eq(tebligatErisim.id, id)))[0]
  const bildirimler = (tur: string, aliciId: string) =>
    t.db
      .select()
      .from(bildirim)
      .where(and(eq(bildirim.tur, tur as never), eq(bildirim.aliciId, aliciId)))
  const gece = (an: Date) => {
    t.saat.sabitle(an)
    return servis().geceTaramasiCalistir()
  }

  describe("liste ve özet", () => {
    it("açıklar son güne göre önce; kapsam filtreleri", async () => {
      expect((await liste()).items.map((x) => x.id)).toEqual(["tb_acil", "tb_kapali"])
      const acil = (await liste({ kapsam: "acil" })).items
      expect(acil.map((x) => [x.id, x.kalanGun, x.sonIslemTarihi])).toEqual([
        ["tb_acil", 2, "2026-09-25"],
      ])
      expect((await liste({ kapsam: "kapali" })).total).toBe(1)
      expect((await liste({ mukellefId: "m_ltd" })).total).toBe(1)
      expect((await liste({ q: "çınar" })).total).toBe(1)
      // Geçersiz tür yok sayılır; taşan sayfa son sayfaya döner
      expect((await liste({ tur: "YOK" })).total).toBe(2)
      expect(await liste({ sayfa: "9", sayfaBoyutu: "1" })).toMatchObject({ sayfa: 2 })
    })

    it("özet: açık, acil, son gece taraması ve erişim sayıları", async () => {
      const y = await ben.get("/tebligat/ozet")
      expect(y.statusCode, y.body).toBe(200)
      const o = y.json<TebligatOzetResponse>()
      expect(o).toMatchObject({ acik: 1, acil: 1, geciken: 0 })
      expect(o.yaklasan.map((x) => x.id)).toEqual(["tb_acil"])
      expect(o.sonTarama).toMatchObject({ taranan: 2, hatali: 1, dogrulama: 0 })
      expect(o.erisim).toEqual({ aktif: 1, hatali: 1, tanimsiz: 1 })
      expect((await ben.get(`/tebligat/ozet?sorumlu=${MEHMET}`)).json()).toMatchObject({
        acik: 0,
      })
    })

    it("detay; yoksa 404; oturumsuz 401", async () => {
      const d = (await ben.get("/tebligat/tb_acil")).json<TebligatView>()
      expect(d).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        acik: true,
        sorumluPersonelId: "p_3",
      })
      expect((await ben.get("/tebligat/yok")).statusCode).toBe(404)
      expect((await t.istemci().get("/tebligat")).statusCode).toBe(401)
    })
  })

  describe("gece taraması", () => {
    it("erişimi aktif mükellefin yeni belgeleri kaydedilir; aynı belge iki kez kaydedilmez; hatalı atlanır", async () => {
      const okuma = kutu({
        "0174520662": [
          { belgeId: "gib-yeni-1", belgeTuru: "Vergi/Ceza İhbarnamesi" },
          { belgeId: "gib-f-1", belgeTuru: "Ödeme Emri" },
        ],
      })
      const an = new Date(2026, 8, 24, 3, 0)
      expect(await gece(an)).toMatchObject({ taranan: 2, hatali: 1, yeni: 1, dogrulama: 0 })
      // Hatalı erişim gece denenmez
      expect(okuma).toHaveBeenCalledTimes(1)

      const yeni = await t.db.select().from(tebligat).where(eq(tebligat.gibBelgeId, "gib-yeni-1"))
      expect(yeni).toHaveLength(1)
      expect(yeni[0]).toMatchObject({
        mukellefId: "m_ltd",
        vkn: "0174520662",
        tur: "VERGI_CEZA_IHBARNAMESI",
        durum: "YENI",
        kaynak: "GIB",
      })
      expect((await erisimDb("te_ltd"))?.sonTarama).toBe(an.toISOString())
      expect(await erisimDb("te_as")).toMatchObject({
        durum: "HATA",
        sonTarama: new Date(2026, 8, 20, 3, 0).toISOString(),
      })

      // Ertesi gece aynı belge yeniden listelense de çift kayıt olmaz
      expect(await gece(new Date(2026, 8, 25, 3, 0))).toMatchObject({ yeni: 0 })
      expect(
        await t.db.select().from(tebligat).where(eq(tebligat.gibBelgeId, "gib-yeni-1"))
      ).toHaveLength(1)
      // Sorumlu ve yöneticiye "Yeni e-Tebligat", aktör sistem
      expect(await bildirimler("TEBLIGAT_ALINDI", "p_1")).toHaveLength(1)
      expect(await bildirimler("TEBLIGAT_ALINDI", "p_3")).toHaveLength(1)
      const [log] = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, "TEBLIGAT_ALINDI"))
      expect(log).toMatchObject({ aktorId: "sistem", hedefTip: "TEBLIGAT" })
    })

    it("kutu okunamayınca erişim HATA'ya düşer, sorumluya bir kez bildirim gider", async () => {
      vi.spyOn(gib, "yeniBelgeler").mockResolvedValue({
        gecerli: false,
        hataMesaji: "GİB şifresinin süresi dolmuş",
      })
      await gece(new Date(2026, 8, 24, 3, 0))
      expect(await gece(new Date(2026, 8, 25, 3, 0))).toMatchObject({ hatali: 2 })
      expect(await erisimDb("te_ltd")).toMatchObject({
        durum: "HATA",
        hataMesaji: "GİB şifresinin süresi dolmuş",
      })
      expect(await bildirimler("TEBLIGAT_ERISIM_HATASI", "p_3")).toHaveLength(1)
    })

    it("eşzamanlı iki tarama aynı belgeyi bir kez yazar", async () => {
      kutu({ "0174520662": [{ belgeId: "gib-es-1", belgeTuru: "Ödeme Emri" }] })
      const sonuc = await Promise.all([
        ben.post("/tebligat/erisim/m_ltd/tara"),
        yonetici.post("/tebligat/erisim/m_ltd/tara"),
      ])
      expect(sonuc.map((y) => y.statusCode)).toEqual([200, 200])
      expect(
        sonuc.map((y) => y.json<TebligatMukellefTaraResponse>().yeni).sort()
      ).toEqual([0, 1])
      expect(
        await t.db.select().from(tebligat).where(eq(tebligat.gibBelgeId, "gib-es-1"))
      ).toHaveLength(1)
    })
  })

  describe("doğrulama ekranı", () => {
    it("gece girişi kod isterse mükellef atlanır; personel kodu girince kutu taranır", async () => {
      await t.db
        .update(tebligatErisim)
        .set({ kullaniciKodu: "dogrulama01" })
        .where(eq(tebligatErisim.id, "te_ltd"))
      const okuma = kutu({ dogrulama01: [{ belgeId: "gib-d-1", belgeTuru: "Ödeme Emri" }] })
      expect(await gece(new Date(2026, 8, 24, 3, 0))).toMatchObject({
        taranan: 2,
        hatali: 1,
        dogrulama: 1,
        yeni: 0,
      })
      const [d] = await t.db.select().from(kamuDogrulama)
      expect(d).toMatchObject({ mukellefId: "m_ltd", kurum: "GIB", bekleyenAdimlar: ["TEBLIGAT"] })
      expect(await bildirimler("KAMU_DOGRULAMA_BEKLIYOR", "p_3")).toHaveLength(1)

      // Bekleyen doğrulama varken ertesi gece yeniden giriş denenmez
      const girisSpy = vi.spyOn(giris, "giris")
      expect(await gece(new Date(2026, 8, 24, 3, 2))).toMatchObject({ dogrulama: 1 })
      expect(girisSpy).not.toHaveBeenCalled()
      expect(okuma).not.toHaveBeenCalled()

      // Oturum ertesi güne taşınan saatte düşer
      ben = t.istemci(await t.girisYap(MEHMET))
      const satir = (await ben.get("/tebligat/erisim/m_ltd")).json<TebligatErisimSatiri>()
      expect(satir.dogrulama).toMatchObject({ id: d!.id, suresiDoldu: false })
      expect(JSON.stringify(satir)).not.toContain(d!.oturumId)
      const tara = await ben.post("/tebligat/erisim/m_ltd/tara")
      expect(tara.json<TebligatMukellefTaraResponse>()).toMatchObject({
        yeni: 0,
        dogrulama: { id: d!.id },
      })
      const dlar = (await ben.get("/kamu-dogrulama?mukellefId=m_ltd")).json<KamuDogrulamaView[]>()
      expect(dlar.map((x) => x.id)).toEqual([d!.id])
      expect(JSON.stringify(dlar)).not.toContain(d!.oturumId)

      // Yanlış kod: 422 ve yeni görsel
      const yanlis = await ben.post(`/kamu-dogrulama/${d!.id}`, { kod: "00000" })
      expect(yanlis.statusCode).toBe(422)
      const [yeniD] = await t.db.select().from(kamuDogrulama)
      expect(yeniD!.oturumId).not.toBe(d!.oturumId)
      expect((await ben.post(`/kamu-dogrulama/${d!.id}`, { kod: "" })).statusCode).toBe(400)

      const coz = await ben.post(`/kamu-dogrulama/${d!.id}`, {
        kod: mockDogrulamaKodu(yeniD!.oturumId),
      })
      expect(coz.statusCode, coz.body).toBe(200)
      expect(coz.json<KamuDogrulamaCozResponse>().ozet).toEqual(["1 yeni e-Tebligat"])
      expect(await t.db.select().from(kamuDogrulama)).toHaveLength(0)
      expect((await erisimDb("te_ltd"))?.sonTarama).toBe(new Date(2026, 8, 24, 3, 2).toISOString())
      // İkinci çözüm denemesi 404
      expect((await ben.post(`/kamu-dogrulama/${d!.id}`, { kod: "12345" })).statusCode).toBe(404)
    })

    it("görselin süresi dolunca 410; yenilenince yeni görsel", async () => {
      await t.db
        .update(tebligatErisim)
        .set({ kullaniciKodu: "dogrulama01" })
        .where(eq(tebligatErisim.id, "te_ltd"))
      const r = (await ben.post("/tebligat/erisim/m_ltd/tara")).json<TebligatMukellefTaraResponse>()
      const id = r.dogrulama!.id
      // Personel tetiklediyse "kod bekleniyor" bildirimi gitmez
      expect(await bildirimler("KAMU_DOGRULAMA_BEKLIYOR", "p_3")).toHaveLength(0)
      t.saat.sabitle(new Date(2026, 8, 23, 10, 6))
      expect((await ben.post(`/kamu-dogrulama/${id}`, { kod: "12345" })).statusCode).toBe(410)
      const y = await ben.post(`/kamu-dogrulama/${id}/yenile`)
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json<KamuDogrulamaView>()).toMatchObject({ id, suresiDoldu: false })
      expect((await ben.post("/kamu-dogrulama/yok/yenile")).statusCode).toBe(404)
    })

    it("erişim kaydında kod istenirse erişim kaydedilir ve doğrulama açılır; şifre değişince ya da erişim kaldırılınca düşer", async () => {
      vi.spyOn(giris, "giris").mockResolvedValueOnce({
        durum: "DOGRULAMA",
        oturumId: "dg-GIB-test",
        gorselDataUrl: "data:image/svg+xml;charset=utf-8,x",
      })
      const s = (
        await ben.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "10000000146", sifre: "ivd-1234" })
      ).json<TebligatErisimSatiri>()
      expect(s).toMatchObject({ durum: "AKTIF", dogrulama: { bekleyenAdimlar: ["TEBLIGAT"] } })

      const g = (
        await ben.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "10000000146", sifre: "ivd-5678" })
      ).json<TebligatErisimSatiri>()
      expect(g.dogrulama).toBeNull()
      expect(await t.db.select().from(kamuDogrulama)).toHaveLength(0)

      vi.spyOn(giris, "giris").mockResolvedValueOnce({
        durum: "DOGRULAMA",
        oturumId: "dg-GIB-test2",
        gorselDataUrl: "data:image/svg+xml;charset=utf-8,x",
      })
      await ben.post("/tebligat/erisim/m_sahis/tara")
      expect(await t.db.select().from(kamuDogrulama)).toHaveLength(1)
      expect((await ben.delete("/tebligat/erisim/m_sahis")).statusCode).toBe(204)
      expect(await t.db.select().from(kamuDogrulama)).toHaveLength(0)
    })
  })

  describe("GİB erişimi", () => {
    it("liste: hatalı ve tanımsız önce; şifre saklanmaz, yalnızca son 4 karakter; hatalı şifre 422", async () => {
      const satirlar = (await ben.get("/tebligat/erisim")).json<TebligatErisimSatiri[]>()
      expect(satirlar.map((s) => [s.mukellefId, s.durum])).toEqual([
        ["m_sahis", "TANIMSIZ"],
        ["m_as", "HATA"],
        ["m_ltd", "AKTIF"],
      ])
      expect((await ben.get("/tebligat/erisim?durum=HATA")).json()).toHaveLength(1)

      const sifre = "ivd-sifresi-7k2p"
      expect(
        (
          await ben.put("/tebligat/erisim/m_sahis", {
            kullaniciKodu: "10000000146",
            sifre: "hatali-sifre",
          })
        ).statusCode
      ).toBe(422)
      expect(
        (await ben.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "12", sifre })).statusCode
      ).toBe(400)
      expect(
        (await ben.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "10000000146", sifre: "abc" }))
          .statusCode
      ).toBe(400)
      expect(
        (await ben.put("/tebligat/erisim/m_yok", { kullaniciKodu: "10000000146", sifre }))
          .statusCode
      ).toBe(404)
      const y = await ben.put("/tebligat/erisim/m_sahis", { kullaniciKodu: "10000000146", sifre })
      expect(y.statusCode, y.body).toBe(200)
      const s = y.json<TebligatErisimSatiri>()
      expect(s).toMatchObject({
        durum: "AKTIF",
        erisim: { kullaniciKodu: "10000000146", sifreIpucu: "7k2p" },
      })
      expect(y.body).not.toContain(sifre)
      expect(y.body).not.toContain("sifreEnc")
      const [kayit] = await t.db
        .select()
        .from(tebligatErisim)
        .where(eq(tebligatErisim.mukellefId, "m_sahis"))
      expect(kayit!.sifreEnc).not.toContain(sifre)
      expect(
        await t.db.select().from(aktivite).where(eq(aktivite.eylem, "TEBLIGAT_ERISIMI_TANIMLANDI"))
      ).toHaveLength(1)

      expect((await ben.delete("/tebligat/erisim/m_sahis")).statusCode).toBe(204)
      expect((await ben.delete("/tebligat/erisim/m_sahis")).statusCode).toBe(404)
      expect(
        (await ben.get("/tebligat/erisim/m_sahis")).json<TebligatErisimSatiri>().durum
      ).toBe("TANIMSIZ")
    })

    it("şifre güncellenince hatalı erişim düzelir; tek mükellef hemen taranabilir", async () => {
      expect((await ben.post("/tebligat/erisim/m_as/tara")).statusCode).toBe(409)
      const giden = vi.spyOn(giris, "giris")
      await ben.put("/tebligat/erisim/m_as", { kullaniciKodu: "9358005601", sifre: "yeni-sifre" })
      // Kasa şifresi değil, girilen şifre denenir
      expect(giden).toHaveBeenCalledWith({
        kurum: "GIB",
        kullaniciKodu: "9358005601",
        sifre: "yeni-sifre",
      })
      kutu({})
      const r = await ben.post("/tebligat/erisim/m_as/tara")
      expect(r.statusCode, r.body).toBe(200)
      const yanit = r.json<TebligatMukellefTaraResponse>()
      expect(yanit.erisim).toMatchObject({ durum: "AKTIF" })
      expect(yanit.erisim.sonTarama).toBe(new Date(2026, 8, 23, 10, 0).toISOString())
      // Şifre güncellemesi son başarılı taramayı silmez; gece ikinci giriş de çözülmüş şifreyle
      expect(giden).toHaveBeenLastCalledWith({
        kurum: "GIB",
        kullaniciKodu: "9358005601",
        sifre: "yeni-sifre",
      })
      expect((await ben.post("/tebligat/erisim/m_sahis/tara")).statusCode).toBe(404)
    })
  })

  describe("kasadan aktarım", () => {
    const ivdKaydi = async (mukellefId: string, sistem: "IVD" | "GIB" = "IVD") => {
      const [k] = await t.db
        .insert(credential)
        .values({
          id: `c_${mukellefId}_${sistem}`,
          mukellefId,
          sistem,
          kullaniciAdi: "10000000146",
          cipherText: "eA==",
          iv: "eA==",
          sonGuncelleme: new Date(2026, 8, 1).toISOString(),
          guncelleyenId: "p_1",
        })
        .onConflictDoUpdate({
          target: [credential.mukellefId, credential.sistem],
          set: { sonGuncelleme: new Date(2026, 8, 1).toISOString() },
        })
        .returning()
      return k!
    }

    it("kaynak kasa kaydı saklanır, erişim geçmişine yazılır; kasa sonradan değişince 'daha yeni' döner", async () => {
      const k = await ivdKaydi("m_sahis")
      const s = (
        await ben.put("/tebligat/erisim/m_sahis", {
          kullaniciKodu: "10000000146",
          sifre: "kasadaki-sifre",
          kasaCredentialId: k.id,
        })
      ).json<TebligatErisimSatiri>()
      expect(s).toMatchObject({
        kasaKaydiId: k.id,
        kasaDahaYeni: false,
        erisim: { kasaKaynagi: { credentialId: k.id, credentialGuncelleme: k.sonGuncelleme } },
      })
      expect(
        await t.db
          .select()
          .from(aktivite)
          .where(and(eq(aktivite.eylem, "SIFRE_TEBLIGATA_AKTARILDI"), eq(aktivite.hedefId, k.id)))
      ).toHaveLength(1)

      await t.db
        .update(credential)
        .set({ sonGuncelleme: new Date(2026, 8, 20).toISOString() })
        .where(eq(credential.id, k.id))
      expect(
        (await ben.get("/tebligat/erisim/m_sahis")).json<TebligatErisimSatiri>().kasaDahaYeni
      ).toBe(true)

      // Elle girilen şifre kasa bağını koparır
      const elle = (
        await ben.put("/tebligat/erisim/m_sahis", {
          kullaniciKodu: "10000000146",
          sifre: "elle-girilen",
        })
      ).json<TebligatErisimSatiri>()
      expect(elle.erisim?.kasaKaynagi).toBeUndefined()
      expect(elle.kasaDahaYeni).toBe(false)
    })

    it("başka mükellefin ya da İnteraktif VD olmayan kayıt reddedilir", async () => {
      const baska = await ivdKaydi("m_as")
      const gibKaydi = await ivdKaydi("m_sahis", "GIB")
      for (const id of [baska.id, gibKaydi.id, "c_yok"])
        expect(
          (
            await ben.put("/tebligat/erisim/m_sahis", {
              kullaniciKodu: "10000000146",
              sifre: "kasadaki-sifre",
              kasaCredentialId: id,
            })
          ).statusCode
        ).toBe(400)
    })
  })

  describe("güncelleme, görev ve belge", () => {
    it("sorumlu atanınca bildirim gider", async () => {
      const y = await yonetici.patch("/tebligat/tb_acil", { atananId: MEHMET, durum: "INCELENDI" })
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json<TebligatView>()).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        atananAd: "Mehmet Kaya",
        durum: "INCELENDI",
      })
      const b = await bildirimler("TEBLIGAT_GUNCELLENDI", MEHMET)
      expect(b.map((x) => x.baslik)).toEqual(["Bir e-Tebligat size atandı"])
      expect((await ben.patch("/tebligat/tb_acil", { durum: "YOK" })).statusCode).toBe(400)
      expect((await ben.patch("/tebligat/tb_acil", { atananId: "p_yok" })).statusCode).toBe(400)
      expect((await ben.patch("/tebligat/tb_acil", { sureGun: 0 })).statusCode).toBe(400)
      expect((await ben.patch("/tebligat/yok", {})).statusCode).toBe(404)
    })

    it("yalnızca not değişince aktivite yazılmaz; atama kaldırılabilir", async () => {
      await ben.patch("/tebligat/tb_kapali", { not: "  Cevap verildi  " })
      expect(
        await t.db.select().from(aktivite).where(eq(aktivite.eylem, "TEBLIGAT_GUNCELLENDI"))
      ).toHaveLength(0)
      const v = (await ben.patch("/tebligat/tb_kapali", { atananId: null })).json<TebligatView>()
      expect(v).toMatchObject({ not: "Cevap verildi" })
      expect(v.atananId).toBeUndefined()
    })

    it("görev son işlem gününe açılır, ikinci kez açılamaz", async () => {
      const y = await ben.post("/tebligat/tb_acil/gorev")
      expect(y.statusCode, y.body).toBe(201)
      const g = y.json<Gorev>()
      expect(g).toMatchObject({
        mukellefId: "m_ltd",
        sonTarih: "2026-09-25",
        oncelik: "YUKSEK",
        atananId: "p_3",
        tip: "DIGER",
      })
      expect((await ben.get("/tebligat/tb_acil")).json<TebligatView>()).toMatchObject({
        gorevId: g.id,
        durum: "INCELENDI",
      })
      expect((await ben.post("/tebligat/tb_acil/gorev")).statusCode).toBe(409)
      // Görev atanana bildirim
      expect(await bildirimler("GOREV_OLUSTURULDU", "p_3")).toHaveLength(1)
    })

    it("özel süre son günü değiştirir; belge arşive TEBLIGAT kategorisinde", async () => {
      const v = (await ben.patch("/tebligat/tb_acil", { sureGun: 30 })).json<TebligatView>()
      expect(v.sonIslemTarihi).toBe("2026-10-12")
      const y = await ben.post("/tebligat/tb_acil/belge", {
        dosya: { ad: "odeme-emri.pdf", dataUrl: PDF },
      })
      expect(y.statusCode, y.body).toBe(201)
      const b = y.json<TebligatView>()
      const [a] = await t.db.select().from(arsivDosya).where(eq(arsivDosya.id, b.arsivDosyaId!))
      expect(a).toMatchObject({ mukellefId: "m_ltd", kategori: "TEBLIGAT", mimeType: "application/pdf" })
      expect(t.depo.nesneler.has(`arsiv/m_ltd/${a!.id}`)).toBe(true)
      expect(
        (
          await ben.post("/tebligat/tb_acil/belge", {
            dosya: { ad: "x.txt", dataUrl: "data:text/plain;base64,eHh4" },
          })
        ).statusCode
      ).toBe(400)
    })

    it("elle kayıt; gelecek tarih reddedilir", async () => {
      const y = await ben.post("/tebligat", {
        mukellefId: "m_sahis",
        kurum: "GIB",
        tur: "IZAHA_DAVET",
        konu: "İzaha davet",
        ulasmaGunu: "2026-09-22",
      })
      expect(y.statusCode, y.body).toBe(201)
      expect(y.json<TebligatView>()).toMatchObject({
        kaynak: "ELLE",
        vkn: "10000000146",
        atananId: MEHMET,
        ulasmaTarihi: new Date(2026, 8, 22, 9, 0).toISOString(),
      })
      const kotu = (govde: Record<string, unknown>) =>
        ben
          .post("/tebligat", {
            mukellefId: "m_sahis",
            kurum: "GIB",
            tur: "DIGER",
            konu: "x",
            ulasmaGunu: "2026-09-22",
            ...govde,
          })
          .then((r) => r.statusCode)
      expect(await kotu({ ulasmaGunu: "2026-09-30" })).toBe(400)
      expect(await kotu({ mukellefId: "m_yok" })).toBe(400)
      expect(await kotu({ tur: "YOK" })).toBe(400)
      expect(await kotu({ konu: " " })).toBe(400)
      expect(await kotu({ sureGun: 400 })).toBe(400)
    })
  })

  describe("hatırlatma", () => {
    it("son günü yaklaşan açık tebligat için sorumluya bildirim", async () => {
      await t.app.get(HatirlatmaService).uret()
      const b = await bildirimler("TEBLIGAT_SURE_YAKLASIYOR", "p_3")
      expect(b).toHaveLength(1)
      expect(b[0]).toMatchObject({
        baslik: "e-Tebligat süresinin dolmasına 2 gün kaldı",
        link: "/tebligat?tebligat=tb_acil",
      })
    })
  })
})
