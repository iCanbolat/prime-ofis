import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { STORAGE_KEY, db } from "@/mocks/db"
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

const [yonetici, mehmet] = PERSONEL as [
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
]
const oturum = (p: (typeof PERSONEL)[0]) => useAuthStore.setState({ user: p })
const liste = (params: Record<string, unknown> = {}) =>
  http.get<EBelgeListResponse>("/e-belge/faturalar", {
    params: params as never,
  })
const idler = async (params: Record<string, unknown> = {}) =>
  (await liste(params)).items.map((f) => f.id)
const yanit = (id: string, body: Record<string, unknown>) =>
  http.post<EBelgeView>(`/e-belge/faturalar/${id}/yanit`, body)
const hataDurumu = (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: ApiError) => e.status
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

describe("GET /api/e-belge/faturalar", () => {
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
    // Yanıt durumu türetilir: süresi geçen BEKLIYOR → SURESI_DOLDU
    expect(await idler({ yanit: "BEKLIYOR" })).toEqual([
      "f_bekleyen",
      "f_yakin",
    ])
    expect(await idler({ yanit: "SURESI_DOLDU" })).toEqual(["f_doldu"])
    // Panodaki "Yanıt süresi dolmak üzere" ile aynı küme
    expect(await idler({ yanitYaklasan: true })).toEqual(["f_yakin"])
    expect(await idler({ mukellefId: "m_as" })).toEqual(["f_as"])
  })

  it("arama belge no, karşı taraf ve VKN'de; tarih aralığı ve sıralama", async () => {
    expect(await idler({ q: "mavi yapı" })).toEqual(["f_giden", "f_hata"])
    expect(await idler({ q: "6470152733" })).toEqual(["f_yakin"])
    expect(await idler({ q: "CNR2026000000051" })).toEqual(["f_hata"])
    expect(
      await idler({ baslangic: "2026-09-10", bitis: "2026-09-16" })
    ).toEqual(["f_yakin", "f_arsiv", "f_temel"])
    const tutar = await liste({ sirala: "toplam", siralamaYonu: "desc" })
    expect(tutar.items[0]?.id).toBe("f_giden")
  })

  it("sayfalar; toplam tutar yalnızca TL faturaları kapsar", async () => {
    const sayfa2 = await liste({ sayfa: 2, sayfaBoyutu: 4 })
    expect(sayfa2).toMatchObject({ total: 9, sayfa: 2, sayfaBoyutu: 4 })
    expect(sayfa2.items).toHaveLength(4)
    // 18000 + 50400 + 1200 × 6 (f_arsiv USD hariç)
    expect(sayfa2.toplamTutar).toBe(75_600)
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
    expect(await hataDurumu(liste({ yanit: "BELKI" }))).toBe(400)
    expect(await hataDurumu(liste({ baslangic: "23.09.2026" }))).toBe(400)
  })
})

describe("GET /api/e-belge/faturalar/:id", () => {
  it("kalemler deterministiktir ve toplamı matraha eşittir", async () => {
    const detay = await http.get<EBelgeDetay>("/e-belge/faturalar/f_giden")
    expect(detay.mukellefVknTckn).toBe("0174520662")
    expect(detay.kalemler.length).toBeGreaterThan(0)
    const toplam = detay.kalemler.reduce((t, k) => t + k.tutar, 0)
    expect(toplam).toBeCloseTo(42_000, 2)
    const tekrar = await http.get<EBelgeDetay>("/e-belge/faturalar/f_giden")
    expect(tekrar.kalemler).toEqual(detay.kalemler)
  })

  it("içerik PDF olarak döner", async () => {
    const icerik = await http.get<{ dataUrl: string; ad: string }>(
      "/e-belge/faturalar/f_giden/icerik"
    )
    expect(icerik.ad).toBe("CNR2026000000057.pdf")
    expect(icerik.dataUrl).toMatch(/^data:application\/pdf;base64,/)
  })
})

describe("POST /api/e-belge/faturalar/:id/yanit", () => {
  it("gelen ticari faturayı kabul eder, aktiviteye yazar, ikinci yanıt 409", async () => {
    const f = await yanit("f_bekleyen", { karar: "KABUL" })
    expect(f).toMatchObject({ yanit: "KABUL", yanitlayanId: mehmet.id })
    expect(db.aktivite.all().at(-1)).toMatchObject({
      eylem: "EFATURA_KABUL_EDILDI",
      hedefId: "f_bekleyen",
      mukellefId: "m_ltd",
    })
    expect(
      await hataDurumu(yanit("f_bekleyen", { karar: "RED", neden: "x" }))
    ).toBe(409)
  })

  it("red nedeni zorunlu; neden kaydedilir", async () => {
    expect(await hataDurumu(yanit("f_yakin", { karar: "RED" }))).toBe(400)
    expect(
      await hataDurumu(yanit("f_yakin", { karar: "RED", neden: "  " }))
    ).toBe(400)
    const f = await yanit("f_yakin", { karar: "RED", neden: "Mükerrer fatura" })
    expect(f).toMatchObject({ yanit: "RED", redNedeni: "Mükerrer fatura" })
  })

  it("süresi dolmuş, temel senaryolu veya giden fatura yanıtlanamaz", async () => {
    expect(await hataDurumu(yanit("f_doldu", { karar: "KABUL" }))).toBe(409)
    expect(await hataDurumu(yanit("f_temel", { karar: "KABUL" }))).toBe(400)
    expect(await hataDurumu(yanit("f_giden", { karar: "KABUL" }))).toBe(400)
  })
})

describe("POST /api/e-belge/faturalar/:id/arsive-kaydet", () => {
  it("faturayı mükellefin arşivine FATURA kategorisinde kaydeder; tekrar 409", async () => {
    const f = await http.post<EBelgeView>(
      "/e-belge/faturalar/f_temel/arsive-kaydet"
    )
    const dosya = db.arsiv.find(f.arsivDosyaId!)
    expect(dosya).toMatchObject({
      mukellefId: "m_ltd",
      kategori: "FATURA",
      ad: "ELK2026000045120 - Boğaziçi Elektrik Dağıtım A.Ş.pdf",
      mimeType: "application/pdf",
      yukleyenId: mehmet.id,
    })
    const tekrar = await http
      .post("/e-belge/faturalar/f_temel/arsive-kaydet")
      .catch((e: ApiError) => e)
    expect(tekrar).toMatchObject({
      status: 409,
      body: { arsivDosyaId: dosya!.id },
    })
  })
})

describe("POST /api/e-belge/senkron", () => {
  it("işlenen giden fatura başarılı olur, beklenen berat alınır ve takvime yansır", async () => {
    const onceki = db.ebelge.count()
    const s = await http.post<SenkronResponse>("/e-belge/senkron", {
      mukellefId: "m_ltd",
    })
    expect(s).toMatchObject({
      mukellefSayisi: 1,
      onaylananBerat: 1,
      hatali: [],
    })
    expect(s.guncellenenFatura).toBeGreaterThanOrEqual(1)
    expect(db.ebelge.count()).toBe(onceki + s.yeniFatura)
    expect(db.ebelge.find("f_giden")?.gibDurumu).toBe("BASARILI")
    expect(db.berat.find("m_ltd:2026-06")).toMatchObject({ durum: "ONAYLANDI" })
    expect(db.takvim.find("m_ltd:E_DEFTER_BERAT:2026-06")).toMatchObject({
      durum: "ONAYLANDI",
      guncelleyenId: mehmet.id,
    })
    // Yeni faturalar mükellefin gelen kutusuna düşer
    for (const e of db.ebelge.all().slice(onceki))
      expect(e).toMatchObject({ yon: "GELEN", mukellefId: "m_ltd" })
    expect(db.baglanti.find("n_m_ltd")?.sonSenkron).toBe(
      new Date().toISOString()
    )

    const takvim = await http.get<TakvimOlayi[]>("/takvim", {
      params: {
        baslangic: "2026-09-01",
        bitis: "2026-09-30",
        mukellefId: "m_ltd",
        tip: ["E_DEFTER_BERAT"],
      },
    })
    expect(takvim.find((o) => o.donem === "2026-06")?.durum).toBe("ONAYLANDI")
  })

  it("takvim senkronu yalnızca ileri yönde: zaten onaylı beyan yeniden yazılmaz", async () => {
    db.takvim.insert({
      id: "m_ltd:E_DEFTER_BERAT:2026-06",
      mukellefId: "m_ltd",
      tip: "E_DEFTER_BERAT",
      donem: "2026-06",
      durum: "ONAYLANDI",
      guncelleyenId: "p_4",
      guncellemeTarihi: "2026-09-20T10:00:00.000Z",
    })
    await http.post("/e-belge/senkron", { mukellefId: "m_ltd" })
    expect(db.takvim.find("m_ltd:E_DEFTER_BERAT:2026-06")?.guncelleyenId).toBe(
      "p_4"
    )
    // İkinci senkronda aynı berat tekrar sayılmaz
    const s = await http.post<SenkronResponse>("/e-belge/senkron", {
      mukellefId: "m_ltd",
    })
    expect(s.onaylananBerat).toBe(0)
  })

  it("hatalı bağlantı raporlanır; bağlantısız mükellef 409", async () => {
    const tumu = await http.post<SenkronResponse>("/e-belge/senkron")
    expect(tumu.mukellefSayisi).toBe(1)
    expect(tumu.hatali).toEqual([
      expect.objectContaining({
        mukellefId: "m_as",
        unvan: "Öztürk İnşaat A.Ş.",
      }),
    ])
    expect(
      await hataDurumu(http.post("/e-belge/senkron", { mukellefId: "m_sahis" }))
    ).toBe(409)
  })
})

describe("Luca bağlantıları", () => {
  const baglan = (mukellefId: string, apiAnahtari: string) =>
    http.put<EntegratorBaglantiView>(`/e-belge/baglantilar/${mukellefId}`, {
      apiAnahtari,
      ortam: "TEST",
    })

  it("tüm aktif mükellefleri durumlarıyla listeler", async () => {
    const liste = await http.get<EntegratorBaglantiView[]>(
      "/e-belge/baglantilar"
    )
    expect(liste.map((b) => [b.mukellefId, b.durum])).toEqual([
      ["m_sahis", "BAGLI_DEGIL"],
      ["m_ltd", "BAGLI"],
      ["m_as", "HATA"],
    ])
  })

  it("yalnızca yönetici bağlar; anahtar yanıtta ve depolamada yer almaz", async () => {
    const anahtar = "nv_test_ABCDEFGHIJ123456"
    expect(await hataDurumu(baglan("m_sahis", anahtar))).toBe(403)

    oturum(yonetici)
    expect(await hataDurumu(baglan("m_sahis", "kisa"))).toBe(422)
    expect(await hataDurumu(baglan("m_sahis", "hatali-anahtar-0000000"))).toBe(
      422
    )

    const b = await baglan("m_sahis", anahtar)
    expect(b).toMatchObject({
      durum: "BAGLI",
      ortam: "TEST",
      anahtarIpucu: "3456",
      baglayanId: yonetici.id,
    })
    expect(JSON.stringify(b)).not.toContain(anahtar)
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain(anahtar)
    expect(db.aktivite.all().at(-1)).toMatchObject({
      eylem: "ENTEGRATOR_BAGLANDI",
      mukellefId: "m_sahis",
    })
  })

  it("anahtar yenileme hatalı bağlantıyı düzeltir; kaldırma kaydı siler", async () => {
    oturum(yonetici)
    const b = await baglan("m_as", "nv_live_yeni_anahtar_9999")
    expect(b.durum).toBe("BAGLI")
    expect(b.hataMesaji).toBeUndefined()
    await http.delete("/e-belge/baglantilar/m_as")
    expect(
      (await http.get<EntegratorBaglantiView>("/e-belge/baglantilar/m_as"))
        .durum
    ).toBe("BAGLI_DEGIL")
    expect(await hataDurumu(http.delete("/e-belge/baglantilar/m_as"))).toBe(404)
  })
})

describe("GET /api/e-belge/beratlar ve /ozet", () => {
  it("son 12 dönemin berat matrisi; geciken dönemler işaretlenir", async () => {
    const r = await http.get<BeratListResponse>("/e-belge/beratlar")
    expect(r.donemler).toHaveLength(12)
    expect([r.donemler[0], r.donemler.at(-1)]).toEqual(["2025-09", "2026-08"])
    const ltd = r.items.filter((b) => b.mukellefId === "m_ltd")
    expect(ltd.find((b) => b.donem === "2026-07")).toMatchObject({
      durum: "HATA",
      // 31 Ekim 2026 Cumartesi → Pazartesi'ye kayar
      sonTarih: "2026-11-02",
      gecikti: false,
    })
    // m_as (bağlantı hatalı) beratı yok: son günü geçmiş dönemler gecikmiş
    const as = r.items.filter((b) => b.mukellefId === "m_as")
    expect(as.find((b) => b.donem === "2026-05")).toMatchObject({
      durum: "YUKLENMEDI",
      gecikti: true,
    })
    expect(as.find((b) => b.donem === "2026-06")?.gecikti).toBe(false)
  })

  it("özet sayaçları", async () => {
    const ozet = await http.get<EBelgeOzetResponse>("/e-belge/ozet")
    expect(ozet).toMatchObject({
      yanitBekleyen: 2,
      hataliGonderim: 1,
      hataliEArsiv: 0,
      baglantiHatasi: 1,
      bagliMukellef: 1,
      beratGeciken: 9,
    })
    expect(ozet.yanitSuresiYaklasan.map((f) => f.id)).toEqual(["f_yakin"])
    const sahis = await http.get<EBelgeOzetResponse>("/e-belge/ozet", {
      params: { sorumlu: "p_2" },
    })
    // p_2: m_sahis (bağlı değil) ve m_as (hatalı)
    expect(sahis).toMatchObject({ yanitBekleyen: 0, baglantiHatasi: 1 })
  })
})

describe("Kontör", () => {
  // Fixture: 100 + 20 hediye = 120 kontör, 132 TL. Eylül 7, Ağustos 2 belge.
  it("GET /kontor bakiye, dönem tüketimi ve alımları döner", async () => {
    const k = await http.get<KontorOzetResponse>("/e-belge/kontor")
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
      expect.objectContaining({
        mukellefId: "m_ltd",
        gelen: 4,
        giden: 3,
        toplam: 7,
        tutar: expect.closeTo(7.7) as number,
      }),
    ])
    expect(k.aylik.map((a) => a.tuketim)).toEqual([0, 0, 0, 0, 2, 7])
    expect(k.alimlar[0]).toMatchObject({ id: "u_1", ekleyenAd: "Ayşe Yılmaz" })

    const agustos = await http.get<KontorOzetResponse>("/e-belge/kontor", {
      params: { donem: "2026-08" },
    })
    expect(agustos.mukellefler.map((m) => m.mukellefId).sort()).toEqual([
      "m_as",
      "m_ltd",
    ])
  })

  it("alımı yalnızca yönetici ekler; bakiye ve aktivite güncellenir", async () => {
    const body = {
      tarih: "2026-09-20",
      paketAdet: 250,
      hediyeAdet: 50,
      tutar: 480,
    }
    expect(await hataDurumu(http.post("/e-belge/kontor/alimlar", body))).toBe(
      403
    )

    oturum(yonetici)
    expect(
      await hataDurumu(
        http.post("/e-belge/kontor/alimlar", { ...body, tarih: "2026-09-24" })
      )
    ).toBe(400)
    expect(
      await hataDurumu(
        http.post("/e-belge/kontor/alimlar", { ...body, paketAdet: 0 })
      )
    ).toBe(400)

    const kayit = await http.post<KontorAlimView>("/e-belge/kontor/alimlar", {
      ...body,
      not: "  Eylül  ",
    })
    expect(kayit).toMatchObject({ ekleyenId: yonetici.id, not: "Eylül" })
    const k = await http.get<KontorOzetResponse>("/e-belge/kontor")
    expect(k.kalan).toBe(411)
    expect(k.alimlar.map((a) => a.id)).toEqual([kayit.id, "u_1"])
    expect(db.aktivite.all().at(-1)).toMatchObject({
      eylem: "KONTOR_ALINDI",
      aciklama: "300 kontör",
    })
  })

  it("özet düşük bakiyeyi bildirir", async () => {
    db.kontor.update("u_1", { paketAdet: 5, hediyeAdet: 0 })
    const ozet = await http.get<EBelgeOzetResponse>("/e-belge/ozet")
    expect(ozet).toMatchObject({ kontorKalan: -4, kontorDusuk: true })
  })
})
