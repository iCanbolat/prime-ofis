import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type { AktiviteKaydi } from "@prime/shared/types/api"

const personel = PERSONEL[1]!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: personel })
})
afterEach(() => vi.useRealTimers())

const erisimKayitlari = (hedefId: string) =>
  db.aktivite.where(
    (a) =>
      a.hedefId === hedefId &&
      (a.eylem === "DOSYA_GORUNTULENDI" || a.eylem === "DOSYA_INDIRILDI")
  )

const KAYNAKLAR = [
  {
    ad: "arşiv",
    id: "d_ltd_levha",
    yol: (id: string) => `/arsiv/${id}/icerik`,
    hedefTip: "ARSIV",
  },
  {
    ad: "gelen evrak",
    id: "g_bekleyen",
    yol: (id: string) => `/gelen-evrak/${id}/icerik`,
    hedefTip: "EVRAK",
  },
  {
    ad: "e-Belge faturası",
    id: "f_giden",
    yol: (id: string) => `/e-belge/faturalar/${id}/icerik`,
    hedefTip: "EBELGE",
  },
] as const

describe.each(KAYNAKLAR)("dosya erişim kaydı: $ad", (k) => {
  it("varsayılan okuma görüntüleme, islem=indir indirme olarak kaydedilir; bildirim üretmez", async () => {
    const bildirimOnce = db.bildirim.all().length
    await http.get(k.yol(k.id))
    await http.get(k.yol(k.id), { params: { islem: "indir" } })

    const kayitlar = erisimKayitlari(k.id)
    expect(kayitlar.map((a) => a.eylem)).toEqual([
      "DOSYA_GORUNTULENDI",
      "DOSYA_INDIRILDI",
    ])
    expect(kayitlar[0]).toMatchObject({
      aktorId: personel.id,
      hedefTip: k.hedefTip,
      hedefId: k.id,
    })
    expect(kayitlar[0]!.aciklama).toBeTruthy()
    expect(kayitlar[0]!.mukellefId).toBeTruthy()
    expect(db.bildirim.all().length).toBe(bildirimOnce)
  })

  it("oturum yoksa 401 döner ve kayıt yazılmaz", async () => {
    useAuthStore.setState({ user: null })
    await expect(http.get(k.yol(k.id))).rejects.toBeInstanceOf(ApiError)
    expect(erisimKayitlari(k.id)).toHaveLength(0)
  })
})

describe("GET /api/aktivite eylem filtresi", () => {
  it("yalnızca istenen eylemleri ve hedefi döner", async () => {
    await http.get("/arsiv/d_ltd_levha/icerik")
    await http.get("/arsiv/d_ltd_levha/icerik", { params: { islem: "indir" } })

    const yalnizIndirme = await http.get<AktiviteKaydi[]>("/aktivite", {
      params: { hedefId: "d_ltd_levha", eylem: "DOSYA_INDIRILDI" },
    })
    expect(yalnizIndirme.map((a) => a.eylem)).toEqual(["DOSYA_INDIRILDI"])
    expect(yalnizIndirme[0]!.aktor?.id).toBe(personel.id)

    const ikisi = await http.get<AktiviteKaydi[]>("/aktivite", {
      params: {
        hedefId: "d_ltd_levha",
        eylem: "DOSYA_GORUNTULENDI,DOSYA_INDIRILDI",
      },
    })
    expect(ikisi).toHaveLength(2)
  })
})
