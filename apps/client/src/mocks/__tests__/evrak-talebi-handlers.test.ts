import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { http } from "@/lib/http"
import { getBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  ArsivListResponse,
  GelenEvrakView,
  GelenSayacResponse,
  PortalResponse,
  PortalYukleme,
  TalepDetay,
  TalepView,
} from "@prime/shared/types/api"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const yukle = (token: string, over: Record<string, unknown> = {}) =>
  http.post<PortalYukleme>(`/portal/${token}/yukleme`, {
    istenen: "FIS_FATURA",
    ad: "fis.png",
    mimeType: "image/png",
    boyut: 68,
    dataUrl: PNG,
    ...over,
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: PERSONEL[1] })
})
afterEach(() => vi.useRealTimers())

describe("evrak talepleri", () => {
  it("liste türetilmiş durum ve yükleme sayılarıyla döner, durum filtresi çalışır", async () => {
    const liste = await http.get<TalepView[]>("/evrak-talepleri")
    const durumlar = Object.fromEntries(liste.map((t) => [t.id, t.durum]))
    expect(durumlar).toEqual({
      e_aktif: "AKTIF",
      e_sure: "SURESI_DOLDU",
      e_iptal: "IPTAL",
      e_tamam: "TAMAMLANDI",
    })
    expect(liste.find((t) => t.id === "e_aktif")).toMatchObject({
      yuklemeSayisi: 1,
      bekleyenSayisi: 1,
      mukellefUnvan: expect.stringContaining("Çınar"),
    })
    const sure = await http.get<TalepView[]>("/evrak-talepleri", {
      params: { durum: "SURESI_DOLDU" },
    })
    expect(sure.map((t) => t.id)).toEqual(["e_sure"])
  })

  it("oluşturma: rastgele token, 7 gün sonra gün sonu, aktivite kaydı", async () => {
    const t = await http.post<TalepView>("/evrak-talepleri", {
      mukellefId: "m_sahis",
      istenenler: ["BANKA_EKSTRESI", "FIS_FATURA", "FIS_FATURA"],
      donem: "2026-08",
      kanal: "WHATSAPP",
      gecerlilikGun: 7,
    })
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(t.istenenler).toEqual(["FIS_FATURA", "BANKA_EKSTRESI"])
    expect(t.durum).toBe("AKTIF")
    expect(new Date(t.sonKullanma)).toEqual(new Date(2026, 8, 30, 23, 59, 59))
    expect(
      db.aktivite.where((a) => a.hedefId === t.id).map((a) => a.eylem)
    ).toEqual(["TALEP_OLUSTURULDU"])

    await expect(
      http.post("/evrak-talepleri", {
        mukellefId: "m_sahis",
        istenenler: [],
        kanal: "EPOSTA",
        gecerlilikGun: 7,
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("gönderim kaydedilir; süresi dolmuş talep gönderilemez ama uzatılabilir", async () => {
    const g = await http.post<TalepView>("/evrak-talepleri/e_aktif/gonderim", {
      kanal: "EPOSTA",
    })
    expect(g.gonderimler).toHaveLength(2)
    expect(g.kanal).toBe("EPOSTA")
    // SMS kanalı kaldırıldı
    await expect(
      http.post("/evrak-talepleri/e_aktif/gonderim", { kanal: "SMS" })
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      http.post("/evrak-talepleri/e_sure/gonderim", { kanal: "EPOSTA" })
    ).rejects.toMatchObject({ status: 409 })
    const uzatilan = await http.post<TalepView>(
      "/evrak-talepleri/e_sure/uzat",
      { gun: 7 }
    )
    expect(uzatilan.durum).toBe("AKTIF")
    expect(new Date(uzatilan.sonKullanma)).toEqual(
      new Date(2026, 8, 30, 23, 59, 59)
    )
  })

  it("iptal edilen talep portalda iptal görünür, yükleme kabul edilmez", async () => {
    await http.post("/evrak-talepleri/e_aktif/iptal")
    const portal = await http.get<PortalResponse>("/portal/tkn_aktif")
    expect(portal.durum).toBe("IPTAL")
    await expect(yukle("tkn_aktif")).rejects.toMatchObject({ status: 410 })
  })
})

describe("müşteri portalı", () => {
  it("bilinmeyen token 404, süresi dolmuş/iptal/tamamlanmış durumları döner", async () => {
    await expect(http.get("/portal/yok")).rejects.toMatchObject({ status: 404 })
    expect((await http.get<PortalResponse>("/portal/tkn_sure")).durum).toBe(
      "SURESI_DOLDU"
    )
    expect((await http.get<PortalResponse>("/portal/tkn_iptal")).durum).toBe(
      "IPTAL"
    )
    const tamam = await http.get<PortalResponse>("/portal/tkn_tamam")
    expect(tamam.durum).toBe("TAMAMLANDI")
    // Hassas mükellef bilgisi dönmez
    expect(JSON.stringify(tamam)).not.toContain("9358005601")
  })

  it("2 dosya yükle → tamamla → büroda talep yükleme sayısı artar, sayaç güncellenir", async () => {
    useAuthStore.setState({ user: null })
    await yukle("tkn_aktif")
    const ikinci = await yukle("tkn_aktif", {
      istenen: "BANKA_EKSTRESI",
      ad: "ekstre.png",
    })
    expect(await getBlob(ikinci.id)).toBe(PNG)
    await expect(
      yukle("tkn_aktif", { istenen: "KIMLIK" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      yukle("tkn_aktif", { ad: "belge.docx", mimeType: "application/msword" })
    ).rejects.toMatchObject({ status: 400 })

    const sonuc = await http.post<PortalResponse>("/portal/tkn_aktif/tamamla", {
      not: "Hepsi bu kadar",
    })
    expect(sonuc.durum).toBe("TAMAMLANDI")
    expect(
      db.aktivite.where((a) => a.aktorId === "musteri").map((a) => a.eylem)
    ).toEqual(["EVRAK_YUKLENDI", "EVRAK_YUKLENDI", "TALEP_TAMAMLANDI"])

    useAuthStore.setState({ user: PERSONEL[1] })
    const detay = await http.get<TalepDetay>("/evrak-talepleri/e_aktif")
    expect(detay).toMatchObject({
      yuklemeSayisi: 3,
      bekleyenSayisi: 3,
      musteriNotu: "Hepsi bu kadar",
    })
    expect(
      (await http.get<GelenSayacResponse>("/gelen-evrak/sayac")).bekleyen
    ).toBe(3)
  })

  it("müşteri incelenmemiş dosyasını silebilir, incelenmişi silemez", async () => {
    const y = await yukle("tkn_aktif")
    await http.delete(`/portal/tkn_aktif/yukleme/${y.id}`)
    expect(db.gelen.find(y.id)).toBeUndefined()
  })
})

describe("gelen evrak incelemesi", () => {
  it("onay → dosya arşive doğru kategoride, içerik kopyalanmış olarak kaydedilir", async () => {
    const onayli = await http.post<GelenEvrakView>(
      "/gelen-evrak/g_bekleyen/onayla",
      {
        kategori: "DIGER",
        ad: "Ağustos faturaları.pdf",
      }
    )
    expect(onayli).toMatchObject({ durum: "ONAYLANDI", inceleyenId: "p_2" })
    const { items: arsiv } = await http.get<ArsivListResponse>("/arsiv", {
      params: { mukellefId: "m_ltd", kategori: "DIGER" },
    })
    expect(arsiv.map((d) => d.ad)).toEqual(["Ağustos faturaları.pdf"])
    expect(arsiv[0]!.id).toBe(onayli.arsivDosyaId)
    expect(await getBlob(arsiv[0]!.id)).toMatch(/^data:application\/pdf/)

    await expect(
      http.post("/gelen-evrak/g_bekleyen/onayla", {
        kategori: "DIGER",
        ad: "x",
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("red → REDDEDILDI ve neden; yenidenAc tamamlanmış talebi aktif eder, portalda neden görünür", async () => {
    // Tamamlanmış talebe yeni bekleyen dosya
    db.gelen.insert({
      talepId: "e_tamam",
      mukellefId: "m_as",
      istenen: "FIS_FATURA",
      ad: "fatura.jpg",
      mimeType: "image/jpeg",
      boyut: 1000,
      yuklemeTarihi: "2026-09-22T10:00:00.000Z",
      durum: "BEKLIYOR",
      id: "g_yeni",
    })
    const red = await http.post<GelenEvrakView>("/gelen-evrak/g_yeni/reddet", {
      neden: "Okunmuyor",
      yenidenAc: true,
    })
    expect(red).toMatchObject({ durum: "REDDEDILDI", redNedeni: "Okunmuyor" })

    const portal = await http.get<PortalResponse>("/portal/tkn_tamam")
    expect(portal.durum).toBe("AKTIF")
    expect(portal.yuklemeler.find((y) => y.id === "g_yeni")).toMatchObject({
      durum: "REDDEDILDI",
      redNedeni: "Okunmuyor",
    })
    await expect(
      http.post("/gelen-evrak/g_yeni/reddet", { neden: "", yenidenAc: false })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("şablonları yalnızca yönetici güncelleyebilir ve {link} zorunludur", async () => {
    const yeni = {
      TALEP: "Merhaba {unvan}: {link}",
      RED: "Tekrar yükleyin: {link}",
    }
    await expect(http.put("/buro/sablonlar", yeni)).rejects.toMatchObject({
      status: 403,
    })
    useAuthStore.setState({ user: PERSONEL[0] })
    await expect(
      http.put("/buro/sablonlar", { ...yeni, RED: "link yok" })
    ).rejects.toMatchObject({ status: 400 })
    await http.put("/buro/sablonlar", yeni)
    // Gönderilmeyen şablon türleri (TAHAKKUK, BORC_HATIRLATMA) korunur
    expect(db.buro.all()[0]!.mesajSablonlari).toMatchObject(yeni)
    expect(db.buro.all()[0]!.mesajSablonlari.BORC_HATIRLATMA).toContain(
      "{bakiye}"
    )
    await expect(
      http.put("/buro/sablonlar", { ...yeni, BORC_HATIRLATMA: "Borcunuz var" })
    ).rejects.toMatchObject({ status: 400 })
  })
})
