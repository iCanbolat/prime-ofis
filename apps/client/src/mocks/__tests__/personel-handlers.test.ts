import { beforeEach, describe, expect, it } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { http } from "@/lib/http"
import { db } from "@/mocks/db"
import {
  DEMO_GIRIS_SIFRESI,
  PERSONEL,
} from "@prime/mock-data/factories/personel"
import type {
  LoginResponse,
  PersonelBilgi,
  PersonelOlusturRequest,
} from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

const [YONETICI, PERSONEL_2] = PERSONEL as [Personel, Personel]
const onay = { yoneticiSifresi: DEMO_GIRIS_SIFRESI }

const bilgi = (over: Partial<PersonelBilgi> = {}): PersonelBilgi => ({
  ad: "Can",
  soyad: "Öz",
  eposta: "can.oz@primemusavirlik.com.tr",
  telefon: "05551112233",
  rol: "PERSONEL",
  renk: "rose",
  aktif: true,
  ...over,
})

const olustur = (over: Partial<PersonelOlusturRequest> = {}) =>
  http.post<Personel>("/personel", {
    ...bilgi(),
    sifre: "ilkSifre123",
    ...onay,
    ...over,
  })

const giris = (personelId: string, sifre: string) =>
  http.post<LoginResponse>("/auth/login", {
    eposta: db.personel.find(personelId)?.eposta ?? `${personelId}@yok.test`,
    sifre,
  })

beforeEach(() => useAuthStore.setState({ user: YONETICI }))

describe("personel yönetimi", () => {
  it("yönetici personel ekler; yeni kullanıcı belirlenen şifreyle giriş yapar", async () => {
    const p = await olustur()
    expect(p).toMatchObject({ ad: "Can", rol: "PERSONEL", aktif: true })
    // Şifre özeti API yanıtına sızmaz
    const liste = await http.get<Record<string, unknown>[]>("/personel")
    expect(JSON.stringify(liste)).not.toMatch(/hash|salt|ilkSifre/)
    expect(db.kimlik.find(p.id)?.hash).toBeTruthy()

    await expect(giris(p.id, "ilkSifre123")).resolves.toMatchObject({
      personel: { id: p.id },
    })
    await expect(giris(p.id, DEMO_GIRIS_SIFRESI)).rejects.toMatchObject({
      status: 401,
    })
    expect(db.aktivite.count((a) => a.eylem === "PERSONEL_EKLENDI")).toBe(1)
  })

  it("her işlem yönetici şifresi ister", async () => {
    await expect(olustur({ yoneticiSifresi: "yanlis" })).rejects.toMatchObject({
      status: 403,
      message: "Yönetici şifresi hatalı",
    })
    await expect(
      http.put(`/personel/${PERSONEL_2.id}/sifre`, { sifre: "yeniSifre99" })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      http.post(`/personel/${PERSONEL_2.id}/sil`, { yoneticiSifresi: "" })
    ).rejects.toMatchObject({ status: 403 })
    expect(db.personel.count()).toBe(4)
  })

  it("yönetici olmayan kullanıcı kendi şifresiyle de işlem yapamaz", async () => {
    useAuthStore.setState({ user: PERSONEL_2 })
    await expect(olustur()).rejects.toMatchObject({ status: 403 })
  })

  it("doğrulama: kısa şifre, geçersiz e-posta, tekrar eden e-posta", async () => {
    await expect(olustur({ sifre: "kisa" })).rejects.toMatchObject({
      status: 400,
    })
    await expect(olustur({ eposta: "gecersiz" })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      olustur({ eposta: PERSONEL_2.eposta.toUpperCase() })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("şifre değiştirilir; eski şifre geçersiz olur", async () => {
    await http.put(`/personel/${PERSONEL_2.id}/sifre`, {
      sifre: "yeniSifre99",
      ...onay,
    })
    await expect(
      giris(PERSONEL_2.id, DEMO_GIRIS_SIFRESI)
    ).rejects.toMatchObject({ status: 401 })
    await expect(giris(PERSONEL_2.id, "yeniSifre99")).resolves.toBeTruthy()
  })

  it("düzenleme; son aktif yönetici düşürülemez", async () => {
    const guncel = await http.put<Personel>(`/personel/${PERSONEL_2.id}`, {
      ...bilgi({ ...PERSONEL_2, soyad: "Kayalı", rol: "YONETICI" }),
      ...onay,
    })
    expect(guncel).toMatchObject({ soyad: "Kayalı", rol: "YONETICI" })

    db.personel.update(PERSONEL_2.id, { rol: "PERSONEL" })
    await expect(
      http.put(`/personel/${YONETICI.id}`, {
        ...bilgi({ ...YONETICI, aktif: false }),
        ...onay,
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("silme: kendini silemez, açık işi olan silinmez, işi olmayan silinir", async () => {
    await expect(
      http.post(`/personel/${YONETICI.id}/sil`, onay)
    ).rejects.toMatchObject({ status: 409 })

    const p = await olustur()
    db.mukellef.update("m_ltd", { sorumluPersonelId: p.id })
    await expect(
      http.post(`/personel/${p.id}/sil`, onay)
    ).rejects.toMatchObject({ status: 409 })

    db.mukellef.update("m_ltd", { sorumluPersonelId: PERSONEL_2.id })
    await http.post(`/personel/${p.id}/sil`, onay)
    expect(db.personel.find(p.id)).toBeUndefined()
    expect(db.kimlik.find(p.id)).toBeUndefined()
    await expect(giris(p.id, "ilkSifre123")).rejects.toMatchObject({
      status: 401,
    })
  })
})
