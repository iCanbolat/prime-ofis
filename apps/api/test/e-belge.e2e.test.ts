import { and, desc, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  BeratListResponse,
  EBelgeDetay,
  EBelgeListResponse,
  EBelgeOzetResponse,
  EBelgeView,
  EntegratorBaglantiView,
  KontorAlimView,
  KontorOzetResponse,
  SenkronResponse,
  TakvimOlayi,
} from "@prime/shared/types/api"

import {
  aktivite,
  arsivDosya,
  bildirim,
  ebelge,
  edefterBerat,
  entegratorBaglanti,
  kontorAlim,
  takvimDurum,
} from "../src/db/schema/index.js"
import { HatirlatmaService } from "../src/hatirlatma/hatirlatma.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id

describe("e-Belge", () => {
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

  const liste = async (sorgu: Record<string, string | number | boolean> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(sorgu).map(([k, v]): [string, string] => [k, String(v)])
    ).toString()
    const y = await ben.get(`/e-belge/faturalar${qs ? `?${qs}` : ""}`)
    expect(y.statusCode, y.body).toBe(200)
    return y.json<EBelgeListResponse>()
  }
  const idler = async (sorgu: Record<string, string | number | boolean> = {}) =>
    (await liste(sorgu)).items.map((f) => f.id)
  const yanit = (id: string, body: Record<string, unknown>) =>
    ben.post(`/e-belge/faturalar/${id}/yanit`, body)
  /** Saat sabit olduğu için sıralama zamana güvenemez: eyleme göre son kayıt */
  const sonAktivite = async (eylem: string) =>
    (
      await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, eylem as never))
        .orderBy(desc(aktivite.zaman))
    ).at(-1)

  describe("GET /e-belge/faturalar", () => {
    it("düzenleme tarihine göre yeniden eskiye; tür, yön ve yanıt filtreleri", async () => {
      expect(await idler({ tur: "E_FATURA", yon: "GELEN" })).toEqual([
        "f_bekleyen",
        "f_yakin",
        "f_temel",
        "f_doldu",
        "f_kabul",
      ])
      expect(await idler({ tur: "E_ARSIV" })).toEqual(["f_arsiv"])
      expect(await idler({ gibDurumu: "ISLENIYOR" })).toEqual(["f_giden"])
      expect(await idler({ yanit: "BEKLIYOR" })).toEqual(["f_bekleyen", "f_yakin"])
      expect(await idler({ yanit: "SURESI_DOLDU" })).toEqual(["f_doldu"])
      expect(await idler({ yanitYaklasan: true })).toEqual(["f_yakin"])
      expect(await idler({ mukellefId: "m_as" })).toEqual(["f_as"])
    })

    it("arama belge no, karşı taraf ve VKN'de; tarih aralığı ve sıralama", async () => {
      expect(await idler({ q: "mavi yapı" })).toEqual(["f_giden", "f_hata"])
      expect(await idler({ q: "6470152733" })).toEqual(["f_yakin"])
      expect(await idler({ q: "CNR2026000000051" })).toEqual(["f_hata"])
      expect(await idler({ baslangic: "2026-09-10", bitis: "2026-09-16" })).toEqual([
        "f_yakin",
        "f_arsiv",
        "f_temel",
      ])
      const tutar = await liste({ sirala: "toplam", siralamaYonu: "desc" })
      expect(tutar.items[0]?.id).toBe("f_giden")
    })

    it("sayfalar (taşan sayfa boş); toplam tutar yalnızca TL faturaları kapsar", async () => {
      const sayfa2 = await liste({ sayfa: 2, sayfaBoyutu: 4 })
      expect(sayfa2).toMatchObject({ total: 9, sayfa: 2, sayfaBoyutu: 4 })
      expect(sayfa2.items).toHaveLength(4)
      expect(sayfa2.toplamTutar).toBe(75_600)
      expect((await liste({ sayfa: 9, sayfaBoyutu: 4 })).items).toEqual([])
    })

    it("görünüm mükellef adını ve kalan yanıt gününü taşır", async () => {
      const [bekleyen, yakin] = (await liste({ yanit: "BEKLIYOR" })).items
      expect(bekleyen).toMatchObject({
        mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
        yanitKalanGun: 6,
      })
      expect(yakin?.yanitKalanGun).toBe(1)
    })

    it("geçersiz filtre 400", async () => {
      expect((await ben.get("/e-belge/faturalar?yanit=BELKI")).json()).toEqual({
        message: "Geçersiz yanıt durumu",
      })
      expect((await ben.get("/e-belge/faturalar?baslangic=23.09.2026")).statusCode).toBe(400)
    })
  })

  describe("detay ve içerik", () => {
    it("kalemler deterministiktir ve toplamı matraha eşittir", async () => {
      const detay = (await ben.get("/e-belge/faturalar/f_giden")).json<EBelgeDetay>()
      expect(detay.mukellefVknTckn).toBe("0174520662")
      expect(detay.kalemler.length).toBeGreaterThan(0)
      expect(detay.kalemler.reduce((t, k) => t + k.tutar, 0)).toBeCloseTo(42_000, 2)
      const tekrar = (await ben.get("/e-belge/faturalar/f_giden")).json<EBelgeDetay>()
      expect(tekrar.kalemler).toEqual(detay.kalemler)
      expect((await ben.get("/e-belge/faturalar/f_yok")).statusCode).toBe(404)
    })

    it("içerik PDF olarak döner ve erişim kaydı yazılır", async () => {
      const y = await ben.get("/e-belge/faturalar/f_giden/icerik?islem=indir")
      const icerik = y.json<{ dataUrl: string; ad: string }>()
      expect(icerik.ad).toBe("CNR2026000000057.pdf")
      expect(icerik.dataUrl).toMatch(/^data:application\/pdf;base64,/)
      expect(await sonAktivite("DOSYA_INDIRILDI")).toMatchObject({
        hedefTip: "EBELGE",
        hedefId: "f_giden",
      })
    })
  })

  it("ticari yanıt uygulamadan gönderilmez (Luca'da verilir)", async () => {
    expect((await yanit("f_bekleyen", { karar: "KABUL" })).statusCode).toBe(404)
  })

  describe("arşive kaydet", () => {
    it("faturayı mükellefin arşivine FATURA kategorisinde kaydeder; tekrar 409 + arsivDosyaId", async () => {
      const y = await ben.post("/e-belge/faturalar/f_temel/arsive-kaydet")
      expect(y.statusCode, y.body).toBe(200)
      const f = y.json<EBelgeView>()
      const [dosya] = await t.db.select().from(arsivDosya).where(eq(arsivDosya.id, f.arsivDosyaId!))
      expect(dosya).toMatchObject({
        mukellefId: "m_ltd",
        kategori: "FATURA",
        ad: "ELK2026000045120 - Boğaziçi Elektrik Dağıtım A.Ş.pdf",
        mimeType: "application/pdf",
        yukleyenId: MEHMET,
      })
      expect(t.depo.nesneler.size).toBe(1)
      expect(await sonAktivite("EBELGE_ARSIVE_KAYDEDILDI")).toMatchObject({
        hedefTip: "ARSIV",
        hedefId: dosya!.id,
      })
      const tekrar = await ben.post("/e-belge/faturalar/f_temel/arsive-kaydet")
      expect(tekrar.statusCode).toBe(409)
      expect(tekrar.json()).toEqual({ message: "Fatura zaten arşivde", arsivDosyaId: dosya!.id })

      // Arşivden silinen fatura yeniden kaydedilebilir
      await t.db.update(arsivDosya).set({ silindi: true }).where(eq(arsivDosya.id, dosya!.id))
      expect((await ben.post("/e-belge/faturalar/f_temel/arsive-kaydet")).statusCode).toBe(200)
    })

    it("eşzamanlı ikinci istek 409 alır ve öksüz nesne kalmaz", async () => {
      const sonuclar = await Promise.all([
        ben.post("/e-belge/faturalar/f_temel/arsive-kaydet"),
        ben.post("/e-belge/faturalar/f_temel/arsive-kaydet"),
      ])
      expect(sonuclar.map((s) => s.statusCode).sort()).toEqual([200, 409])
      expect(await t.db.select().from(arsivDosya).where(eq(arsivDosya.kategori, "FATURA"))).toHaveLength(1)
      expect(t.depo.nesneler.size).toBe(1)
    })

    it("bağlantısız mükellefin faturası 409", async () => {
      await t.db.delete(entegratorBaglanti).where(eq(entegratorBaglanti.mukellefId, "m_ltd"))
      expect((await ben.post("/e-belge/faturalar/f_temel/arsive-kaydet")).json()).toEqual({
        message: "Mükellefin Luca bağlantısı yok",
      })
      expect((await ben.get("/e-belge/faturalar/f_temel/icerik")).statusCode).toBe(409)
    })
  })

  describe("senkron", () => {
    it("işlenen giden fatura başarılı olur, beklenen berat alınır ve takvime yansır", async () => {
      const onceki = (await t.db.select().from(ebelge)).length
      const y = await ben.post("/e-belge/senkron", { mukellefId: "m_ltd" })
      expect(y.statusCode, y.body).toBe(200)
      const s = y.json<SenkronResponse>()
      expect(s).toMatchObject({ mukellefSayisi: 1, onaylananBerat: 1, hatali: [] })
      expect(s.guncellenenFatura).toBeGreaterThanOrEqual(1)
      const sonra = await t.db.select().from(ebelge)
      expect(sonra).toHaveLength(onceki + s.yeniFatura)
      expect(sonra.find((e) => e.id === "f_giden")?.gibDurumu).toBe("BASARILI")
      for (const e of sonra.filter((e) => !e.id.startsWith("f_") || e.id.length > 12))
        expect(e).toMatchObject({ yon: "GELEN", mukellefId: "m_ltd" })
      const [berat] = await t.db
        .select()
        .from(edefterBerat)
        .where(and(eq(edefterBerat.mukellefId, "m_ltd"), eq(edefterBerat.donem, "2026-06")))
      expect(berat?.durum).toBe("ONAYLANDI")
      const [b] = await t.db.select().from(entegratorBaglanti).where(eq(entegratorBaglanti.id, "n_m_ltd"))
      expect(b?.sonSenkron).toBe(new Date(2026, 8, 23, 10, 0).toISOString())

      const takvim = (
        await ben.get(
          "/takvim?baslangic=2026-09-01&bitis=2026-09-30&mukellefId=m_ltd&tip=E_DEFTER_BERAT"
        )
      ).json<TakvimOlayi[]>()
      expect(takvim.find((o) => o.donem === "2026-06")).toMatchObject({
        durum: "ONAYLANDI",
        guncelleyenId: MEHMET,
      })
      expect(await sonAktivite("EBELGE_SENKRONIZE_EDILDI")).toMatchObject({
        aciklama: `${s.yeniFatura} yeni fatura, 1 berat`,
      })
    })

    it("takvim senkronu yalnızca ileri yönde; ikinci senkronda berat tekrar sayılmaz", async () => {
      await t.db.insert(takvimDurum).values({
        mukellefId: "m_ltd",
        tip: "E_DEFTER_BERAT",
        donem: "2026-06",
        durum: "ONAYLANDI",
        guncelleyenId: "p_4",
        guncellemeTarihi: "2026-09-20T10:00:00.000Z",
      })
      await ben.post("/e-belge/senkron", { mukellefId: "m_ltd" })
      const [d] = await t.db
        .select()
        .from(takvimDurum)
        .where(and(eq(takvimDurum.mukellefId, "m_ltd"), eq(takvimDurum.donem, "2026-06")))
      expect(d?.guncelleyenId).toBe("p_4")
      const s = (await ben.post("/e-belge/senkron", { mukellefId: "m_ltd" })).json<SenkronResponse>()
      expect(s.onaylananBerat).toBe(0)
    })

    it("hatalı bağlantı raporlanır; bağlantısız mükellef 409", async () => {
      const tumu = (await ben.post("/e-belge/senkron")).json<SenkronResponse>()
      expect(tumu.mukellefSayisi).toBe(1)
      expect(tumu.hatali).toEqual([
        expect.objectContaining({ mukellefId: "m_as", unvan: "Öztürk İnşaat A.Ş." }),
      ])
      expect((await ben.post("/e-belge/senkron", { mukellefId: "m_sahis" })).json()).toEqual({
        message: "Mükellefin Luca bağlantısı yok",
      })
    })
  })

  describe("Luca bağlantıları", () => {
    const baglan = (kim: Istemci, mukellefId: string, lucaFirmaId: string) =>
      kim.put(`/e-belge/baglantilar/${mukellefId}`, { lucaFirmaId })

    it("tüm aktif mükellefleri durumlarıyla listeler", async () => {
      const l = (await ben.get("/e-belge/baglantilar")).json<EntegratorBaglantiView[]>()
      expect(l.map((b) => [b.mukellefId, b.durum])).toEqual([
        ["m_sahis", "BAGLI_DEGIL"],
        ["m_ltd", "BAGLI"],
        ["m_as", "HATA"],
      ])
      expect((await ben.get("/e-belge/baglantilar/m_yok")).statusCode).toBe(404)
    })

    it("yalnızca yönetici eşler; firma Luca'da olmalı ve tek mükellefe eşlenir", async () => {
      expect((await baglan(ben, "m_sahis", "L-m_sahis")).statusCode).toBe(403)
      expect((await baglan(yonetici, "m_sahis", " ")).json()).toEqual({
        message: "Luca firması seçilmelidir",
      })
      expect((await baglan(yonetici, "m_sahis", "L-yok")).json()).toEqual({
        message: "Firma Luca hesabında bulunamadı",
      })
      expect((await baglan(yonetici, "m_sahis", "L-m_ltd")).json()).toEqual({
        message: "Bu Luca firması başka bir mükellefe eşlenmiş",
      })

      const y = await baglan(yonetici, "m_sahis", "L-m_sahis")
      expect(y.statusCode, y.body).toBe(200)
      expect(y.json()).toMatchObject({
        durum: "BAGLI",
        lucaFirmaId: "L-m_sahis",
        baglayanId: YONETICI,
      })
      expect(await sonAktivite("ENTEGRATOR_BAGLANDI")).toMatchObject({
        mukellefId: "m_sahis",
        aciklama: "Luca firması L-m_sahis",
      })
    })

    it("yeniden eşleme hatalı bağlantıyı düzeltir, son senkronu korur; kaldırma kaydı siler", async () => {
      await t.db
        .update(entegratorBaglanti)
        .set({ sonSenkron: "2026-09-01T06:00:00.000Z" })
        .where(eq(entegratorBaglanti.mukellefId, "m_as"))
      const b = (await baglan(yonetici, "m_as", "L-m_as")).json<EntegratorBaglantiView>()
      expect(b).toMatchObject({ durum: "BAGLI", sonSenkron: "2026-09-01T06:00:00.000Z" })
      expect(b.hataMesaji).toBeUndefined()
      expect((await yonetici.delete("/e-belge/baglantilar/m_as")).statusCode).toBe(204)
      expect((await ben.get("/e-belge/baglantilar/m_as")).json<EntegratorBaglantiView>().durum).toBe(
        "BAGLI_DEGIL"
      )
      expect((await yonetici.delete("/e-belge/baglantilar/m_as")).statusCode).toBe(404)
      expect((await ben.delete("/e-belge/baglantilar/m_ltd")).statusCode).toBe(403)
    })
  })

  describe("beratlar ve özet", () => {
    it("son 12 dönemin berat matrisi; geciken dönemler işaretlenir", async () => {
      const r = (await ben.get("/e-belge/beratlar")).json<BeratListResponse>()
      expect(r.donemler).toHaveLength(12)
      expect([r.donemler[0], r.donemler.at(-1)]).toEqual(["2025-09", "2026-08"])
      const ltd = r.items.filter((b) => b.mukellefId === "m_ltd")
      expect(ltd.find((b) => b.donem === "2026-07")).toMatchObject({
        id: "m_ltd:2026-07",
        durum: "HATA",
        sonTarih: "2026-11-02",
        gecikti: false,
      })
      const as = r.items.filter((b) => b.mukellefId === "m_as")
      expect(as.find((b) => b.donem === "2026-05")).toMatchObject({ durum: "YUKLENMEDI", gecikti: true })
      expect(as.find((b) => b.donem === "2026-06")?.gecikti).toBe(false)
      expect(
        (await ben.get("/e-belge/beratlar?mukellefId=m_as")).json<BeratListResponse>().items
      ).toHaveLength(12)
    })

    it("özet sayaçları", async () => {
      const ozet = (await ben.get("/e-belge/ozet")).json<EBelgeOzetResponse>()
      expect(ozet).toMatchObject({
        yanitBekleyen: 2,
        hataliGonderim: 1,
        hataliEArsiv: 0,
        baglantiHatasi: 1,
        bagliMukellef: 1,
        beratGeciken: 9,
      })
      expect(ozet.yanitSuresiYaklasan.map((f) => f.id)).toEqual(["f_yakin"])
      const sahis = (await ben.get("/e-belge/ozet?sorumlu=p_2")).json<EBelgeOzetResponse>()
      expect(sahis).toMatchObject({ yanitBekleyen: 0, baglantiHatasi: 1 })
    })
  })

  describe("kontör", () => {
    it("bakiye, dönem tüketimi ve alımlar", async () => {
      const k = (await ben.get("/e-belge/kontor")).json<KontorOzetResponse>()
      expect(k).toMatchObject({
        donem: "2026-09",
        toplamAlinan: 120,
        toplamTuketim: 9,
        kalan: 111,
        aylikOrtalama: 1,
        dusukBakiye: false,
      })
      expect(k.birimMaliyet).toBeCloseTo(1.1)
      expect(k.mukellefler).toEqual([
        expect.objectContaining({ mukellefId: "m_ltd", gelen: 4, giden: 3, toplam: 7 }),
      ])
      expect(k.mukellefler[0]!.tutar).toBeCloseTo(7.7)
      expect(k.aylik.map((a) => a.tuketim)).toEqual([0, 0, 0, 0, 2, 7])
      expect(k.alimlar[0]).toMatchObject({ id: "u_1", ekleyenAd: "Ayşe Yılmaz" })
      const agustos = (await ben.get("/e-belge/kontor?donem=2026-08")).json<KontorOzetResponse>()
      expect(agustos.mukellefler.map((m) => m.mukellefId).sort()).toEqual(["m_as", "m_ltd"])
      expect((await ben.get("/e-belge/kontor?donem=bozuk")).json<KontorOzetResponse>().donem).toBe(
        "2026-09"
      )
    })

    it("alımı yalnızca yönetici ekler; bakiye ve aktivite güncellenir", async () => {
      const body = { tarih: "2026-09-20", paketAdet: 250, hediyeAdet: 50, tutar: 480 }
      expect((await ben.post("/e-belge/kontor/alimlar", body)).statusCode).toBe(403)
      expect((await yonetici.post("/e-belge/kontor/alimlar", { ...body, tarih: "2026-09-24" })).json()).toEqual(
        { message: "Geçersiz tarih" }
      )
      expect((await yonetici.post("/e-belge/kontor/alimlar", { ...body, paketAdet: 0 })).statusCode).toBe(400)
      expect((await yonetici.post("/e-belge/kontor/alimlar", { ...body, tutar: "480" })).statusCode).toBe(400)

      const y = await yonetici.post("/e-belge/kontor/alimlar", { ...body, not: "  Eylül  " })
      expect(y.statusCode).toBe(201)
      const kayit = y.json<KontorAlimView>()
      expect(kayit).toMatchObject({ ekleyenId: YONETICI, not: "Eylül", ekleyenAd: "Ayşe Yılmaz" })
      const k = (await ben.get("/e-belge/kontor")).json<KontorOzetResponse>()
      expect(k.kalan).toBe(411)
      expect(k.alimlar.map((a) => a.id)).toEqual([kayit.id, "u_1"])
      expect(await sonAktivite("KONTOR_ALINDI")).toMatchObject({ aciklama: "300 kontör" })
    })

    it("özet düşük bakiyeyi bildirir", async () => {
      await t.db.update(kontorAlim).set({ paketAdet: 5, hediyeAdet: 0 }).where(eq(kontorAlim.id, "u_1"))
      const ozet = (await ben.get("/e-belge/ozet")).json<EBelgeOzetResponse>()
      expect(ozet).toMatchObject({ kontorKalan: -4, kontorDusuk: true })
    })
  })

  it("e-Fatura yanıt süresi hatırlatması sorumluya bir kez", async () => {
    await t.app.get(HatirlatmaService).uret()
    const h = await t.db.select().from(bildirim).where(eq(bildirim.tur, "EFATURA_YANIT_SURESI"))
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({
      anahtar: "EFATURA_YANIT_SURESI:f_yakin",
      baslik: "e-Fatura yanıt süresi 1 gün içinde doluyor",
      link: "/e-belge/e-fatura?fatura=f_yakin",
    })
    await t.app.get(HatirlatmaService).uret()
    expect(
      await t.db.select().from(bildirim).where(eq(bildirim.tur, "EFATURA_YANIT_SURESI"))
    ).toHaveLength(1)
  })

  it("e-Arşiv faturası bildirimi e-Arşiv sekmesine bağlanır", async () => {
    const { AktiviteService } = await import("../src/aktivite/aktivite.service.js")
    await t.app.get(AktiviteService).log({
      aktorId: YONETICI,
      eylem: "EFATURA_REDDEDILDI",
      hedefTip: "EBELGE",
      hedefId: "f_arsiv",
      mukellefId: "m_ltd",
    })
    const [b] = await t.db.select().from(bildirim).where(eq(bildirim.hedefId, "f_arsiv"))
    expect(b?.link).toBe("/e-belge/e-arsiv?fatura=f_arsiv")
  })
})
