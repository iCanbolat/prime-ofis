import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import type { KamuSorguAdapter } from "@prime/shared/borc/kamu-adapter"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import { kamuTaramasiCalistir } from "@/mocks/handlers/borc"
import { mockDogrulamaKodu } from "@prime/mock-data/kamu/mock-adapter"
import type {
  BorcDetay,
  BorcListResponse,
  BorcOzetResponse,
  BorcuYokturIslemSonucu,
  KamuDogrulamaCozResponse,
  KamuDogrulamaView,
  KamuIslemSonucu,
  LevhaListResponse,
  SgkErisimSatiri,
} from "@prime/shared/types/api"
import type { BorcKalemi } from "@prime/shared/types/domain"

const [, mehmet] = PERSONEL as [(typeof PERSONEL)[0], (typeof PERSONEL)[0]]
const oturum = (p: (typeof PERSONEL)[0] | null) =>
  useAuthStore.setState({ user: p })
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

/** Kimliğe göre sonuç veren sahte adaptör; `dogrulama` listesindeki kodlar doğrulamaya takılır */
function sahteAdapter(
  borclar: Record<string, BorcKalemi[]>,
  dogrulama: string[] = []
): KamuSorguAdapter & { girisSayisi: number } {
  const kod = (oturumId: string) => oturumId.split(":")[1]!
  const adapter = {
    girisSayisi: 0,
    async giris(k: Parameters<KamuSorguAdapter["giris"]>[0]) {
      adapter.girisSayisi++
      const id = k.kurum === "GIB" ? k.kullaniciKodu : k.kullaniciAdi
      const sifre = k.kurum === "GIB" ? k.sifre : k.sistemSifre
      if (sifre === "hatali")
        return { durum: "HATA" as const, hataMesaji: "Şifre hatalı" }
      if (dogrulama.includes(id))
        return {
          durum: "DOGRULAMA" as const,
          oturumId: `dg-${id}`,
          gorselDataUrl: "data:image/svg+xml,x",
        }
      return {
        durum: "TAMAM" as const,
        oturum: { kurum: k.kurum, oturumId: `${k.kurum}:${id}` },
      }
    },
    async dogrulamaYenile() {
      return { oturumId: "dg-yeni", gorselDataUrl: "data:image/svg+xml,y" }
    },
    async vergiLevhasi(_o: unknown, yil: number) {
      return {
        yil,
        vergiTuru: "Kurumlar Vergisi",
        onayKodu: "ONAY1",
        pdfDataUrl: "data:application/pdf;base64,JVBERi0=",
      }
    },
    async borclar(o: { oturumId: string }) {
      return borclar[kod(o.oturumId)] ?? []
    },
    async borcuYokturTalep() {
      return { talepNo: "T-1" }
    },
    async borcuYokturSonuc() {
      return { durum: "BEKLIYOR" as const }
    },
  }
  return adapter
}

describe("borç listesi", () => {
  it("GİB'de tüm aktif mükellefler, SGK'da yalnızca SGK işyeri olanlar listelenir", async () => {
    const gib = await http.get<BorcListResponse>("/borc", {
      params: { kurum: "GIB" },
    })
    expect(
      Object.fromEntries(gib.items.map((s) => [s.mukellefId, s.erisimDurumu]))
    ).toEqual({ m_ltd: "AKTIF", m_as: "HATA", m_sahis: "TANIMSIZ" })
    expect(gib.items.every((s) => s.sorgu === null)).toBe(true)

    const sgk = await http.get<BorcListResponse>("/borc", {
      params: { kurum: "SGK" },
    })
    expect(sgk.items.map((s) => s.mukellefId).sort()).toEqual(["m_as", "m_ltd"])
    expect(
      await hataDurumu(http.get("/borc", { params: { kurum: "X" } }))
    ).toBe(400)
  })

  it("anlık sorgu borcu kaydeder; erişimsiz / hatalı / SGK işyeri olmayan 409, oturumsuz 401", async () => {
    const r = await http.post<KamuIslemSonucu>("/borc/m_ltd/GIB/sorgula")
    expect(r.dogrulama).toBeNull()
    const d = await http.get<BorcDetay>("/borc/m_ltd/GIB")
    expect(d.satir.sorgu?.sorguTarihi).toBeDefined()
    expect(d.kalemler.length).toBe(d.satir.sorgu?.kalemSayisi)
    expect(db.aktivite.count((a) => a.eylem === "BORC_SORGULANDI")).toBe(1)

    expect(await hataDurumu(http.post("/borc/m_as/GIB/sorgula"))).toBe(409)
    expect(await hataDurumu(http.post("/borc/m_sahis/GIB/sorgula"))).toBe(409)
    expect(await hataDurumu(http.post("/borc/m_sahis/SGK/sorgula"))).toBe(409)
    oturum(null)
    expect(await hataDurumu(http.post("/borc/m_ltd/GIB/sorgula"))).toBe(401)
  })
})

describe("doğrulama ekranı", () => {
  beforeEach(() => {
    db.tebligatErisim.update("te_ltd", { kullaniciKodu: "dogrulama01" })
  })

  it("giriş doğrulama isterse adımlar bekler, personelin girdiği kodla devam eder", async () => {
    const r = await http.post<KamuIslemSonucu>("/borc/m_ltd/GIB/sorgula")
    expect(r.dogrulama).not.toBeNull()
    expect(r.dogrulama).not.toHaveProperty("oturumId")
    expect(db.borcSorgusu.count()).toBe(0)

    // İkinci istek yeniden giriş denemez, adımı aynı kayda ekler
    const r2 = await http.post<KamuIslemSonucu>("/vergi-levhasi/m_ltd/sorgula")
    expect(r2.dogrulama?.id).toBe(r.dogrulama!.id)
    expect(r2.dogrulama?.bekleyenAdimlar).toEqual(["BORC", "VERGI_LEVHASI"])
    const liste = await http.get<BorcListResponse>("/borc", {
      params: { kurum: "GIB" },
    })
    expect(
      liste.items.find((s) => s.mukellefId === "m_ltd")?.erisimDurumu
    ).toBe("DOGRULAMA")

    const id = r.dogrulama!.id
    const eskiOturum = db.kamuDogrulama.find(id)!.oturumId
    expect(
      await hataDurumu(http.post(`/kamu-dogrulama/${id}`, { kod: "00000" }))
    ).toBe(422)
    const yeniOturum = db.kamuDogrulama.find(id)!.oturumId
    expect(yeniOturum).not.toBe(eskiOturum)

    const cozum = await http.post<KamuDogrulamaCozResponse>(
      `/kamu-dogrulama/${id}`,
      { kod: mockDogrulamaKodu(yeniOturum) }
    )
    expect(cozum.ozet).toHaveLength(2)
    expect(db.kamuDogrulama.count()).toBe(0)
    expect(db.borcSorgusu.find("m_ltd:GIB")).toBeDefined()
    const levha = db.vergiLevhasi.where((l) => l.mukellefId === "m_ltd")[0]!
    expect(levha.yil).toBe(2025)
    expect(db.arsiv.find(levha.arsivDosyaId)?.kategori).toBe("VERGI_LEVHASI")
  })

  it("süresi dolan görselle kod girilemez; yeni görsel istenir", async () => {
    const r = await http.post<KamuIslemSonucu>("/borc/m_ltd/GIB/sorgula")
    const id = r.dogrulama!.id
    db.kamuDogrulama.update(id, {
      sonGecerlilik: new Date(2026, 8, 23, 9, 0).toISOString(),
    })
    const bekleyenler = await http.get<KamuDogrulamaView[]>("/kamu-dogrulama")
    expect(bekleyenler[0]?.suresiDoldu).toBe(true)
    expect(
      await hataDurumu(http.post(`/kamu-dogrulama/${id}`, { kod: "12345" }))
    ).toBe(410)
    const yeni = await http.post<KamuDogrulamaView>(
      `/kamu-dogrulama/${id}/yenile`
    )
    expect(yeni.suresiDoldu).toBe(false)
  })
})

describe("vergi levhası", () => {
  it("levha arşive kaydedilir, eksik listesinden düşer, ikinci sorgu çift kayıt açmaz", async () => {
    const once = await http.get<LevhaListResponse>("/vergi-levhasi", {
      params: { kapsam: "eksik" },
    })
    expect(once.beklenenYil).toBe(2025)
    expect(once.items.map((s) => s.mukellefId)).toContain("m_ltd")

    await http.post("/vergi-levhasi/m_ltd/sorgula")
    await http.post("/vergi-levhasi/m_ltd/sorgula")
    expect(db.vergiLevhasi.count((l) => l.mukellefId === "m_ltd")).toBe(1)
    expect(
      db.arsiv.count(
        (d) => d.mukellefId === "m_ltd" && d.ad === "Vergi levhası 2025.pdf"
      )
    ).toBe(1)
    const sonra = await http.get<LevhaListResponse>("/vergi-levhasi", {
      params: { kapsam: "eksik" },
    })
    expect(sonra.items.map((s) => s.mukellefId)).not.toContain("m_ltd")
  })
})

describe("borcu yoktur yazısı", () => {
  it("talep gönderilir, açıkken ikincisi açılamaz, kontrolde sonuçlanır", async () => {
    const r = await http.post<BorcuYokturIslemSonucu>("/borcu-yoktur", {
      mukellefId: "m_ltd",
      kurum: "GIB",
    })
    expect(r.talep.durum).toBe("TALEP_EDILDI")
    expect(r.talep.talepNo).toMatch(/^GIB-20260923-/)
    expect(
      await hataDurumu(
        http.post("/borcu-yoktur", { mukellefId: "m_ltd", kurum: "GIB" })
      )
    ).toBe(409)
    expect(
      await hataDurumu(
        http.post("/borcu-yoktur", { mukellefId: "m_sahis", kurum: "SGK" })
      )
    ).toBe(409)

    const k = await http.post<BorcuYokturIslemSonucu>(
      `/borcu-yoktur/${r.talep.id}/kontrol`
    )
    expect(["HAZIR", "BORCU_VAR"]).toContain(k.talep.durum)
    if (k.talep.durum === "HAZIR") {
      expect(k.talep.gecerlilikTarihi).toBe("2026-10-23")
      expect(db.arsiv.find(k.talep.arsivDosyaId!)?.kategori).toBe(
        "BORCU_YOKTUR"
      )
    }
    // Sonucu ekranda gören talep eden kendisine bildirim almaz (gece sonuçlanınca alır)
    expect(
      db.aktivite.count((a) => a.eylem === "BORCU_YOKTUR_SONUCLANDI")
    ).toBe(1)
    expect(db.bildirim.count((b) => b.tur === "BORCU_YOKTUR_SONUCLANDI")).toBe(
      0
    )
    expect(
      await hataDurumu(http.post(`/borcu-yoktur/${r.talep.id}/kontrol`))
    ).toBe(409)
  })
})

describe("SGK erişimi", () => {
  it("doğrular, şifreyi saklamaz, sorguda kullanır ve kaldırılır", async () => {
    const govde = {
      kullaniciAdi: "12345678901",
      isyeriKodu: "1",
      sistemSifre: "sistem-gizli-9876",
      isyeriSifre: "isyeri-gizli-5432",
    }
    expect(await hataDurumu(http.put("/sgk-erisim/m_sahis", govde))).toBe(409)
    expect(
      await hataDurumu(
        http.put("/sgk-erisim/m_ltd", { ...govde, isyeriKodu: "x" })
      )
    ).toBe(400)
    expect(
      await hataDurumu(
        http.put("/sgk-erisim/m_ltd", { ...govde, sistemSifre: "hatali1" })
      )
    ).toBe(422)

    const satir = await http.put<SgkErisimSatiri>("/sgk-erisim/m_ltd", govde)
    expect(satir.durum).toBe("AKTIF")
    expect(satir.erisim?.sistemSifreIpucu).toBe("9876")
    expect(satir.erisim?.isyeriSifreIpucu).toBe("5432")
    const depo = JSON.stringify([satir, db.sgkErisim.all()])
    expect(depo).not.toContain("sistem-gizli")
    expect(depo).not.toContain("isyeri-gizli")

    await http.post("/borc/m_ltd/SGK/sorgula")
    expect(db.borcSorgusu.find("m_ltd:SGK")).toBeDefined()
    expect(db.sgkErisim.all()[0]?.sonSorgu).toBeDefined()

    await http.delete("/sgk-erisim/m_ltd")
    expect(db.sgkErisim.count()).toBe(0)
  })
})

describe("gece sorgusu", () => {
  it("borç ve eksik levha sorgulanır, yeni vadesi geçmiş borç bildirilir, hatalı erişim atlanır", async () => {
    const adapter = sahteAdapter({
      "0174520662": [
        {
          tur: "KDV",
          yukumlulukTip: "KDV",
          donem: "2026-07",
          vade: "2026-08-28",
          asil: 1000,
          gecikme: 30,
        },
      ],
    })
    const tarama = await kamuTaramasiCalistir(
      new Date(2026, 8, 23, 3, 0),
      adapter
    )
    // m_ltd GİB (m_as GİB hatalı); SGK erişimi yok
    expect(tarama).toMatchObject({
      sorgulanan: 2,
      hatali: 1,
      dogrulama: 0,
      levha: 1,
    })
    expect(adapter.girisSayisi).toBe(1)
    expect(
      db.bildirim.count(
        (b) => b.tur === "BORC_TESPIT_EDILDI" && b.aliciId === "p_3"
      )
    ).toBe(1)

    // Borç sürüyorsa ikinci gece yeniden bildirilmez; levha güncel olduğu için istenmez
    const ikinci = await kamuTaramasiCalistir(
      new Date(2026, 8, 24, 3, 0),
      adapter
    )
    expect(ikinci.levha).toBe(0)
    expect(db.bildirim.count((b) => b.tur === "BORC_TESPIT_EDILDI")).toBe(1)

    const ozet = await http.get<BorcOzetResponse>("/borc/ozet")
    expect(ozet.gib).toEqual({
      vadesiGecmisMukellef: 1,
      vadesiGecmisToplam: 1030,
      borcluMukellef: 1,
    })
    expect(ozet.sonTarama?.baslangic).toBe(ikinci.baslangic)
    expect(ozet.gibErisimSorunlu).toBe(2)
  })

  it("doğrulamaya takılan mükellef sorumlusuna bildirilir, çözülene kadar yeniden denenmez", async () => {
    const adapter = sahteAdapter({}, ["0174520662"])
    const tarama = await kamuTaramasiCalistir(
      new Date(2026, 8, 23, 3, 0),
      adapter
    )
    expect(tarama.dogrulama).toBe(1)
    expect(db.kamuDogrulama.all()[0]?.bekleyenAdimlar).toEqual([
      "BORC",
      "VERGI_LEVHASI",
    ])
    expect(
      db.bildirim.count(
        (b) => b.tur === "KAMU_DOGRULAMA_BEKLIYOR" && b.aliciId === "p_3"
      )
    ).toBe(1)
    await kamuTaramasiCalistir(new Date(2026, 8, 24, 3, 0), adapter)
    expect(adapter.girisSayisi).toBe(1)
    const ozet = await http.get<BorcOzetResponse>("/borc/ozet")
    expect(ozet.dogrulamaBekleyen).toBe(1)
  })
})
