import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  CariEkstreResponse,
  CariListResponse,
  KesintiRaporResponse,
  TahsilatOzetResponse,
} from "@prime/shared/types/api"
import type { CariHareket, Mukellef } from "@prime/shared/types/domain"

const [yonetici, mehmet] = PERSONEL as [
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
]
const oturum = (p: (typeof PERSONEL)[0]) => useAuthStore.setState({ user: p })
const hataDurumu = (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: ApiError) => e.status
  )
const ekstre = (id: string) =>
  http.get<CariEkstreResponse>(`/tahsilat/cari/${id}`)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

describe("aylık ücret borçları", () => {
  it("eksik aylar istek anında bir kez üretilir (idempotent)", async () => {
    const e = await ekstre("m_ltd")
    const ucretler = e.hareketler.filter((h) => h.kalem === "AYLIK_UCRET")
    expect(ucretler.map((h) => h.donem)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ])
    expect(ucretler[2]).toMatchObject({
      tarih: "2026-09-01",
      brut: 10_000,
      stopaj: 2_000,
      tutar: 10_000,
      olusturanAd: "Otomatik",
    })
    await ekstre("m_ltd")
    expect(
      db.cari.count((h) =>
        Boolean(h.otomatikAnahtar?.startsWith("UCRET:m_ltd:"))
      )
    ).toBe(3)
    expect(e.durum).toMatchObject({
      bakiye: 20_000,
      acikBorc: 20_000,
      geciken: true,
    })
  })

  it("avans yeni borca otomatik uygulanır", async () => {
    await http.post("/tahsilat/hareketler", {
      tip: "ODEME",
      mukellefId: "m_ltd",
      kalem: "ODEME",
      tarih: "2026-09-10",
      tutar: 25_000,
    })
    let e = await ekstre("m_ltd")
    expect(e.avans).toBe(5_000)
    expect(e.durum.bakiye).toBe(-5_000)

    // Ekim gelince 5.000 avans Ekim borcunu kısmen kapatır
    vi.setSystemTime(new Date(2026, 9, 2, 10, 0))
    e = await ekstre("m_ltd")
    expect(e.avans).toBe(0)
    expect(e.acikBorclar).toEqual([
      expect.objectContaining({ donem: "2026-10", kalan: 5_000 }),
    ])
  })

  it("ücret değişikliği yalnızca yönetici; geçmiş borçlar değişmez", async () => {
    const ucret = {
      aylikBrut: 12_000,
      kdvOrani: 20,
      stopajVar: true,
      baslangicDonem: "2026-06",
    }
    expect(
      await hataDurumu(http.put("/mukellefler/m_ltd/ucret", { ucret }))
    ).toBe(403)
    oturum(yonetici)
    const m = await http.put<Mukellef>("/mukellefler/m_ltd/ucret", { ucret })
    expect(m.ucret?.aylikBrut).toBe(12_000)
    const e = await ekstre("m_ltd")
    const byDonem = Object.fromEntries(
      e.hareketler.filter((h) => h.donem).map((h) => [h.donem, h.brut])
    )
    // Haziran yeni başlangıçla üretildi; Temmuz–Eylül eski tutarında kaldı
    expect(byDonem).toEqual({
      "2026-06": 12_000,
      "2026-07": 10_000,
      "2026-08": 10_000,
      "2026-09": 10_000,
    })
  })

  it("mükellef formu ücreti değiştiremez", async () => {
    const m = db.mukellef.find("m_ltd")!
    const { id: _, olusturmaTarihi: __, ...govde } = m
    const guncel = await http.put<Mukellef>("/mukellefler/m_ltd", {
      ...govde,
      ucret: { ...m.ucret!, aylikBrut: 1 },
    })
    expect(guncel.ucret?.aylikBrut).toBe(10_000)
  })
})

describe("POST /api/tahsilat/hareketler", () => {
  it("ödeme FIFO ile en eski borcu kapatır; elle kapatma doğrulanır", async () => {
    await ekstre("m_ltd")
    const o = await http.post<CariHareket>("/tahsilat/hareketler", {
      tip: "ODEME",
      mukellefId: "m_ltd",
      kalem: "ODEME",
      tarih: "2026-09-20",
      tutar: 12_000,
    })
    expect(o.kapatmalar).toEqual([
      { borcId: "ch_2", tutar: 10_000 },
      { borcId: expect.any(String), tutar: 2_000 },
    ])
    expect(
      await hataDurumu(
        http.post("/tahsilat/hareketler", {
          tip: "ODEME",
          mukellefId: "m_ltd",
          kalem: "ODEME",
          tarih: "2026-09-20",
          tutar: 100,
          kapatmalar: [{ borcId: "ch_1", tutar: 100 }],
        })
      )
    ).toBe(400)
  })

  it("ek hizmet borcu KDV ve stopajla; gelecek tarih ve boş açıklama reddedilir", async () => {
    const b = await http.post<CariHareket>("/tahsilat/hareketler", {
      tip: "BORC",
      mukellefId: "m_sahis",
      tarih: "2026-09-20",
      brut: 2_000,
      kdvOrani: 20,
      stopajVar: false,
      aciklama: "Yıllık gelir vergisi beyannamesi",
    })
    expect(b).toMatchObject({
      kalem: "EK_HIZMET",
      kdv: 400,
      stopaj: 0,
      tutar: 2_400,
    })
    const temel = {
      tip: "BORC",
      mukellefId: "m_sahis",
      brut: 1,
      kdvOrani: 20,
      stopajVar: true,
    }
    expect(
      await hataDurumu(
        http.post("/tahsilat/hareketler", {
          ...temel,
          tarih: "2026-09-30",
          aciklama: "x",
        })
      )
    ).toBe(400)
    expect(
      await hataDurumu(
        http.post("/tahsilat/hareketler", {
          ...temel,
          tarih: "2026-09-20",
          aciklama: " ",
        })
      )
    ).toBe(400)
  })

  it("silme yalnızca yönetici; otomatik ücret silinemez; silinen borcun ödemesi avansa döner", async () => {
    expect(await hataDurumu(http.delete("/tahsilat/hareketler/ch_4"))).toBe(403)
    oturum(yonetici)
    expect(await hataDurumu(http.delete("/tahsilat/hareketler/ch_1"))).toBe(409)
    await http.post("/tahsilat/hareketler", {
      tip: "ODEME",
      mukellefId: "m_as",
      kalem: "ODEME",
      tarih: "2026-09-20",
      tutar: 5_000,
    })
    await http.delete("/tahsilat/hareketler/ch_4")
    const e = await ekstre("m_as")
    expect(e.avans).toBe(5_000)
    expect(e.durum.bakiye).toBe(-5_000)
  })
})

describe("liste ve özet", () => {
  it("geciken ve bakiyeli filtreleri, gecikmeye göre sıralama", async () => {
    const l = await http.get<CariListResponse>("/tahsilat/cari", {
      params: { geciken: true },
    })
    expect(l.items.map((s) => s.mukellefId)).toEqual(["m_as", "m_ltd"])
    expect(l.toplamBakiye).toBe(25_000)
    const tumu = await http.get<CariListResponse>("/tahsilat/cari")
    expect(tumu.total).toBe(3)
    const bakiyeli = await http.get<CariListResponse>("/tahsilat/cari", {
      params: { bakiyeli: true, q: "çınar" },
    })
    expect(bakiyeli.items.map((s) => s.mukellefId)).toEqual(["m_ltd"])
  })

  it("özet: alacak, bu ay tahakkuk, yaşlandırma", async () => {
    const o = await http.get<TahsilatOzetResponse>("/tahsilat/ozet")
    expect(o).toMatchObject({
      toplamAlacak: 25_000,
      buAyTahakkuk: 10_000,
      buAyTahsilat: 0,
      gecikenMukellef: 2,
      ucretliMukellef: 1,
      yaslandirma: {
        "0-30": 10_000,
        "31-60": 10_000,
        "61-90": 0,
        "90+": 5_000,
      },
    })
    expect(o.aylik).toHaveLength(12)
  })
})

describe("kesinti kontrolü", () => {
  it("içe aktarım yıl başına tek kayıt; rapor durumları", async () => {
    const kayit = (donem: string, kesinti: number, vkn = "0174520662") => ({
      vkn,
      unvan: "",
      donem,
      matrah: kesinti * 5,
      kesinti,
    })
    await http.post("/tahsilat/kesinti/ice-aktar", {
      yil: 2026,
      dosyaAdi: "ilk.xlsx",
      kayitlar: [kayit("2026-07", 1)],
    })
    await http.post("/tahsilat/kesinti/ice-aktar", {
      yil: 2026,
      dosyaAdi: "kesinti.xlsx",
      kayitlar: [kayit("2026-07", 2_000), kayit("2026-08", 500, "9358005601")],
    })
    expect(db.kesintiAktarim.count()).toBe(1)
    const r = await http.get<KesintiRaporResponse>("/tahsilat/kesinti", {
      params: { yil: 2026 },
    })
    expect(r.iceAktarim?.dosyaAdi).toBe("kesinti.xlsx")
    expect(r.satirlar.map((s) => [s.mukellefId, s.donem, s.durum])).toEqual([
      ["m_ltd", "2026-07", "ESLESTI"],
      ["m_as", "2026-08", "KAYITSIZ"],
    ])
    expect(r.ozet).toMatchObject({ ESLESTI: 1, KAYITSIZ: 1 })
  })

  it("başka yıla ait satır reddedilir", async () => {
    expect(
      await hataDurumu(
        http.post("/tahsilat/kesinti/ice-aktar", {
          yil: 2026,
          dosyaAdi: "x",
          kayitlar: [
            {
              vkn: "0174520662",
              unvan: "",
              donem: "2025-12",
              matrah: 0,
              kesinti: 5,
            },
          ],
        })
      )
    ).toBe(400)
  })
})

describe("PATCH /api/buro", () => {
  it("IBAN yalnızca yönetici, TR biçimi doğrulanır", async () => {
    expect(await hataDurumu(http.patch("/buro", { iban: "TR" }))).toBe(403)
    oturum(yonetici)
    expect(await hataDurumu(http.patch("/buro", { iban: "DE12" }))).toBe(400)
    const b = await http.patch<{ iban?: string }>("/buro", {
      iban: "tr33 0006 1005 1978 6457 8413 26",
    })
    expect(b.iban).toBe("TR330006100519786457841326")
  })
})
