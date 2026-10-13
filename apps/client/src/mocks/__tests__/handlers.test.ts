import { describe, expect, it } from "vitest"

import { http } from "@/lib/http"
import { db } from "@/mocks/db"
import { useAuthStore } from "@/features/auth/store"
import {
  DEMO_GIRIS_SIFRESI,
  PERSONEL,
} from "@prime/mock-data/factories/personel"
import type {
  LoginResponse,
  MukellefListResponse,
} from "@prime/shared/types/api"

describe("GET /api/mukellefler", () => {
  const list = (params = {}) =>
    http.get<MukellefListResponse>("/mukellefler", { params })

  it("tüm mükellefleri unvana göre (Türkçe) sıralı döner", async () => {
    const { items, total } = await list()
    expect(total).toBe(3)
    expect(items.map((m) => m.unvan)).toEqual([
      "Ali Veli",
      "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      "Öztürk İnşaat A.Ş.",
    ])
  })

  it("tür filtresi (çoklu)", async () => {
    expect((await list({ tur: ["LTD"] })).items.map((m) => m.id)).toEqual([
      "m_ltd",
    ])
    expect((await list({ tur: ["LTD", "AS"] })).total).toBe(2)
  })

  it("sorumlu personel filtresi", async () => {
    expect((await list({ sorumlu: "p_2" })).items.map((m) => m.id)).toEqual([
      "m_sahis",
      "m_as",
    ])
  })

  it("arama: Türkçe büyük/küçük harf duyarsız unvan ve VKN/TCKN", async () => {
    expect((await list({ q: "ÇINAR" })).items.map((m) => m.id)).toEqual([
      "m_ltd",
    ])
    expect((await list({ q: "inşaat" })).items.map((m) => m.id)).toEqual([
      "m_as",
    ])
    expect((await list({ q: "9358005" })).items.map((m) => m.id)).toEqual([
      "m_as",
    ])
    expect((await list({ q: "10000000146" })).items.map((m) => m.id)).toEqual([
      "m_sahis",
    ])
    expect((await list({ q: "bulunmayan" })).total).toBe(0)
  })
})

describe("GET /api/mukellefler/:id", () => {
  it("kaydı döner, yoksa 404", async () => {
    await expect(http.get("/mukellefler/m_as")).resolves.toMatchObject({
      unvan: "Öztürk İnşaat A.Ş.",
    })
    await expect(http.get("/mukellefler/yok")).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("auth", () => {
  const eposta = (id: string) => PERSONEL.find((p) => p.id === id)!.eposta

  it("login personeli döner ve GIRIS aktivitesi yazar", async () => {
    const { personel } = await http.post<LoginResponse>("/auth/login", {
      eposta: eposta("p_3").toUpperCase(),
      sifre: DEMO_GIRIS_SIFRESI,
    })
    expect(personel.ad).toBe("Zeynep")
    expect(
      db.aktivite.where((a) => a.aktorId === "p_3" && a.eylem === "GIRIS")
    ).toHaveLength(1)
  })

  it("bilinmeyen kullanıcı / hatalı şifre 401, pasif kullanıcı 403", async () => {
    const sifre = DEMO_GIRIS_SIFRESI
    await expect(
      http.post("/auth/login", { eposta: "yok@primemusavirlik.com.tr", sifre })
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      http.post("/auth/login", { eposta: eposta("p_3"), sifre: "yanlis-sifre" })
    ).rejects.toMatchObject({ status: 401 })
    expect(db.aktivite.count((a) => a.eylem === "GIRIS")).toBe(0)
    db.personel.update("p_4", { aktif: false })
    await expect(
      http.post("/auth/login", { eposta: eposta("p_4"), sifre })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("logout CIKIS aktivitesi yazar", async () => {
    useAuthStore.setState({ user: PERSONEL[0]! })
    await http.post("/auth/logout")
    expect(db.aktivite.where((a) => a.eylem === "CIKIS")).toHaveLength(1)
  })

  it("/auth/me oturumun personelini döner, oturum yoksa 401", async () => {
    await expect(http.get("/auth/me")).rejects.toMatchObject({ status: 401 })
    useAuthStore.setState({ user: PERSONEL[1]! })
    await expect(http.get<LoginResponse>("/auth/me")).resolves.toEqual({
      personel: PERSONEL[1],
    })
  })
})

describe("dev", () => {
  it("reset seed'e döner, stats koleksiyon sayılarını verir", async () => {
    expect(await http.get("/dev/stats")).toEqual({
      buro: 1,
      personel: 4,
      kimlik: 4,
      mukellef: 3,
      aktivite: 0,
      credential: 0,
      kasa: 0,
      takvim: 0,
      arsiv: 9,
      talep: 4,
      gelen: 3,
      gorev: 6,
      baglanti: 2,
      ebelge: 9,
      berat: 11,
      kontor: 1,
      tahakkuk: 0,
      mizan: 0,
      bildirim: 0,
      cari: 4,
      kesintiAktarim: 0,
      kesinti: 0,
      tebligat: 2,
      tebligatErisim: 2,
      tebligatTarama: 1,
      kanal: 1,
      bildirimTercihi: 0,
      gonderim: 0,
      okuma: 2,
      fis: 3,
      fisHesapAyari: 0,
      lucaAktarim: 0,
      bordro: 0,
      isHareketi: 0,
      sgkErisim: 0,
      vergiLevhasi: 0,
      borcSorgusu: 0,
      borcuYoktur: 0,
      kamuDogrulama: 0,
      kamuTarama: 0,
    })
    await http.post("/dev/reset")
    const seed = await http.get<Record<string, number>>("/dev/stats")
    expect(seed.mukellef).toBe(40)
    expect(seed.bordro).toBeGreaterThan(0)
    expect(seed.borcSorgusu).toBeGreaterThan(0)
    expect(seed.kamuDogrulama).toBe(1)
  })
})
