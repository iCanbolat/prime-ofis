import { count, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { DEMO_GIRIS_SIFRESI, PERSONEL } from "@prime/mock-data/factories/personel"
import type { PersonelBilgi, PersonelOlusturRequest } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { aktivite, personel, personelKimlik } from "../src/db/schema/index.js"
import { PersonelService } from "../src/personel/personel.service.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

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

describe("personel yönetimi", () => {
  let t: TestUygulamasi
  let yonetici: Istemci
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())
  beforeEach(async () => {
    await t.fixtureYukle()
    yonetici = t.istemci(await t.girisYap(YONETICI.id))
  })

  const olustur = (over: Partial<PersonelOlusturRequest> = {}) =>
    yonetici.post("/personel", { ...bilgi(), sifre: "ilkSifre123", ...onay, ...over })
  const girisDurumu = async (eposta: string, sifre: string) =>
    (await t.istemci().post("/auth/login", { eposta, sifre })).statusCode
  const personelSayisi = async () =>
    (await t.db.select({ n: count() }).from(personel))[0]!.n

  it("liste tüm personeli döner; şifre özeti yanıta sızmaz", async () => {
    const yanit = await yonetici.get("/personel")
    expect(yanit.json()).toEqual(PERSONEL)
    expect(yanit.body).not.toMatch(/hash|argon/)
  })

  it("yönetici personel ekler; yeni kullanıcı belirlenen şifreyle giriş yapar", async () => {
    const yanit = await olustur()
    expect(yanit.statusCode).toBe(201)
    const p = yanit.json<Personel>()
    expect(p).toMatchObject({ ad: "Can", rol: "PERSONEL", aktif: true, renk: "rose" })
    expect(p.id).toMatch(/^p_/)
    const [kimlik] = await t.db.select().from(personelKimlik).where(eq(personelKimlik.personelId, p.id))
    expect(kimlik?.hash).toMatch(/^\$argon2id\$/)

    expect(await girisDurumu(p.eposta, "ilkSifre123")).toBe(200)
    expect(await girisDurumu(p.eposta, DEMO_GIRIS_SIFRESI)).toBe(401)
    const eklendi = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "PERSONEL_EKLENDI"))
    expect(eklendi).toMatchObject([{ aktorId: YONETICI.id, aciklama: "Can Öz" }])
  })

  it("her işlem yönetici şifresi ister", async () => {
    const yanlis = await olustur({ yoneticiSifresi: "yanlis" })
    expect(yanlis.statusCode).toBe(403)
    expect(yanlis.json()).toEqual({ message: "Yönetici şifresi hatalı" })
    // Şifre gövde doğrulamasından önce sorulur
    expect((await yonetici.post("/personel", {})).statusCode).toBe(403)
    expect(
      (await yonetici.put(`/personel/${PERSONEL_2.id}/sifre`, { sifre: "yeniSifre99" })).statusCode
    ).toBe(403)
    expect(
      (await yonetici.post(`/personel/${PERSONEL_2.id}/sil`, { yoneticiSifresi: "" })).statusCode
    ).toBe(403)
    expect(await personelSayisi()).toBe(4)
  })

  it("yönetici olmayan kullanıcı kendi şifresiyle de işlem yapamaz", async () => {
    const personelIstemci = t.istemci(await t.girisYap(PERSONEL_2.id))
    const yanit = await personelIstemci.post("/personel", {
      ...bilgi(),
      sifre: "ilkSifre123",
      ...onay,
    })
    expect(yanit.statusCode).toBe(403)
    expect(yanit.json()).toEqual({ message: "Personeli yalnızca yönetici yönetebilir" })
  })

  it("doğrulama: kısa şifre, geçersiz e-posta, eksik ad, telefon, tekrar eden e-posta", async () => {
    expect((await olustur({ sifre: "kisa" })).json()).toEqual({
      message: "Şifre en az 8 karakter olmalı",
    })
    expect((await olustur({ eposta: "gecersiz" })).json()).toEqual({
      message: "Geçerli bir e-posta girin",
    })
    expect((await olustur({ ad: "  " })).json()).toEqual({ message: "Ad ve soyad zorunludur" })
    expect((await olustur({ telefon: "0555" })).statusCode).toBe(400)
    expect((await olustur({ rol: "PATRON" as never })).json()).toEqual({ message: "Geçersiz rol" })
    const cakisan = await olustur({ eposta: PERSONEL_2.eposta.toUpperCase() })
    expect(cakisan.statusCode).toBe(409)
    expect(cakisan.json()).toEqual({ message: "Bu e-posta başka bir personelde kayıtlı" })
  })

  it("şifre değiştirilir; eski şifre ve eski oturumlar geçersiz olur", async () => {
    const eskiOturum = t.istemci(await t.girisYap(PERSONEL_2.id))
    const yanit = await yonetici.put(`/personel/${PERSONEL_2.id}/sifre`, {
      sifre: "yeniSifre99",
      ...onay,
    })
    expect(yanit.statusCode).toBe(204)
    expect(await girisDurumu(PERSONEL_2.eposta, DEMO_GIRIS_SIFRESI)).toBe(401)
    expect(await girisDurumu(PERSONEL_2.eposta, "yeniSifre99")).toBe(200)
    expect((await eskiOturum.get("/auth/me")).statusCode).toBe(401)
  })

  it("yönetici kendi şifresini değiştirince mevcut oturumu açık kalır", async () => {
    const baska = t.istemci(await t.girisYap(YONETICI.id))
    await yonetici.put(`/personel/${YONETICI.id}/sifre`, { sifre: "yeniSifre99", ...onay })
    expect((await yonetici.get("/auth/me")).statusCode).toBe(200)
    expect((await baska.get("/auth/me")).statusCode).toBe(401)
  })

  it("düzenleme; son aktif yönetici düşürülemez; 404", async () => {
    const guncel = await yonetici.put(`/personel/${PERSONEL_2.id}`, {
      ...bilgi({ ...PERSONEL_2, soyad: "Kayalı", rol: "YONETICI" }),
      ...onay,
    })
    expect(guncel.json()).toMatchObject({ soyad: "Kayalı", rol: "YONETICI" })

    await t.db.update(personel).set({ rol: "PERSONEL" }).where(eq(personel.id, PERSONEL_2.id))
    const son = await yonetici.put(`/personel/${YONETICI.id}`, {
      ...bilgi({ ...YONETICI, aktif: false }),
      ...onay,
    })
    expect(son.statusCode).toBe(409)
    expect(son.json()).toEqual({ message: "Büroda en az bir aktif yönetici kalmalı" })

    const yok = await yonetici.put("/personel/p_yok", { ...bilgi(), ...onay })
    expect(yok.statusCode).toBe(404)
    expect(yok.json()).toEqual({ message: "Personel bulunamadı" })
  })

  it("pasife alınan personelin oturumları kapanır", async () => {
    const oturum = t.istemci(await t.girisYap(PERSONEL_2.id))
    await yonetici.put(`/personel/${PERSONEL_2.id}`, {
      ...bilgi({ ...PERSONEL_2, aktif: false }),
      ...onay,
    })
    expect((await oturum.get("/auth/me")).statusCode).toBe(401)
  })

  it("silme: kendini silemez, açık işi olan silinmez, işi olmayan silinir", async () => {
    const kendi = await yonetici.post(`/personel/${YONETICI.id}/sil`, onay)
    expect(kendi.statusCode).toBe(409)
    expect(kendi.json()).toEqual({ message: "Kendi hesabınızı silemezsiniz" })

    const p = (await olustur()).json<Personel>()
    // Mükellef / görev modülleri (Faz 2–3) kendi kontrollerini kaydeder
    let sorumlu = p.id
    t.app.get(PersonelService).silmeKontroluEkle(async (id) =>
      id === sorumlu ? "1 mükellefin sorumlusu" : null
    )
    const acikIs = await yonetici.post(`/personel/${p.id}/sil`, onay)
    expect(acikIs.statusCode).toBe(409)
    expect(acikIs.json()).toEqual({
      message: "Can Öz 1 mükellefin sorumlusu. Önce devredin veya personeli pasife alın.",
    })

    sorumlu = PERSONEL_2.id
    expect((await yonetici.post(`/personel/${p.id}/sil`, onay)).statusCode).toBe(204)
    expect(await t.db.select().from(personel).where(eq(personel.id, p.id))).toEqual([])
    expect(
      await t.db.select().from(personelKimlik).where(eq(personelKimlik.personelId, p.id))
    ).toEqual([])
    expect(await girisDurumu(p.eposta, "ilkSifre123")).toBe(401)
  })
})
