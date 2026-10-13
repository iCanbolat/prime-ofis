import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { http } from "@/lib/http"
import { db, resetDb } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { createSeed } from "@prime/mock-data/seed"
import type { TakvimOlayi, TakvimOzetResponse } from "@prime/shared/types/api"

const liste = (params: Record<string, unknown>) =>
  http.get<TakvimOlayi[]>("/takvim", { params: params as never })

const eylul = { baslangic: "2026-09-01", bitis: "2026-09-30" }

beforeEach(() => {
  // Yalnızca Date sahtelenir; zamanlayıcılar ve user-event etkilenmez
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: PERSONEL[1] })
})
afterEach(() => vi.useRealTimers())

describe("GET /api/takvim", () => {
  it("aralıktaki yükümlülükleri mükellef bilgisiyle döner", async () => {
    const olaylar = await liste(eylul)
    // Şahıs (işletme, SGK'sız): yalnızca KDV; Ltd ve A.Ş.: KDV, MUHSGK, Ba-Bs, e-Defter
    expect(
      olaylar.filter((o) => o.mukellefId === "m_sahis").map((o) => o.tip)
    ).toEqual(["KDV"])
    expect(
      olaylar.filter((o) => o.mukellefId === "m_ltd").map((o) => o.tip)
    ).toEqual(["KDV", "MUHTASAR_SGK", "BA_BS", "E_DEFTER_BERAT"])
    const kdv = olaylar.find((o) => o.id === "m_ltd:KDV:2026-08")!
    expect(kdv).toMatchObject({
      mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      sorumluPersonelId: "p_3",
      sonTarih: "2026-09-28",
      durum: "BEKLIYOR",
      gecikti: false,
    })
  })

  it("son günü geçmiş ve onaylanmamış olay gecikmiş sayılır", async () => {
    const agustos = await liste({
      baslangic: "2026-08-01",
      bitis: "2026-08-31",
    })
    const kdv = agustos.find((o) => o.id === "m_ltd:KDV:2026-07")!
    expect(kdv).toMatchObject({ sonTarih: "2026-08-28", gecikti: true })
  })

  it("tip, tür, sorumlu, mükellef ve durum filtreleri", async () => {
    expect(
      (await liste({ ...eylul, tip: ["KDV"] })).every((o) => o.tip === "KDV")
    ).toBe(true)
    expect(
      (await liste({ ...eylul, tur: ["AS"] })).every(
        (o) => o.mukellefId === "m_as"
      )
    ).toBe(true)
    expect(
      (await liste({ ...eylul, sorumlu: "p_3" })).every(
        (o) => o.mukellefId === "m_ltd"
      )
    ).toBe(true)
    expect(
      (await liste({ ...eylul, mukellefId: "m_as" })).every(
        (o) => o.mukellefId === "m_as"
      )
    ).toBe(true)

    const gecikenler = await liste({
      baslangic: "2026-06-01",
      bitis: "2026-09-30",
      durum: "gecikti",
    })
    expect(gecikenler.length).toBeGreaterThan(0)
    expect(
      gecikenler.every((o) => o.gecikti && o.sonTarih < "2026-09-23")
    ).toBe(true)
  })

  it("pasif mükellef takvimde görünmez", async () => {
    db.mukellef.update("m_as", { aktif: false })
    expect((await liste(eylul)).some((o) => o.mukellefId === "m_as")).toBe(
      false
    )
  })

  it("geçersiz veya çok uzun aralık 400", async () => {
    await expect(
      liste({ baslangic: "2026-09-30", bitis: "2026-09-01" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      liste({ baslangic: "2025-01-01", bitis: "2026-12-31" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      liste({ baslangic: "abc", bitis: "2026-09-01" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("PATCH /api/takvim/:id", () => {
  const id = encodeURIComponent("m_ltd:KDV:2026-07")

  it("durumu kaydeder, gecikmeyi kaldırır ve aktivite yazar", async () => {
    await http.patch(`/takvim/${id}`, { durum: "ONAYLANDI" })
    expect(db.takvim.find("m_ltd:KDV:2026-07")).toMatchObject({
      durum: "ONAYLANDI",
      guncelleyenId: "p_2",
    })

    const kdv = (
      await liste({ baslangic: "2026-08-01", bitis: "2026-08-31" })
    ).find((o) => o.id === "m_ltd:KDV:2026-07")!
    expect(kdv).toMatchObject({ durum: "ONAYLANDI", gecikti: false })

    const log = db.aktivite.where(
      (a) => a.eylem === "BEYAN_DURUMU_GUNCELLENDI"
    )[0]
    expect(log).toMatchObject({
      mukellefId: "m_ltd",
      aciklama: "KDV Temmuz 2026: Onaylandı",
    })
  })

  it("Bekliyor'a çekmek kaydı siler", async () => {
    await http.patch(`/takvim/${id}`, { durum: "HAZIRLANDI" })
    await http.patch(`/takvim/${id}`, { durum: "BEKLIYOR" })
    expect(db.takvim.find("m_ltd:KDV:2026-07")).toBeUndefined()
  })

  it("mükellefe uygulanmayan yükümlülük 404, geçersiz durum 400, oturumsuz 401", async () => {
    await expect(
      http.patch(`/takvim/${encodeURIComponent("m_sahis:KURUMLAR:2025")}`, {
        durum: "ONAYLANDI",
      })
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      http.patch(`/takvim/${id}`, { durum: "BITTI" })
    ).rejects.toMatchObject({ status: 400 })
    useAuthStore.setState({ user: null })
    await expect(
      http.patch(`/takvim/${id}`, { durum: "ONAYLANDI" })
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe("GET /api/takvim/ozet", () => {
  it("bu hafta, gecikenler, onay bekleyenler ve personel dağılımı", async () => {
    await http.patch(`/takvim/${encodeURIComponent("m_as:KDV:2026-08")}`, {
      durum: "HAZIRLANDI",
    })
    const ozet = await http.get<TakvimOzetResponse>("/takvim/ozet")

    expect(ozet.bugun).toBe("2026-09-23")
    // 23–30 Eylül: Şahıs KDV; Ltd ve A.Ş. için KDV, MUHSGK (28), Ba-Bs, e-Defter (30)
    expect(ozet.buHafta.map((o) => o.id).sort()).toEqual(
      [
        "m_sahis:KDV:2026-08",
        "m_as:BA_BS:2026-08",
        "m_as:E_DEFTER_BERAT:2026-06",
        "m_as:KDV:2026-08",
        "m_as:MUHTASAR_SGK:2026-08",
        "m_ltd:BA_BS:2026-08",
        "m_ltd:E_DEFTER_BERAT:2026-06",
        "m_ltd:KDV:2026-08",
        "m_ltd:MUHTASAR_SGK:2026-08",
      ].sort()
    )
    expect(ozet.geciken.every((o) => o.gecikti)).toBe(true)
    expect(ozet.onayBekleyen).toBe(1)
    const p3 = ozet.personel.find((p) => p.personelId === "p_3")!
    expect(p3.acik).toBeGreaterThan(0)
  })

  it("sorumlu filtresiyle yalnızca o personelin mükellefleri", async () => {
    const ozet = await http.get<TakvimOzetResponse>("/takvim/ozet", {
      params: { sorumlu: "p_3" },
    })
    expect(
      [...ozet.buHafta, ...ozet.geciken].every(
        (o) => o.sorumluPersonelId === "p_3"
      )
    ).toBe(true)
  })
})

describe("seed durumları", () => {
  it("deterministik; geçmiş dönemlerin çoğu onaylı, bir kısmı gecikmiş", async () => {
    expect(createSeed().takvim).toEqual(createSeed().takvim)
    resetDb()
    const yaz = await liste({ baslangic: "2026-06-01", bitis: "2026-08-31" })
    const onayli = yaz.filter((o) => o.durum === "ONAYLANDI").length
    expect(onayli / yaz.length).toBeGreaterThan(0.8)
    expect(yaz.some((o) => o.gecikti)).toBe(true)
  })
})
