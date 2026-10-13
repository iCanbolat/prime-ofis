import { beforeEach, describe, expect, it } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { decryptJson, deriveKey, encryptJson, verifyKey } from "@/lib/crypto"
import { http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import {
  DEMO_KASA_SIFRESI,
  ensureVault,
  planCredentialSeeds,
} from "@/mocks/vault"
import type { CredentialKaydi, KasaMetaResponse } from "@prime/shared/types/api"
import type { CredentialSecret } from "@prime/shared/types/domain"

async function demoKey() {
  const meta = await http.get<KasaMetaResponse>("/kasa/meta")
  return deriveKey(DEMO_KASA_SIFRESI, meta.salt, meta.iterations)
}

beforeEach(() => {
  useAuthStore.setState({ user: PERSONEL[2] })
})

describe("demo kasa (ensureVault)", () => {
  it("ilk istekte meta ve şifreli örnek kayıtları oluşturur", async () => {
    expect(db.kasa.count()).toBe(0)
    const meta = await http.get<KasaMetaResponse>("/kasa/meta")
    expect(db.kasa.count()).toBe(1)
    expect(
      await verifyKey(
        await deriveKey(DEMO_KASA_SIFRESI, meta.salt, meta.iterations),
        meta.verifier
      )
    ).toBe(true)
    expect(db.credential.count()).toBe(
      planCredentialSeeds(FIXTURE_MUKELLEFLER).length
    )
  })

  it("eşzamanlı çağrılar kasayı bir kez oluşturur", async () => {
    await Promise.all([ensureVault(), ensureVault(), ensureVault()])
    expect(db.kasa.count()).toBe(1)
  })

  it("sunucu düz metin şifre saklamaz; demo şifresiyle çözülen değer plana eşittir", async () => {
    const plan = planCredentialSeeds(FIXTURE_MUKELLEFLER)
    const key = await demoKey()
    const list = await http.get<CredentialKaydi[]>("/kasa/credentials")
    const raw = JSON.stringify(db.credential.all())
    for (const seed of plan) expect(raw).not.toContain(seed.sifre)

    const gib = list.find(
      (c) => c.mukellefId === "m_ltd" && c.sistem === "GIB"
    )!
    const beklenen = plan.find(
      (p) => p.mukellefId === "m_ltd" && p.sistem === "GIB"
    )!
    expect(await decryptJson<CredentialSecret>(gib, key)).toEqual({
      sifre: beklenen.sifre,
      ekSifre: beklenen.ekSifre,
    })
  })

  it("örnek planı deterministik ve kurallı: SGK'sı olmayana SGK şifresi yok", () => {
    const plan = planCredentialSeeds(FIXTURE_MUKELLEFLER)
    expect(plan).toEqual(planCredentialSeeds(FIXTURE_MUKELLEFLER))
    const sistemler = (id: string) =>
      plan.filter((p) => p.mukellefId === id).map((p) => p.sistem)
    expect(sistemler("m_sahis")).toEqual(["GIB", "IVD"])
    expect(sistemler("m_ltd")).toEqual(["GIB", "IVD", "SGK", "EBILDIRGE"])
    expect(sistemler("m_as")).toEqual(["GIB", "IVD"]) // index 2: SGK bilinçli olarak eksik
  })
})

describe("credential CRUD", () => {
  it("listeyi mükellefe göre filtreler", async () => {
    const list = await http.get<CredentialKaydi[]>("/kasa/credentials", {
      params: { mukellefId: "m_sahis" },
    })
    expect(list.map((c) => c.sistem).sort()).toEqual(["GIB", "IVD"])
  })

  it("şifreli kayıt ekler, aynı sistem için ikinciyi 409 ile reddeder", async () => {
    const key = await demoKey()
    const body = {
      mukellefId: "m_as",
      sistem: "SGK",
      kullaniciAdi: "sgk-kullanici",
      ...(await encryptJson({ sifre: "Yeni!Sifre1" }, key)),
    }
    const created = await http.post<CredentialKaydi>("/kasa/credentials", body)
    expect(created.guncelleyenId).toBe("p_3")
    expect(await decryptJson(created, key)).toEqual({ sifre: "Yeni!Sifre1" })
    expect(
      db.aktivite.where(
        (a) => a.eylem === "SIFRE_EKLENDI" && a.mukellefId === "m_as"
      )
    ).toHaveLength(1)
    await expect(http.post("/kasa/credentials", body)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("şifrelenmemiş gövdeyi reddeder", async () => {
    await ensureVault()
    await expect(
      http.post("/kasa/credentials", {
        mukellefId: "m_as",
        sistem: "SGK",
        kullaniciAdi: "x",
        cipherText: "düz metin şifre!",
        iv: "abc",
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("günceller ve siler; her işlem aktiviteye yazılır", async () => {
    const key = await demoKey()
    const [ivd] = await http
      .get<CredentialKaydi[]>("/kasa/credentials", {
        params: { mukellefId: "m_sahis" },
      })
      .then((l) => l.filter((c) => c.sistem === "IVD"))
    const updated = await http.put<CredentialKaydi>(
      `/kasa/credentials/${ivd.id}`,
      {
        kullaniciAdi: "10000000146",
        not: "Güncellendi",
        ...(await encryptJson({ sifre: "degisti" }, key)),
      }
    )
    expect(updated.not).toBe("Güncellendi")
    expect(await decryptJson(updated, key)).toEqual({ sifre: "degisti" })

    await http.delete(`/kasa/credentials/${ivd.id}`)
    expect(db.credential.find(ivd.id)).toBeUndefined()
    const eylemler = db.aktivite
      .where((a) => a.hedefId === ivd.id)
      .map((a) => a.eylem)
    expect(eylemler).toEqual(["SIFRE_GUNCELLENDI", "SIFRE_SILINDI"])
  })

  it("erişim kaydı son erişimi günceller; geçersiz eylem 400", async () => {
    const [gib] = await http.get<CredentialKaydi[]>("/kasa/credentials", {
      params: { mukellefId: "m_ltd" },
    })
    expect(gib.sonErisim).toBeNull()
    const r = await http.post<{
      sonErisim: { aktorAdi: string; eylem: string }
    }>(`/kasa/credentials/${gib.id}/erisim`, { eylem: "SIFRE_KOPYALANDI" })
    expect(r.sonErisim).toMatchObject({
      aktorAdi: "Zeynep Demir",
      eylem: "SIFRE_KOPYALANDI",
    })
    await expect(
      http.post(`/kasa/credentials/${gib.id}/erisim`, {
        eylem: "SIFRE_SILINDI",
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})
