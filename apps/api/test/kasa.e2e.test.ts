import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import { DEMO_KASA_SIFRESI, planCredentialSeeds } from "@prime/mock-data/kasa"
import {
  createVerifier,
  decryptJson,
  deriveKey,
  encryptJson,
  generateSalt,
  verifyKey,
  type KasaAnahtari,
} from "@prime/shared/kasa/kripto"
import type {
  CredentialKaydi,
  KasaAnahtarDegistirRequest,
  KasaMetaResponse,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type { CredentialSecret } from "@prime/shared/types/domain"

import { aktivite, credential, kasaMeta } from "../src/db/schema/index.js"
import { testUygulamasi, type Istemci, type TestUygulamasi } from "./harness.js"

/** Testte hız için alt sınırdaki tur sayısı (sunucu 100 000 altını reddeder) */
const TUR = 100_000

describe("şifre kasası", () => {
  let t: TestUygulamasi
  let zeynep: Istemci // p_3, PERSONEL
  let yonetici: Istemci // p_1
  let demoAnahtar: KasaAnahtari
  beforeAll(async () => {
    t = await testUygulamasi()
  })
  afterAll(() => t.kapat())
  beforeEach(async () => {
    await t.fixtureYukle()
    zeynep = t.istemci(await t.girisYap(PERSONEL[2]!.id))
    yonetici = t.istemci(await t.girisYap(PERSONEL[0]!.id))
    const meta = (await zeynep.get("/kasa/meta")).json<KasaMetaResponse>()
    demoAnahtar = await deriveKey(DEMO_KASA_SIFRESI, meta.salt, meta.iterations)
  })

  const liste = async (mukellefId?: string) =>
    (await zeynep.get(`/kasa/credentials${mukellefId ? `?mukellefId=${mukellefId}` : ""}`)).json<
      CredentialKaydi[]
    >()
  const eylemler = async (hedefId: string) =>
    (await t.db.select().from(aktivite).where(eq(aktivite.hedefId, hedefId))).map((a) => a.eylem)

  describe("demo seed", () => {
    it("meta demo ana şifreyi doğrular; kayıtlar plana göre ve şifreli", async () => {
      const meta = (await zeynep.get("/kasa/meta")).json<KasaMetaResponse>()
      expect(await verifyKey(demoAnahtar, meta.verifier)).toBe(true)
      const plan = planCredentialSeeds(FIXTURE_MUKELLEFLER)
      const kayitlar = await liste()
      expect(kayitlar).toHaveLength(plan.length)

      const ham = JSON.stringify(await t.db.select().from(credential))
      for (const p of plan) expect(ham).not.toContain(p.sifre)

      const gib = kayitlar.find((c) => c.mukellefId === "m_ltd" && c.sistem === "GIB")!
      const beklenen = plan.find((p) => p.mukellefId === "m_ltd" && p.sistem === "GIB")!
      expect(await decryptJson<CredentialSecret>(gib, demoAnahtar)).toEqual({
        sifre: beklenen.sifre,
        ekSifre: beklenen.ekSifre,
      })
    })

    it("liste mükellefe göre filtreler", async () => {
      expect((await liste("m_sahis")).map((c) => c.sistem).sort()).toEqual(["GIB", "IVD"])
    })

    it("oturum yoksa 401", async () => {
      expect((await t.istemci().get("/kasa/meta")).statusCode).toBe(401)
      expect((await t.istemci().get("/kasa/credentials")).statusCode).toBe(401)
    })
  })

  describe("credential CRUD", () => {
    const yeniKayit = async (sifre = "Yeni!Sifre1") => ({
      mukellefId: "m_as",
      sistem: "SGK",
      kullaniciAdi: "sgk-kullanici",
      ...(await encryptJson({ sifre }, demoAnahtar)),
    })

    it("şifreli kayıt ekler, aynı sistem için ikinciyi 409 ile reddeder", async () => {
      const body = await yeniKayit()
      const r = await zeynep.post("/kasa/credentials", body)
      expect(r.statusCode).toBe(201)
      const created = r.json<CredentialKaydi>()
      expect(created).toMatchObject({ guncelleyenId: "p_3", sonErisim: null })
      expect(created.id).toMatch(/^c_/)
      expect(await decryptJson(created, demoAnahtar)).toEqual({ sifre: "Yeni!Sifre1" })
      expect(await eylemler(created.id)).toEqual(["SIFRE_EKLENDI"])
      expect((await zeynep.post("/kasa/credentials", body)).statusCode).toBe(409)
    })

    it("şifrelenmemiş gövde, geçersiz sistem, eksik kullanıcı adı 400; olmayan mükellef 404", async () => {
      const gecerli = await yeniKayit()
      const durum = async (govde: object) => {
        const r = await zeynep.post("/kasa/credentials", { ...gecerli, ...govde })
        return [r.statusCode, r.json().message]
      }
      expect(await durum({ cipherText: "düz metin şifre!", iv: "abc" })).toEqual([
        400,
        "Şifre şifrelenmiş olarak gönderilmelidir",
      ])
      // Biçim base64 ama IV 12 bayt değil
      expect(await durum({ iv: Buffer.alloc(8).toString("base64") })).toEqual([
        400,
        "Şifre şifrelenmiş olarak gönderilmelidir",
      ])
      expect(await durum({ sistem: "BANKA" })).toEqual([400, "Geçersiz sistem"])
      expect(await durum({ kullaniciAdi: " " })).toEqual([400, "Kullanıcı adı zorunludur"])
      expect(await durum({ mukellefId: "yok" })).toEqual([404, "Mükellef bulunamadı"])
    })

    it("günceller ve siler; her işlem aktiviteye yazılır", async () => {
      const [ivd] = (await liste("m_sahis")).filter((c) => c.sistem === "IVD")
      const r = await zeynep.put(`/kasa/credentials/${ivd!.id}`, {
        kullaniciAdi: "10000000146",
        not: "Güncellendi",
        ...(await encryptJson({ sifre: "degisti" }, demoAnahtar)),
      })
      expect(r.statusCode).toBe(200)
      const updated = r.json<CredentialKaydi>()
      expect(updated.not).toBe("Güncellendi")
      expect(await decryptJson(updated, demoAnahtar)).toEqual({ sifre: "degisti" })

      expect((await zeynep.delete(`/kasa/credentials/${ivd!.id}`)).statusCode).toBe(204)
      expect((await liste("m_sahis")).map((c) => c.sistem)).toEqual(["GIB"])
      expect(await eylemler(ivd!.id)).toEqual(["SIFRE_GUNCELLENDI", "SIFRE_SILINDI"])
      expect((await zeynep.delete(`/kasa/credentials/${ivd!.id}`)).statusCode).toBe(404)
    })

    it("erişim kaydı son erişimi günceller; geçersiz eylem 400", async () => {
      const [gib] = await liste("m_ltd")
      expect(gib!.sonErisim).toBeNull()
      const r = await zeynep.post(`/kasa/credentials/${gib!.id}/erisim`, {
        eylem: "SIFRE_KOPYALANDI",
      })
      expect(r.json().sonErisim).toMatchObject({
        aktorAdi: "Zeynep Demir",
        eylem: "SIFRE_KOPYALANDI",
      })
      expect((await liste("m_ltd"))[0]!.sonErisim?.eylem).toBe("SIFRE_KOPYALANDI")
      expect(
        (await zeynep.post(`/kasa/credentials/${gib!.id}/erisim`, { eylem: "SIFRE_SILINDI" }))
          .statusCode
      ).toBe(400)
    })

    it("toplu: ekler, uzerineYaz ile günceller, aksi halde atlar; hatalı satırı raporlar", async () => {
      const sifreli = await encryptJson({ sifre: "toplu" }, demoAnahtar)
      const kayitlar = [
        { satir: 2, mukellefId: "m_as", sistem: "SGK", kullaniciAdi: "a", ...sifreli },
        { satir: 3, mukellefId: "m_ltd", sistem: "GIB", kullaniciAdi: "b", ...sifreli },
        { satir: 4, mukellefId: "yok", sistem: "GIB", kullaniciAdi: "c", ...sifreli },
        { satir: 5, mukellefId: "m_as", sistem: "IVD", kullaniciAdi: "d", cipherText: "x y", iv: "" },
      ]
      const atla = await zeynep.post("/kasa/credentials/toplu", { uzerineYaz: false, kayitlar })
      expect(atla.json<TopluAktarimSonucu>()).toEqual({
        olusturulan: 1,
        guncellenen: 0,
        atlanan: 1,
        hatalar: [
          { satir: 4, mesaj: "Mükellef bulunamadı" },
          { satir: 5, mesaj: "Şifre şifrelenmiş olarak gönderilmelidir" },
        ],
      })
      const yaz = await zeynep.post("/kasa/credentials/toplu", { uzerineYaz: true, kayitlar })
      expect(yaz.json<TopluAktarimSonucu>()).toMatchObject({ olusturulan: 0, guncellenen: 2 })
      const gib = (await liste("m_ltd")).find((c) => c.sistem === "GIB")!
      expect(gib.kullaniciAdi).toBe("b")
      expect(await decryptJson(gib, demoAnahtar)).toEqual({ sifre: "toplu" })
      expect(
        (await zeynep.post("/kasa/credentials/toplu", { uzerineYaz: true, kayitlar: [] })).statusCode
      ).toBe(400)
    })
  })

  describe("kurulum ve ana şifre değişimi", () => {
    const yeniMeta = async (sifre: string, iterations = TUR) => {
      const salt = generateSalt()
      const key = await deriveKey(sifre, salt, iterations)
      return { key, meta: { salt, iterations, verifier: await createVerifier(key) } }
    }

    it("kasa kurulu değilse meta 404, yazma 409; yönetici kurar, ikinci kurulum 409", async () => {
      await t.db.delete(credential)
      await t.db.delete(kasaMeta)
      expect((await zeynep.get("/kasa/meta")).json()).toEqual({ message: "Kasa henüz kurulmadı" })
      expect((await zeynep.post("/kasa/credentials", {})).statusCode).toBe(409)

      const { key, meta } = await yeniMeta("YeniAnaSifre!")
      const personel = await zeynep.post("/kasa/kurulum", meta)
      expect(personel.statusCode).toBe(403)

      expect((await yonetici.post("/kasa/kurulum", { ...meta, iterations: 1000 })).statusCode).toBe(
        400
      )
      expect((await yonetici.post("/kasa/kurulum", meta)).statusCode).toBe(201)
      const okunan = (await zeynep.get("/kasa/meta")).json<KasaMetaResponse>()
      expect(okunan).toEqual(meta)
      expect(await verifyKey(key, okunan.verifier)).toBe(true)
      expect((await yonetici.post("/kasa/kurulum", meta)).statusCode).toBe(409)
      const [log] = await t.db.select().from(aktivite).where(eq(aktivite.eylem, "KASA_KURULDU"))
      expect(log?.aktorId).toBe("p_1")
    })

    const yenidenSifrele = async (yeniKey: KasaAnahtari) =>
      Promise.all(
        (await liste()).map(async (c) => ({
          id: c.id,
          ...(await encryptJson(await decryptJson(c, demoAnahtar), yeniKey)),
        }))
      )

    it("yönetici ana şifreyi değiştirir: tüm kayıtlar yeni anahtarla çözülür, eski anahtarla çözülmez", async () => {
      const once = await liste()
      const { key, meta } = await yeniMeta("BaskaAnaSifre!")
      const govde: KasaAnahtarDegistirRequest = { meta, kayitlar: await yenidenSifrele(key) }
      expect((await zeynep.post("/kasa/anahtar-degistir", govde)).statusCode).toBe(403)
      const r = await yonetici.post("/kasa/anahtar-degistir", govde)
      expect(r.statusCode).toBe(200)

      const okunan = (await zeynep.get("/kasa/meta")).json<KasaMetaResponse>()
      expect(await verifyKey(key, okunan.verifier)).toBe(true)
      expect(await verifyKey(demoAnahtar, okunan.verifier)).toBe(false)
      const sonra = await liste()
      expect(sonra).toHaveLength(once.length)
      for (const c of sonra) {
        const eski = once.find((o) => o.id === c.id)!
        expect(await decryptJson(c, key)).toEqual(await decryptJson(eski, demoAnahtar))
        await expect(decryptJson(c, demoAnahtar)).rejects.toThrow()
        // Şifrenin kendisi değişmedi: son güncelleme bilgisi korunur
        expect(c.sonGuncelleme).toBe(eski.sonGuncelleme)
      }
      const [log] = await t.db
        .select()
        .from(aktivite)
        .where(eq(aktivite.eylem, "KASA_ANAHTARI_DEGISTI"))
      expect(log?.aciklama).toBe(`${once.length} kayıt yeniden şifrelendi`)
    })

    it("eksik, fazla ya da tekrarlı kayıt kümesi 409; hiçbir şey yazılmaz", async () => {
      const { key, meta } = await yeniMeta("BaskaAnaSifre!")
      const kayitlar = await yenidenSifrele(key)
      const once = (await zeynep.get("/kasa/meta")).json<KasaMetaResponse>()

      const eksik = await yonetici.post("/kasa/anahtar-degistir", { meta, kayitlar: kayitlar.slice(1) })
      expect(eksik.statusCode).toBe(409)
      const tekrar = await yonetici.post("/kasa/anahtar-degistir", {
        meta,
        kayitlar: [...kayitlar.slice(1), kayitlar[1]],
      })
      expect(tekrar.statusCode).toBe(409)
      const bozuk = await yonetici.post("/kasa/anahtar-degistir", {
        meta,
        kayitlar: [{ ...kayitlar[0], cipherText: "düz" }, ...kayitlar.slice(1)],
      })
      expect(bozuk.statusCode).toBe(400)
      expect((await zeynep.get("/kasa/meta")).json()).toEqual(once)
    })
  })
})
