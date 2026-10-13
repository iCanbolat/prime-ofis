import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { logActivity } from "@/mocks/handlers/common"
import type { BildirimListResponse, GorevView } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

const [yonetici, mehmet, zeynep] = PERSONEL as [Personel, Personel, Personel]
const oturum = (p: Personel) => useAuthStore.setState({ user: p })
const bildirimler = (params: Record<string, unknown> = {}) =>
  http.get<BildirimListResponse>("/bildirim", { params: params as never })
/** Hatırlatmalar hariç (eylem bildirimleri) */
const eylemBildirimleri = async (p: Personel) => {
  oturum(p)
  return (await bildirimler()).items.filter((b) => !b.anahtar)
}

const yeniGorev = (atananId: string) =>
  http.post<GorevView>("/gorevler", {
    baslik: "Kira sözleşmesini iste",
    mukellefId: "m_ltd",
    tip: "DIGER",
    atananId,
    oncelik: "NORMAL",
    sonTarih: "2026-09-30",
    checklist: [],
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

describe("bildirim alıcı kuralları", () => {
  it("görev atanana gider; aktör kendi eylemi için bildirim almaz", async () => {
    const g = await yeniGorev(zeynep.id)

    const zeynepin = await eylemBildirimleri(zeynep)
    expect(zeynepin).toHaveLength(1)
    expect(zeynepin[0]).toMatchObject({
      tur: "GOREV_OLUSTURULDU",
      aliciId: zeynep.id,
      link: `/gorevler?gorev=${g.id}`,
      okundu: false,
      aktor: { id: mehmet.id },
    })
    expect(await eylemBildirimleri(mehmet)).toHaveLength(0)
  })

  it("kişi kendine görev atarsa bildirim üretilmez", async () => {
    await yeniGorev(mehmet.id)
    expect(db.bildirim.count()).toBe(0)
  })

  it("atananı olmayan olay tüm kullanıcılara yayınlanır (aktör hariç)", async () => {
    oturum(yonetici)
    logActivity({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI" })

    expect(await eylemBildirimleri(yonetici)).toHaveLength(0)
    for (const p of [mehmet, zeynep]) {
      const [b] = await eylemBildirimleri(p)
      expect(b).toMatchObject({ tur: "SABLON_GUNCELLENDI", aliciId: null })
    }
  })

  it("mükellefe bağlı olay mükellefin sorumlusuna gider", async () => {
    logActivity({
      aktorId: yonetici.id,
      eylem: "ARSIV_YUKLENDI",
      hedefTip: "ARSIV",
      mukellefId: "m_ltd", // sorumlu: Zeynep
    })
    expect(await eylemBildirimleri(zeynep)).toHaveLength(1)
    expect(await eylemBildirimleri(mehmet)).toHaveLength(0)
  })

  it("kural dışı eylemler bildirim üretmez", async () => {
    logActivity({ aktorId: mehmet.id, eylem: "GIRIS" })
    logActivity({
      aktorId: mehmet.id,
      eylem: "SIFRE_GORUNTULENDI",
      mukellefId: "m_ltd",
    })
    expect(db.bildirim.count()).toBe(0)
  })

  it("yorumda anılan kişiye anma bildirimi, atanana yorum bildirimi gider", async () => {
    oturum(yonetici)
    const g = await yeniGorev(zeynep.id)
    db.bildirim.all().forEach((b) => db.bildirim.remove(b.id))

    await http.post(`/gorevler/${g.id}/yorum`, {
      metin: "@Mehmet vergi levhasını da ekler misin?",
    })

    const [anma] = await eylemBildirimleri(mehmet)
    expect(anma).toMatchObject({ tur: "GOREV_ANILDI" })
    expect(anma!.baslik).toContain("Ayşe")
    expect((await eylemBildirimleri(zeynep)).map((b) => b.tur)).toEqual([
      "GOREV_YORUMLANDI",
    ])
  })
})

describe("okundu durumu", () => {
  it("yayında okundu kişi başınadır", async () => {
    logActivity({ aktorId: yonetici.id, eylem: "SABLON_GUNCELLENDI" })
    const [b] = await eylemBildirimleri(mehmet)
    await http.post(`/bildirim/${b!.id}/okundu`)

    expect((await eylemBildirimleri(mehmet))[0]?.okundu).toBe(true)
    expect((await eylemBildirimleri(zeynep))[0]?.okundu).toBe(false)
  })

  it("tümünü okundu yapar; okunmamış sayısı ve filtre buna uyar", async () => {
    oturum(mehmet)
    expect((await bildirimler()).okunmamis).toBeGreaterThan(0)
    await http.post("/bildirim/okundu")
    const sonuc = await bildirimler({ sadeceOkunmamis: true })
    expect(sonuc).toMatchObject({ items: [], okunmamis: 0 })
  })

  it("başkasının bildirimi okundu yapılamaz", async () => {
    await yeniGorev(zeynep.id)
    const [b] = db.bildirim.all()
    oturum(yonetici)
    await expect(http.post(`/bildirim/${b!.id}/okundu`)).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("hatırlatmalar", () => {
  it("geciken görev atanana bir kez hatırlatılır", async () => {
    await bildirimler()
    await bildirimler()
    const gecikti = (await bildirimler()).items.filter(
      (b) => b.tur === "GOREV_GECIKTI"
    )
    expect(gecikti.map((b) => b.hedefId)).toContain("o_vergi")
    expect(new Set(gecikti.map((b) => b.hedefId)).size).toBe(gecikti.length)
    expect(gecikti.every((b) => b.aliciId === mehmet.id)).toBe(true)
  })
})
