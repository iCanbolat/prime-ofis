import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { OKUMA_SURESI_MS } from "@prime/mock-data/okuyucu/mock-okuyucu"
import type {
  FisDetay,
  FisHesapAyariResponse,
  FisSayacResponse,
  FisView,
  LucaAktarimDetay,
  LucaAktarimView,
  OkumaView,
} from "@prime/shared/types/api"
import type { LucaSablonAyari } from "@prime/shared/types/domain"

const BASLANGIC = new Date(2026, 8, 23, 10, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: BASLANGIC })
  useAuthStore.setState({ user: PERSONEL[1] })
})
afterEach(() => vi.useRealTimers())

const onayla = (id: string, ad = "fis.pdf") =>
  http.post(`/gelen-evrak/${id}/onayla`, { kategori: "FATURA", ad })

const okumaSuresiGecsin = () =>
  vi.setSystemTime(new Date(Date.now() + OKUMA_SURESI_MS + 1))

describe("okuma", () => {
  it("bilanço mükellefinin fişi onaylanınca okunur ve taslak fişe dönüşür", async () => {
    await onayla("g_bekleyen")
    expect(await http.get<OkumaView[]>("/okumalar")).toMatchObject([
      {
        id: "ok_g_bekleyen",
        durum: "OKUNUYOR",
        mukellefId: "m_ltd",
        tur: "FIS",
      },
    ])
    expect(await http.get<FisSayacResponse>("/fisler/sayac")).toMatchObject({
      okunuyor: 1,
    })

    okumaSuresiGecsin()
    expect(await http.get<OkumaView[]>("/okumalar")).toEqual([])
    const [fis] = await http.get<FisView[]>("/fisler", {
      params: { mukellefId: "m_ltd" },
    })
    expect(fis).toMatchObject({
      id: "mf_g_bekleyen_1",
      durum: "TASLAK",
      gelenId: "g_bekleyen",
      mukellefUnvan: expect.any(String),
    })
    // Okuyucu tutarlı fiş üretir; varsayılan hesaplarla fiş hatasızdır
    expect(fis!.hatalar).toEqual([])
    expect(fis!.tarih.startsWith("2026-08")).toBe(true)
    expect(
      db.okuma.find("ok_g_bekleyen")?.fis?.kdvKirilimi.length
    ).toBeGreaterThan(0)
  })

  it("işletme defterli mükellefte okuma başlamaz", async () => {
    db.gelen.update("g_bekleyen", { mukellefId: "m_sahis" })
    await onayla("g_bekleyen")
    expect(db.gelen.find("g_bekleyen")?.okumaId).toBeUndefined()
    expect(db.okuma.count((o) => o.gelenId === "g_bekleyen")).toBe(0)
    expect(
      await http.get<FisHesapAyariResponse>(
        "/mukellefler/m_sahis/fis-hesaplari"
      )
    ).toMatchObject({ destekli: false })
  })

  it("okunamayan belge hata verir; yeniden okuma aynı sonucu kuyruğa alır", async () => {
    await onayla("g_bekleyen", "bulanik-fis.jpg")
    db.gelen.update("g_bekleyen", { ad: "bulanik-fis.jpg" })
    okumaSuresiGecsin()
    const [hatali] = await http.get<OkumaView[]>("/okumalar")
    expect(hatali).toMatchObject({
      durum: "HATA",
      hataMesaji: expect.stringMatching(/okunamadı/),
    })

    db.gelen.update("g_bekleyen", { ad: "fis-net.jpg" })
    await http.post(`/okumalar/${hatali!.id}/yeniden-oku`)
    await expect(
      http.post(`/okumalar/${hatali!.id}/yeniden-oku`)
    ).rejects.toMatchObject({
      status: 409,
    })
    okumaSuresiGecsin()
    expect(await http.get<OkumaView[]>("/okumalar")).toEqual([])
    expect(db.fis.count((f) => f.gelenId === "g_bekleyen")).toBe(1)
  })
})

describe("fiş düzenleme ve onay", () => {
  it("hesabı eksik ekstre onaylanamaz; düzeltilince hesap eşlemesi öğrenilir", async () => {
    await expect(http.post("/fisler/mf_ekstre/onayla")).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/hesap kodu yok/),
    })

    const detay = await http.get<FisDetay>("/fisler/mf_ekstre")
    const satirlar = detay.satirlar.map((s) =>
      s.hesapKodu ? s : { ...s, hesapKodu: "361.01" }
    )
    const guncel = await http.put<FisView>("/fisler/mf_ekstre", {
      tarih: detay.tarih,
      aciklama: detay.aciklama,
      satirlar,
    })
    expect(guncel.hatalar).toEqual([])
    expect(db.fisHesapAyari.find("m_as")?.eslemeler).toEqual([
      { anahtar: "SGK PRİM", hesapKodu: "361.01" },
    ])

    const onayli = await http.post<FisView>("/fisler/mf_ekstre/onayla")
    expect(onayli).toMatchObject({
      durum: "ONAYLANDI",
      onaylayanId: PERSONEL[1]!.id,
    })
    await expect(
      http.put("/fisler/mf_ekstre", {
        tarih: detay.tarih,
        aciklama: "",
        satirlar,
      })
    ).rejects.toMatchObject({ status: 409 })
    expect(
      (await http.post<FisView>("/fisler/mf_ekstre/taslaga-al")).durum
    ).toBe("TASLAK")
  })

  it("denk olmayan satırlar ve geçersiz hesap kodu reddedilir", async () => {
    const detay = await http.get<FisDetay>("/fisler/mf_taslak")
    await expect(
      http.put("/fisler/mf_taslak", {
        tarih: detay.tarih,
        aciklama: detay.aciklama,
        satirlar: [{ ...detay.satirlar[0]!, hesapKodu: "770-01" }],
      })
    ).rejects.toMatchObject({ status: 400 })

    await http.put("/fisler/mf_taslak", {
      tarih: detay.tarih,
      aciklama: detay.aciklama,
      satirlar: [
        { ...detay.satirlar[0]!, borc: 999 },
        ...detay.satirlar.slice(1),
      ],
    })
    await expect(http.post("/fisler/mf_taslak/onayla")).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/eşit değil/),
    })
  })
})

describe("Luca aktarımı", () => {
  it("onaylı fişler aktarılır, geri alınınca yeniden hazır olur", async () => {
    await expect(
      http.post("/luca-aktarimlari", {
        mukellefId: "m_as",
        fisIdleri: ["mf_taslak"],
      })
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      http.post("/luca-aktarimlari", {
        mukellefId: "m_ltd",
        fisIdleri: ["mf_hazir"],
      })
    ).rejects.toMatchObject({ status: 400 })

    const detay = await http.post<LucaAktarimDetay>("/luca-aktarimlari", {
      mukellefId: "m_as",
      fisIdleri: ["mf_hazir"],
    })
    expect(detay.aktarim.dosyaAdi).toMatch(/^Luca_.+_2026-09-23_1\.xlsx$/)
    expect(detay.fisler).toMatchObject([{ id: "mf_hazir", durum: "AKTARILDI" }])
    expect(detay.sablon.sutunlar[0]).toEqual({
      alan: "FIS_NO",
      baslik: "Fiş No",
    })
    expect(db.aktivite.all().at(-1)).toMatchObject({
      eylem: "LUCA_AKTARIMI",
      mukellefId: "m_as",
    })

    await expect(
      http.post("/fisler/mf_hazir/taslaga-al")
    ).rejects.toMatchObject({
      status: 409,
    })
    const liste = await http.get<LucaAktarimView[]>("/luca-aktarimlari")
    expect(liste).toMatchObject([
      { id: detay.aktarim.id, fisIdleri: ["mf_hazir"] },
    ])

    await http.post(`/luca-aktarimlari/${detay.aktarim.id}/geri-al`)
    expect(db.fis.find("mf_hazir")).toMatchObject({
      durum: "ONAYLANDI",
      aktarimId: undefined,
    })
    await expect(
      http.post(`/luca-aktarimlari/${detay.aktarim.id}/geri-al`)
    ).rejects.toMatchObject({ status: 409 })
  })

  it("şablonu yalnızca yönetici değiştirir; zorunlu sütunlar çıkarılamaz", async () => {
    const sablon = await http.get<LucaSablonAyari>("/buro/luca-sablonu")
    await expect(http.put("/buro/luca-sablonu", sablon)).rejects.toMatchObject({
      status: 403,
    })

    useAuthStore.setState({ user: PERSONEL[0] })
    await expect(
      http.put("/buro/luca-sablonu", {
        ...sablon,
        sutunlar: sablon.sutunlar.filter((s) => s.alan !== "BORC"),
      })
    ).rejects.toMatchObject({ status: 400 })

    const yeni = await http.put<LucaSablonAyari>("/buro/luca-sablonu", {
      ...sablon,
      sutunlar: [...sablon.sutunlar].reverse(),
      baslangicFisNo: 100,
    })
    expect(yeni.sutunlar[0]!.alan).toBe("DOVIZ_TUTAR")
    expect(db.buro.all()[0]?.lucaSablonu?.baslangicFisNo).toBe(100)
  })
})
