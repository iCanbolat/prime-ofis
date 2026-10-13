import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  DonemOlusturResponse,
  DonemPlanSatiri,
  GorevDetay,
  GorevOzetResponse,
  GorevTopluResponse,
  GorevView,
  TakvimOlayi,
} from "@prime/shared/types/api"

const [yonetici, mehmet, zeynep] = PERSONEL as [
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
  (typeof PERSONEL)[0],
]
const oturum = (p: (typeof PERSONEL)[0]) => useAuthStore.setState({ user: p })
const liste = (params: Record<string, unknown> = {}) =>
  http.get<GorevView[]>("/gorevler", { params: params as never })
const tasi = (id: string, durum: string) =>
  http.post<GorevView>(`/gorevler/${id}/tasi`, { durum })
const hataDurumu = (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: ApiError) => e.status
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  oturum(mehmet)
})
afterEach(() => vi.useRealTimers())

describe("GET /api/gorevler", () => {
  it("mükellef bilgisi ve gecikme ile döner, son tarihe göre sıralı", async () => {
    const gorevler = await liste()
    expect(gorevler).toHaveLength(6)
    expect(gorevler[0]).toMatchObject({ id: "o_kdv_sahis" })
    expect(gorevler.find((g) => g.id === "o_vergi")).toMatchObject({
      mukellefUnvan: "Ali Veli",
      mukellefTur: "SAHIS",
      gecikti: true,
    })
    // Tamamlanmış görev son tarihi geçse de gecikmiş sayılmaz
    expect(gorevler.find((g) => g.id === "o_kdv_sahis")?.gecikti).toBe(false)
  })

  it("birden çok atanan verilirse herhangi birine atanmışlar döner", async () => {
    const hepsi = await liste()
    const ikisi = await liste({ atanan: ["p_2", "p_3"] })
    expect(ikisi.map((g) => g.id)).toEqual(
      hepsi.filter((g) => ["p_2", "p_3"].includes(g.atananId)).map((g) => g.id)
    )
    expect(ikisi.length).toBeGreaterThan(
      (await liste({ atanan: ["p_2"] })).length
    )
  })

  it("filtre kombinasyonu: atanan + tip + dönem", async () => {
    expect(
      (await liste({ atanan: "p_2", tip: ["KDV"], donem: "2026-08" })).map(
        (g) => g.id
      )
    ).toEqual(["o_kdv_as"])
    expect(
      (await liste({ atanan: "p_3", tip: ["KDV", "MUHTASAR_SGK"] })).map(
        (g) => g.id
      )
    ).toEqual(["o_kdv_ltd", "o_muh_ltd"])
    expect(
      (await liste({ tip: ["DIGER"], mukellefId: "m_ltd" })).map((g) => g.id)
    ).toEqual(["o_banka"])
    expect((await liste({ geciken: true })).map((g) => g.id)).toEqual([
      "o_vergi",
    ])
    expect(
      (await liste({ durum: ["KONTROL", "TAMAM"] })).map((g) => g.id)
    ).toEqual(["o_kdv_sahis", "o_muh_ltd"])
    expect((await liste({ q: "banka" })).map((g) => g.id)).toEqual(["o_banka"])
    expect((await liste({ q: "öztürk" })).map((g) => g.id)).toEqual([
      "o_kdv_as",
    ])
  })

  it("özet: kişi başı açık ve gecikmiş görev sayıları", async () => {
    const ozet = await http.get<GorevOzetResponse>("/gorevler/ozet")
    expect(ozet).toMatchObject({ acik: 5, geciken: 1 })
    expect(ozet.personel).toEqual(
      expect.arrayContaining([
        { personelId: "p_2", acik: 3, geciken: 1 },
        { personelId: "p_3", acik: 2, geciken: 0 },
      ])
    )
    expect(
      await http.get<GorevOzetResponse>("/gorevler/ozet", {
        params: { atanan: "p_3" },
      })
    ).toMatchObject({ acik: 2, geciken: 0 })
  })

  it("detay: bağlı talepler ve takvimdeki beyan durumu", async () => {
    const banka = await http.get<GorevDetay>("/gorevler/o_banka")
    expect(banka.bagliTalepler).toMatchObject([
      { id: "e_aktif", durum: "AKTIF" },
    ])
    expect(banka.beyanDurumu).toBeUndefined()
    const kdv = await http.get<GorevDetay>("/gorevler/o_kdv_ltd")
    expect(kdv.beyanDurumu).toBe("BEKLIYOR")
  })
})

describe("taşıma", () => {
  it("durum güncellenir ve aktiviteye yazılır", async () => {
    oturum(zeynep)
    const g = await tasi("o_kdv_ltd", "KONTROL")
    expect(g.durum).toBe("KONTROL")
    expect(
      db.aktivite.where((a) => a.eylem === "GOREV_DURUMU_DEGISTI")
    ).toMatchObject([
      {
        aktorId: "p_3",
        hedefId: "o_kdv_ltd",
        mukellefId: "m_ltd",
        aciklama: expect.stringContaining("Devam → Kontrol"),
      },
    ])
  })

  it("personel başkasına atanmış görevi Tamam'a taşıyamaz, yönetici taşıyabilir", async () => {
    expect(await hataDurumu(tasi("o_muh_ltd", "TAMAM"))).toBe(403)
    expect(db.gorev.find("o_muh_ltd")?.durum).toBe("KONTROL")
    // Başkasının görevini diğer sütunlara taşıyabilir
    expect((await tasi("o_muh_ltd", "DEVAM")).durum).toBe("DEVAM")

    oturum(yonetici)
    const g = await tasi("o_muh_ltd", "TAMAM")
    expect(g).toMatchObject({
      durum: "TAMAM",
      tamamlanmaTarihi: expect.any(String),
    })
  })

  it("takvim senkronu: Kontrol → Hazırlandı, Tamam → Onaylandı; geri taşıma takvimi düşürmez", async () => {
    oturum(zeynep)
    const beyan = async () =>
      (
        await http.get<TakvimOlayi[]>("/takvim", {
          params: {
            baslangic: "2026-09-01",
            bitis: "2026-09-30",
            mukellefId: "m_ltd",
            tip: ["KDV"],
          },
        })
      )[0]!

    expect(await beyan()).toMatchObject({
      durum: "BEKLIYOR",
      gorevId: "o_kdv_ltd",
      gorevDurum: "DEVAM",
    })
    await tasi("o_kdv_ltd", "KONTROL")
    expect((await beyan()).durum).toBe("HAZIRLANDI")
    await tasi("o_kdv_ltd", "TAMAM")
    expect(await beyan()).toMatchObject({
      durum: "ONAYLANDI",
      gorevDurum: "TAMAM",
    })
    expect(
      db.aktivite
        .where((a) => a.eylem === "BEYAN_DURUMU_GUNCELLENDI")
        .map((a) => a.aciklama)
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Hazırlandı \(görevden\)$/),
        expect.stringMatching(/Onaylandı \(görevden\)$/),
      ])
    )

    await tasi("o_kdv_ltd", "DEVAM")
    expect((await beyan()).durum).toBe("ONAYLANDI")
    expect(db.gorev.find("o_kdv_ltd")?.tamamlanmaTarihi).toBeUndefined()
  })

  it("serbest görev takvime dokunmaz", async () => {
    await tasi("o_banka", "TAMAM")
    expect(db.takvim.all()).toEqual([])
  })

  it("toplu: yetkisiz olanlar reddedilir, diğerleri güncellenir", async () => {
    const sonuc = await http.post<GorevTopluResponse>("/gorevler/toplu", {
      ids: ["o_kdv_as", "o_muh_ltd", "o_vergi"],
      durum: "TAMAM",
    })
    expect(sonuc).toEqual({
      guncellenen: ["o_kdv_as", "o_vergi"],
      reddedilen: ["o_muh_ltd"],
    })
    const atama = await http.post<GorevTopluResponse>("/gorevler/toplu", {
      ids: ["o_kdv_ltd", "o_muh_ltd"],
      atananId: "p_4",
    })
    expect(atama.guncellenen).toHaveLength(2)
    expect(db.gorev.find("o_muh_ltd")?.atananId).toBe("p_4")
    expect(db.aktivite.where((a) => a.eylem === "GOREV_ATANDI")).toHaveLength(2)
  })
})

describe("dönem görevleri", () => {
  it("önizleme mevcut görevi işaretler; iki kez çalıştırma çift kayıt üretmez", async () => {
    const onizleme = await http.post<DonemPlanSatiri[]>(
      "/gorevler/donem/onizleme",
      { tip: "KDV", donem: "2026-08" }
    )
    expect(onizleme.map((s) => [s.mukellefId, s.mevcutGorevId])).toEqual([
      ["m_sahis", undefined],
      ["m_ltd", "o_kdv_ltd"],
      ["m_as", "o_kdv_as"],
    ])

    const hepsi = {
      tip: "KDV",
      donem: "2026-08",
      mukellefIdler: ["m_sahis", "m_ltd", "m_as"],
    }
    expect(
      await http.post<DonemOlusturResponse>("/gorevler/donem", hepsi)
    ).toEqual({
      olusturulan: 1,
      atlanan: 2,
    })
    expect(
      await http.post<DonemOlusturResponse>("/gorevler/donem", hepsi)
    ).toEqual({
      olusturulan: 0,
      atlanan: 3,
    })
    const kdv = db.gorev.where(
      (g) => g.otomatikAnahtar === "m_sahis:KDV:2026-08"
    )
    expect(kdv).toHaveLength(1)
    expect(kdv[0]).toMatchObject({
      baslik: "KDV beyannamesi — Ağustos 2026",
      atananId: "p_2",
      sonTarih: "2026-09-28",
      durum: "YAPILACAK",
      olusturanId: "p_2",
    })
    expect(kdv[0]!.checklist.map((m) => m.metin)).toEqual([
      "Faturalar alındı",
      "Beyanname hazırlandı",
      "Müşteri onayı",
      "Tahakkuk gönderildi",
    ])
    expect(
      db.aktivite.where((a) => a.eylem === "DONEM_GOREVLERI_OLUSTURULDU")
    ).toHaveLength(1)
  })

  it("yalnızca seçili mükellefler için oluşturur", async () => {
    const sonuc = await http.post<DonemOlusturResponse>("/gorevler/donem", {
      tip: "MUHTASAR_SGK",
      donem: "2026-07",
      mukellefIdler: ["m_as"],
    })
    expect(sonuc).toEqual({ olusturulan: 1, atlanan: 0 })
    expect(
      db.gorev.where(
        (g) => g.otomatikAnahtar?.endsWith("MUHTASAR_SGK:2026-07") ?? false
      )
    ).toMatchObject([{ mukellefId: "m_as" }])
  })

  it("aynı dönem için elle ikinci beyan görevi açılamaz (409)", async () => {
    expect(
      await hataDurumu(
        http.post("/gorevler", {
          baslik: "KDV",
          mukellefId: "m_ltd",
          tip: "KDV",
          donem: "2026-08",
          atananId: "p_3",
          oncelik: "NORMAL",
          sonTarih: "2026-09-28",
          checklist: [],
        })
      )
    ).toBe(409)
  })
})

describe("güncelleme, yorum, silme", () => {
  it("kontrol listesi maddesi işaretlenince tamamlayan kaydedilir", async () => {
    const g = db.gorev.find("o_kdv_as")!
    const detay = await http.patch<GorevDetay>("/gorevler/o_kdv_as", {
      checklist: g.checklist.map((m, i) =>
        i === 0 ? { ...m, tamam: true } : m
      ),
    })
    expect(detay.checklist[0]).toMatchObject({
      tamam: true,
      tamamlayanId: "p_2",
      tamamlanmaTarihi: expect.any(String),
    })
    expect(
      db.aktivite.where((a) => a.eylem === "GOREV_GUNCELLENDI")[0]?.aciklama
    ).toContain("“Faturalar alındı” tamamlandı")
  })

  it("yalnızca aynı mükellefin talepleri bağlanabilir", async () => {
    expect(
      await hataDurumu(
        http.patch("/gorevler/o_banka", { bagliTalepIdler: ["e_iptal"] })
      )
    ).toBe(400)
  })

  it("yorumdaki @bahsetmeler çözülür", async () => {
    const detay = await http.post<GorevDetay>("/gorevler/o_banka/yorum", {
      metin: "@Zeynep Demir ekstreleri kontrol eder misin?",
    })
    expect(detay.yorumlar).toMatchObject([
      { yazarId: "p_2", bahsedilenler: ["p_3"] },
    ])
  })

  it("görevi yalnızca oluşturan veya yönetici silebilir", async () => {
    // o_banka'yı p_3 oluşturdu
    expect(await hataDurumu(http.delete("/gorevler/o_banka"))).toBe(403)
    expect(await hataDurumu(http.delete("/gorevler/o_vergi"))).toBe(0)
    oturum(yonetici)
    expect(await hataDurumu(http.delete("/gorevler/o_banka"))).toBe(0)
    expect(db.gorev.count()).toBe(4)
  })
})
