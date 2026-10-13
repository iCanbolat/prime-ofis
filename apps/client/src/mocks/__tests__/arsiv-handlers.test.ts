import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { getBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  ArsivAgacResponse,
  ArsivDosyaView,
  ArsivIcerikResponse,
  ArsivListResponse,
  ArsivOzetResponse,
  ArsivYukleRequest,
} from "@prime/shared/types/api"

const sayfali = (params: Record<string, unknown> = {}) =>
  http.get<ArsivListResponse>("/arsiv", { params: params as never })
const liste = async (params: Record<string, unknown> = {}) =>
  (await sayfali(params)).items

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const yukleme = (over: Partial<ArsivYukleRequest> = {}): ArsivYukleRequest => ({
  mukellefId: "m_ltd",
  kategori: "IMZA_SIRKULERI",
  ad: "imza.png",
  mimeType: "image/png",
  boyut: 68,
  gecerlilikTarihi: "2027-01-01",
  dataUrl: PNG,
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: PERSONEL[1] })
})
afterEach(() => vi.useRealTimers())

describe("GET /api/arsiv", () => {
  it("çöp kutusundakiler hariç listeler, mükellef ve kategoriye göre filtreler", async () => {
    expect(await liste()).toHaveLength(8)
    const ltd = await liste({ mukellefId: "m_ltd" })
    expect(ltd.map((d) => d.id).sort()).toEqual([
      "d_ltd_faaliyet",
      "d_ltd_gazete",
      "d_ltd_levha",
    ])
    expect(ltd[0]).toMatchObject({
      mukellefUnvan: expect.stringContaining("Çınar"),
    })
    expect(await liste({ kategori: "VERGI_LEVHASI" })).toHaveLength(3)
    expect((await liste({ cop: true })).map((d) => d.id)).toEqual([
      "d_sahis_cop",
    ])
  })

  it("arama dosya adı ve mükellef unvanında Türkçe duyarlı çalışır", async () => {
    expect((await liste({ q: "İMZA" })).map((d) => d.id)).toEqual(["d_as_imza"])
    expect(await liste({ q: "öztürk" })).toHaveLength(3)
  })

  it("geçerlilik filtresi: süresi dolmuş / 30 gün içinde dolacak", async () => {
    expect((await liste({ gecerlilik: "DOLDU" })).map((d) => d.id)).toEqual([
      "d_as_imza",
    ])
    expect((await liste({ gecerlilik: "YAKINDA" })).map((d) => d.id)).toEqual([
      "d_ltd_faaliyet",
    ])
  })

  it("boyuta göre azalan sıralar", async () => {
    const [ilk] = await liste({ sirala: "boyut", yon: "desc" })
    expect(ilk!.id).toBe("d_sahis_kimlik")
  })

  it("sayfa verilince sunucu tarafında sayfalar; aşan sayfa son sayfaya döner", async () => {
    const tumu = await liste({ sirala: "ad" })
    const ilk = await sayfali({ sirala: "ad", sayfa: 1, sayfaBoyutu: 3 })
    expect(ilk).toMatchObject({ total: tumu.length, sayfa: 1, sayfaBoyutu: 3 })
    expect(ilk.items.map((d) => d.id)).toEqual(
      tumu.slice(0, 3).map((d) => d.id)
    )
    const ikinci = await sayfali({ sirala: "ad", sayfa: 2, sayfaBoyutu: 3 })
    expect(ikinci.items.map((d) => d.id)).toEqual(
      tumu.slice(3, 6).map((d) => d.id)
    )
    const asan = await sayfali({ sirala: "ad", sayfa: 99, sayfaBoyutu: 3 })
    expect(asan.sayfa).toBe(Math.ceil(tumu.length / 3))
  })
})

describe("GET /api/arsiv/agac ve /ozet", () => {
  it("ağaç mükellef ve kategori sayılarını, eksik zorunluları döner", async () => {
    const agac = await http.get<ArsivAgacResponse>("/arsiv/agac")
    expect(agac.copSayisi).toBe(1)
    const ltd = agac.mukellefler.find((m) => m.mukellefId === "m_ltd")!
    expect(ltd.toplam).toBe(3)
    expect(ltd.kategoriler).toEqual({
      VERGI_LEVHASI: 1,
      TICARET_SICIL_GAZETESI: 1,
      FAALIYET_BELGESI: 1,
    })
    expect(ltd.eksikZorunlu).toEqual(["IMZA_SIRKULERI"])
    expect(
      agac.mukellefler.find((m) => m.mukellefId === "m_sahis")!.toplam
    ).toBe(2)
  })

  it("özet: süresi dolan ve yakında dolan belgeler, eksikler", async () => {
    const ozet = await http.get<ArsivOzetResponse>("/arsiv/ozet")
    expect(
      ozet.gecerlilik.map((d) => [d.id, d.gecerlilik, d.kalanGun])
    ).toEqual([
      ["d_as_imza", "DOLDU", -22],
      ["d_ltd_faaliyet", "YAKINDA", 20],
    ])
    expect(ozet.eksikZorunlu).toEqual([
      {
        mukellefId: "m_ltd",
        unvan: expect.any(String),
        eksik: ["IMZA_SIRKULERI"],
      },
    ])
    const benim = await http.get<ArsivOzetResponse>("/arsiv/ozet", {
      params: { sorumlu: "p_3" },
    })
    expect(benim.gecerlilik.map((d) => d.id)).toEqual(["d_ltd_faaliyet"])
  })
})

describe("dosya işlemleri", () => {
  it("yükle → yeniden adlandır/taşı → sil → geri al → kalıcı sil", async () => {
    const dosya = await http.post<ArsivDosyaView>("/arsiv", yukleme())
    expect(dosya).toMatchObject({
      kategori: "IMZA_SIRKULERI",
      yukleyenId: "p_2",
      silindi: false,
    })
    expect(await getBlob(dosya.id)).toBe(PNG)
    const icerik = await http.get<ArsivIcerikResponse>(
      `/arsiv/${dosya.id}/icerik`
    )
    expect(icerik.dataUrl).toBe(PNG)

    const agac = await http.get<ArsivAgacResponse>("/arsiv/agac")
    expect(
      agac.mukellefler.find((m) => m.mukellefId === "m_ltd")!.eksikZorunlu
    ).toEqual([])

    const tasindi = await http.patch<ArsivDosyaView>(`/arsiv/${dosya.id}`, {
      ad: "Yeni ad.png",
      kategori: "DIGER",
    })
    // Süreli olmayan kategoriye taşınınca geçerlilik tarihi kalkar
    expect(tasindi).toMatchObject({ ad: "Yeni ad.png", kategori: "DIGER" })
    expect(tasindi.gecerlilikTarihi).toBeUndefined()

    await expect(
      http.delete(`/arsiv/${dosya.id}`, { params: { kalici: true } })
    ).rejects.toMatchObject({ status: 400 })

    await http.delete(`/arsiv/${dosya.id}`)
    expect(
      (await liste({ mukellefId: "m_ltd" })).some((d) => d.id === dosya.id)
    ).toBe(false)
    expect((await liste({ cop: true })).some((d) => d.id === dosya.id)).toBe(
      true
    )

    await http.post(`/arsiv/${dosya.id}/geri-al`)
    expect(
      (await liste({ mukellefId: "m_ltd" })).some((d) => d.id === dosya.id)
    ).toBe(true)

    await http.delete(`/arsiv/${dosya.id}`)
    await http.delete(`/arsiv/${dosya.id}`, { params: { kalici: true } })
    expect(db.arsiv.find(dosya.id)).toBeUndefined()
    expect(await getBlob(dosya.id)).toBeUndefined()

    expect(
      db.aktivite.where((a) => a.hedefId === dosya.id).map((a) => a.eylem)
    ).toEqual([
      "ARSIV_YUKLENDI",
      "DOSYA_GORUNTULENDI",
      "ARSIV_GUNCELLENDI",
      "ARSIV_SILINDI",
      "ARSIV_GERI_ALINDI",
      "ARSIV_SILINDI",
      "ARSIV_KALICI_SILINDI",
    ])
  })

  it("bordro dosyası döneme bağlanır, dönemle filtrelenir; dönem dışı kategoride alanlar silinir", async () => {
    const bordro = await http.post<ArsivDosyaView>(
      "/arsiv",
      yukleme({
        kategori: "BORDRO",
        ad: "pusula.png",
        donem: "2026-08",
        bordroBelge: "PUSULA",
      })
    )
    expect(bordro).toMatchObject({ donem: "2026-08", bordroBelge: "PUSULA" })
    // Dönem dışı kategoride yükleme alanları yok sayılır
    const imza = await http.post<ArsivDosyaView>(
      "/arsiv",
      yukleme({ donem: "2026-08", bordroBelge: "ICMAL" })
    )
    expect(imza.donem).toBeUndefined()

    expect(
      (await liste({ mukellefId: "m_ltd", donem: "2026-08" })).map((d) => d.id)
    ).toEqual([bordro.id])

    const tur = await http.patch<ArsivDosyaView>(`/arsiv/${bordro.id}`, {
      bordroBelge: "IMZALI",
    })
    expect(tur).toMatchObject({ donem: "2026-08", bordroBelge: "IMZALI" })
    // Dönem kaldırılınca tür de düşer
    const donemsiz = await http.patch<ArsivDosyaView>(`/arsiv/${bordro.id}`, {
      donem: null,
    })
    expect(donemsiz.bordroBelge).toBeUndefined()

    await http.patch(`/arsiv/${bordro.id}`, {
      donem: "2026-07",
      bordroBelge: "ICMAL",
    })
    const tasindi = await http.patch<ArsivDosyaView>(`/arsiv/${bordro.id}`, {
      kategori: "DIGER",
    })
    expect(tasindi.donem).toBeUndefined()
    expect(tasindi.bordroBelge).toBeUndefined()

    const hata = (body: unknown) =>
      http.patch(`/arsiv/${bordro.id}`, body).then(
        () => 200,
        (e: unknown) => (e instanceof ApiError ? e.status : 0)
      )
    expect(await hata({ donem: "2026-13" })).toBe(400)
    expect(await hata({ bordroBelge: "MAAS" })).toBe(400)
  })

  it("seed dosyasının içeriği yoksa placeholder üretir", async () => {
    const { dataUrl } = await http.get<ArsivIcerikResponse>(
      "/arsiv/d_ltd_levha/icerik"
    )
    expect(dataUrl).toMatch(/^data:application\/pdf;base64,/)
  })

  it("desteklenmeyen tür ve 10 MB üstü boyut 400 döner", async () => {
    const tur = http.post(
      "/arsiv",
      yukleme({ ad: "rapor.docx", mimeType: "application/msword" })
    )
    await expect(tur).rejects.toBeInstanceOf(ApiError)
    await expect(tur).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Desteklenmeyen"),
    })
    await expect(
      http.post("/arsiv", yukleme({ boyut: 11 * 1024 * 1024 }))
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("10 MB"),
    })
  })

  it("oturum yoksa yazma işlemleri 401 döner", async () => {
    useAuthStore.setState({ user: null })
    await expect(http.delete("/arsiv/d_ltd_levha")).rejects.toMatchObject({
      status: 401,
    })
  })
})
