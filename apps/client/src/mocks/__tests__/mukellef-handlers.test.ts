import { beforeEach, describe, expect, it } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import {
  formValuesToInput,
  mukellefToFormValues,
} from "@prime/shared/mukellef/schemas"
import { http } from "@/lib/http"
import { db, resetDb } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import type { MukellefInput, MukellefListResponse } from "@prime/shared/types/api"
import type { Mukellef } from "@prime/shared/types/domain"

const list = (params = {}) =>
  http.get<MukellefListResponse>("/mukellefler", { params })

const yeniSahis = (): MukellefInput => ({
  ...formValuesToInput(mukellefToFormValues(FIXTURE_MUKELLEFLER[0])),
  unvan: "Yeni Şahıs",
  tckn: "60465985014",
})

beforeEach(() => {
  useAuthStore.setState({ user: PERSONEL[1] })
})

describe("GET /api/mukellefler — sayfalama, sıralama, durum", () => {
  beforeEach(() => resetDb()) // 40 kayıtlık seed

  it("sayfa parametresi yoksa tüm kayıtları döner", async () => {
    const r = await list()
    expect(r.items).toHaveLength(40)
    expect(r.total).toBe(40)
  })

  it("sayfalar ve toplamı döner; son sayfa aşılırsa son sayfaya sabitlenir", async () => {
    const s1 = await list({ sayfa: 1, sayfaBoyutu: 15 })
    const s3 = await list({ sayfa: 3, sayfaBoyutu: 15 })
    expect(s1.items).toHaveLength(15)
    expect(s3.items).toHaveLength(10)
    expect(s3.total).toBe(40)
    expect((await list({ sayfa: 99, sayfaBoyutu: 15 })).sayfa).toBe(3)
    const ids = new Set(
      [
        ...s1.items,
        ...(await list({ sayfa: 2, sayfaBoyutu: 15 })).items,
        ...s3.items,
      ].map((m) => m.id)
    )
    expect(ids.size).toBe(40)
  })

  it("unvana göre azalan ve kayıt tarihine göre sıralar", async () => {
    const desc = (await list({ yon: "desc" })).items.map((m) => m.unvan)
    expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a, "tr-TR")))
    const tarih = (await list({ sirala: "olusturmaTarihi" })).items.map(
      (m) => m.olusturmaTarihi
    )
    expect(tarih).toEqual([...tarih].sort())
  })

  it("durum filtresi aktif/pasif ayırır", async () => {
    const aktif = await list({ durum: "aktif" })
    const pasif = await list({ durum: "pasif" })
    expect(aktif.total + pasif.total).toBe(40)
    expect(aktif.items.every((m) => m.aktif)).toBe(true)
    expect(pasif.items.every((m) => !m.aktif)).toBe(true)
  })
})

describe("POST /api/mukellefler", () => {
  it("kaydı oluşturur, id/tarih atar ve aktivite yazar", async () => {
    const created = await http.post<Mukellef>("/mukellefler", yeniSahis())
    expect(created.id).toMatch(/^m_/)
    expect(created.olusturmaTarihi).toBeTruthy()
    expect(db.mukellef.find(created.id)?.unvan).toBe("Yeni Şahıs")
    expect(
      db.aktivite.where(
        (a) => a.eylem === "MUKELLEF_OLUSTURULDU" && a.mukellefId === created.id
      )
    ).toHaveLength(1)
  })

  it("kasa henüz oluşmamışken eklenen mükellef demo şifre almaz", async () => {
    expect(db.kasa.count()).toBe(0)
    const created = await http.post<Mukellef>("/mukellefler", yeniSahis())
    expect(db.kasa.count()).toBe(1)
    expect(db.credential.where((c) => c.mukellefId === created.id)).toEqual([])
    expect(db.credential.count()).toBeGreaterThan(0)
  })

  it("aynı TCKN ile ikinci kayıt 409 döner", async () => {
    await expect(
      http.post("/mukellefler", { ...yeniSahis(), tckn: "10000000146" })
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Ali Veli"),
    })
  })

  it("geçersiz VKN ve bilinmeyen sorumlu 400 döner", async () => {
    const ltd = formValuesToInput(mukellefToFormValues(FIXTURE_MUKELLEFLER[1]))
    await expect(
      http.post("/mukellefler", { ...ltd, vkn: "0174520663" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      http.post("/mukellefler", { ...yeniSahis(), sorumluPersonelId: "p_99" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("şirket türünde gelen TCKN alanını atar", async () => {
    const ltd = formValuesToInput(mukellefToFormValues(FIXTURE_MUKELLEFLER[1]))
    const created = await http.post<Mukellef>("/mukellefler", {
      ...ltd,
      vkn: "1234567890",
      tckn: "60465985014",
    })
    expect(created.tckn).toBeUndefined()
  })

  it("oturum yoksa 401 döner", async () => {
    useAuthStore.setState({ user: null })
    await expect(http.post("/mukellefler", yeniSahis())).rejects.toMatchObject({
      status: 401,
    })
  })
})

describe("PUT /api/mukellefler/:id", () => {
  it("günceller; kendi VKN'si çakışma sayılmaz", async () => {
    const ltd = formValuesToInput(mukellefToFormValues(FIXTURE_MUKELLEFLER[1]))
    const updated = await http.put<Mukellef>("/mukellefler/m_ltd", {
      ...ltd,
      unvan: "Çınar Yeni Unvan Ltd. Şti.",
    })
    expect(updated.unvan).toBe("Çınar Yeni Unvan Ltd. Şti.")
    expect(updated.olusturmaTarihi).toBe(FIXTURE_MUKELLEFLER[1].olusturmaTarihi)
  })

  it("başka mükellefin VKN'sini alamaz; olmayan kayıt 404", async () => {
    const ltd = formValuesToInput(mukellefToFormValues(FIXTURE_MUKELLEFLER[1]))
    await expect(
      http.put("/mukellefler/m_ltd", { ...ltd, vkn: "9358005601" })
    ).rejects.toMatchObject({ status: 409 })
    await expect(http.put("/mukellefler/yok", ltd)).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("POST /api/mukellefler/toplu-atama", () => {
  it("seçilenlerin sorumlusunu değiştirir, her biri için aktivite yazar", async () => {
    const r = await http.post<{ guncellenen: number }>(
      "/mukellefler/toplu-atama",
      {
        ids: ["m_sahis", "m_as", "yok"],
        sorumluPersonelId: "p_4",
      }
    )
    expect(r.guncellenen).toBe(2)
    expect(db.mukellef.find("m_sahis")?.sorumluPersonelId).toBe("p_4")
    expect(db.mukellef.find("m_ltd")?.sorumluPersonelId).toBe("p_3")
    expect(
      db.aktivite.where((a) => a.eylem === "MUKELLEF_GUNCELLENDI")
    ).toHaveLength(2)
  })

  it("boş liste veya bilinmeyen personel 400", async () => {
    await expect(
      http.post("/mukellefler/toplu-atama", {
        ids: [],
        sorumluPersonelId: "p_4",
      })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      http.post("/mukellefler/toplu-atama", {
        ids: ["m_ltd"],
        sorumluPersonelId: "x",
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("GET /api/aktivite", () => {
  it("mükellefe göre filtreler, yeniden eskiye sıralar ve aktörü ekler", async () => {
    db.aktivite.insert({
      aktorId: "p_1",
      eylem: "MUKELLEF_GUNCELLENDI",
      mukellefId: "m_ltd",
      zaman: "2026-01-01T00:00:00Z",
    })
    db.aktivite.insert({
      aktorId: "p_2",
      eylem: "MUKELLEF_GUNCELLENDI",
      mukellefId: "m_ltd",
      zaman: "2026-02-01T00:00:00Z",
    })
    db.aktivite.insert({
      aktorId: "p_2",
      eylem: "MUKELLEF_GUNCELLENDI",
      mukellefId: "m_as",
      zaman: "2026-03-01T00:00:00Z",
    })
    const items = await http.get<
      { aktor: { ad: string } | null; zaman: string }[]
    >("/aktivite", { params: { mukellefId: "m_ltd" } })
    expect(items.map((a) => a.zaman)).toEqual([
      "2026-02-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ])
    expect(items[0].aktor?.ad).toBe("Mehmet")
  })
})
