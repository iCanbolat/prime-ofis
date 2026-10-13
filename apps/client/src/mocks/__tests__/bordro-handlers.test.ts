import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { ApiError, http } from "@/lib/http"
import { db } from "@/mocks/db"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type {
  BildirimListResponse,
  BordroDetay,
  BordroListResponse,
  BordroOkuResponse,
  BordroOzetResponse,
  BordroSatiri,
  GelenEvrakView,
  IsHareketiView,
  PortalResponse,
  TalepView,
} from "@prime/shared/types/api"

const [, mehmet] = PERSONEL
const liste = (params: Record<string, unknown> = {}) =>
  http.get<BordroListResponse>("/bordro", { params: params as never })
const hataDurumu = (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e: unknown) => (e instanceof ApiError ? e.status : 0)
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  useAuthStore.setState({ user: mehmet })
})
afterEach(() => vi.useRealTimers())

describe("GET /api/bordro", () => {
  it("varsayılan dönem geçen aydır; yalnızca bordrosu olan mükellefler listelenir", async () => {
    const r = await liste()
    expect(r.donem).toBe("2026-08")
    // m_sahis: çalışanı ve SGK işyeri yok
    expect(r.items.map((s) => s.mukellefId).sort()).toEqual(["m_as", "m_ltd"])
    expect(r.sayilar).toMatchObject({ BEKLENIYOR: 2, HAZIRLANDI: 0 })

    const ltd = r.items.find((s) => s.mukellefId === "m_ltd")!
    expect(ltd).toMatchObject({
      durum: "BEKLENIYOR",
      sonTarih: "2026-09-28",
      kalanIsGunu: 3,
      uyari: "YAKLASIYOR",
      calisanSayisi: 8,
    })
  })

  it("eski dönemde son gün geçtiyse gecikti; filtreler çalışır", async () => {
    const temmuz = await liste({ donem: "2026-07" })
    expect(temmuz.items.every((s) => s.uyari === "GECIKTI")).toBe(true)
    expect(
      (await liste({ uyari: "GECIKTI" })).items,
      "ağustos henüz gecikmedi"
    ).toHaveLength(0)
    expect(
      (await liste({ sorumlu: "p_3" })).items.map((s) => s.mukellefId)
    ).toEqual(["m_ltd"])
    expect((await liste({ q: "çınar" })).items).toHaveLength(1)
  })

  it("sayfalar; toplam, durum sayıları ve uyarı sayıları filtreden bağımsızdır", async () => {
    const ilk = await liste({ sayfaBoyutu: 1 })
    expect(ilk).toMatchObject({ total: 2, sayfa: 1, sayfaBoyutu: 1 })
    expect(ilk.items).toHaveLength(1)
    expect(ilk.uyarilar).toEqual({ GECIKTI: 0, YAKLASIYOR: 2 })

    const ikinci = await liste({ sayfaBoyutu: 1, sayfa: 2 })
    expect(ikinci.items[0]!.mukellefId).not.toBe(ilk.items[0]!.mukellefId)
    // Son sayfadan sonrası istenirse son sayfa döner
    expect((await liste({ sayfaBoyutu: 1, sayfa: 9 })).sayfa).toBe(2)

    const filtreli = await liste({ durum: "HAZIRLANDI" })
    expect(filtreli).toMatchObject({ total: 0, items: [] })
    expect(filtreli.sayilar.BEKLENIYOR).toBe(2)
    expect(filtreli.uyarilar.YAKLASIYOR).toBe(2)
  })

  it("geçersiz veya gelecek dönem 422 döner", async () => {
    expect(await hataDurumu(liste({ donem: "2026-13" }))).toBe(422)
    expect(await hataDurumu(liste({ donem: "2026-10" }))).toBe(422)
  })
})

describe("PATCH /api/bordro/:mukellefId/:donem", () => {
  it("durum ve not kaydedilir, aktiviteye yazılır; kayıt yoksa oluşturulur", async () => {
    expect(db.bordro.all()).toHaveLength(0)
    const satir = await http.patch<BordroSatiri>("/bordro/m_ltd/2026-08", {
      durum: "HAZIRLANDI",
      not: " 2 yeni çalışan ",
    })
    expect(satir).toMatchObject({ durum: "HAZIRLANDI", not: "2 yeni çalışan" })
    expect(db.bordro.find("m_ltd:2026-08")).toMatchObject({
      guncelleyenId: mehmet!.id,
    })
    expect(
      db.aktivite.where(
        (a) => a.eylem === "BORDRO_GUNCELLENDI" && a.hedefId === "m_ltd:2026-08"
      )
    ).toHaveLength(1)
  })

  it("değişiklik yok: girdi geldi olur, görev maddesi işaretlenir; işaret kaldırılınca durum korunur", async () => {
    const gorev = db.gorev.find("o_muh_ltd")!
    db.gorev.update(gorev.id, {
      checklist: gorev.checklist.map((c) =>
        c.metin === "Puantaj ve bordro alındı" ? { ...c, tamam: false } : c
      ),
    })
    const satir = await http.patch<BordroSatiri>("/bordro/m_ltd/2026-08", {
      degisiklikYok: true,
    })
    expect(satir).toMatchObject({ durum: "GIRDI_GELDI", degisiklikYok: true })
    expect(
      db.gorev
        .find("o_muh_ltd")!
        .checklist.find((c) => c.metin === "Puantaj ve bordro alındı")!.tamam
    ).toBe(true)
    expect(
      db.aktivite.where(
        (a) =>
          a.hedefId === "m_ltd:2026-08" &&
          Boolean(a.aciklama?.includes("değişiklik yok"))
      )
    ).toHaveLength(1)

    const kaldir = await http.patch<BordroSatiri>("/bordro/m_ltd/2026-08", {
      degisiklikYok: false,
    })
    expect(kaldir.degisiklikYok).toBeUndefined()
    expect(kaldir.durum).toBe("GIRDI_GELDI")
  })

  it("değişiklik yok ileri durumu geri almaz", async () => {
    await http.patch("/bordro/m_ltd/2026-08", { durum: "HAZIRLANDI" })
    const satir = await http.patch<BordroSatiri>("/bordro/m_ltd/2026-08", {
      degisiklikYok: true,
    })
    expect(satir).toMatchObject({ durum: "HAZIRLANDI", degisiklikYok: true })
  })

  it("doğrulamalar: geçersiz durum, uzun not, boş istek, oturumsuz", async () => {
    const yama = (body: unknown) => http.patch("/bordro/m_ltd/2026-08", body)
    expect(await hataDurumu(yama({ degisiklikYok: "evet" }))).toBe(422)
    expect(await hataDurumu(yama({ durum: "BEYAN_VERILDI" }))).toBe(422)
    expect(await hataDurumu(yama({ not: "x".repeat(501) }))).toBe(422)
    expect(await hataDurumu(yama({}))).toBe(422)
    expect(
      await hataDurumu(http.patch("/bordro/yok/2026-08", { not: "a" }))
    ).toBe(404)
    useAuthStore.setState({ user: null })
    expect(await hataDurumu(yama({ not: "a" }))).toBe(401)
  })

  it("takvimde MUHSGK onaylanınca durum beyan verildi olarak türetilir", async () => {
    db.takvim.insert({
      id: "m_ltd:MUHTASAR_SGK:2026-08",
      mukellefId: "m_ltd",
      tip: "MUHTASAR_SGK",
      donem: "2026-08",
      durum: "ONAYLANDI",
      guncelleyenId: mehmet!.id,
      guncellemeTarihi: new Date().toISOString(),
    })
    const r = await liste()
    expect(r.items.find((s) => s.mukellefId === "m_ltd")).toMatchObject({
      durum: "BEYAN_VERILDI",
      uyari: "YOK",
    })
  })
})

describe("GET /api/bordro/:mukellefId/:donem", () => {
  it("satır, tahakkuk özeti ve mizan varlığını döner", async () => {
    const d = await http.get<BordroDetay>("/bordro/m_ltd/2026-08")
    expect(d.satir.mukellefId).toBe("m_ltd")
    expect(d.mizanVar).toBe(false)
    expect(d.kontroller).toEqual([])
  })

  it("mükellef sekmesi için son dönemler en yeniden eskiye gelir", async () => {
    const satirlar = await http.get<BordroSatiri[]>(
      "/mukellefler/m_ltd/bordro",
      {
        params: { adet: 3 },
      }
    )
    expect(satirlar.map((s) => s.donem)).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ])
  })
})

describe("GET /api/bordro/ozet", () => {
  it("son iki dönemde girdisi gelmemiş ve süresi yaklaşan/geçenleri sayar", async () => {
    const o = await http.get<BordroOzetResponse>("/bordro/ozet")
    // m_ltd + m_as × (2026-08 yaklaşıyor, 2026-07 gecikti), hepsi girdi bekliyor
    expect(o).toMatchObject({ girdiBekleyen: 4, geciken: 0 })

    await http.patch("/bordro/m_ltd/2026-07", { durum: "HAZIRLANDI" })
    expect(await http.get<BordroOzetResponse>("/bordro/ozet")).toMatchObject({
      girdiBekleyen: 3,
      geciken: 1,
    })
    expect(
      await http.get<BordroOzetResponse>("/bordro/ozet", {
        params: { sorumlu: "p_3" },
      })
    ).toMatchObject({ girdiBekleyen: 1, geciken: 1 })
  })
})

describe("puantaj evrakı onaylanınca", () => {
  it("dönem 'Girdi geldi' olur ve MUHSGK görevindeki madde işaretlenir", async () => {
    const talep = await http.post<TalepView>("/evrak-talepleri", {
      mukellefId: "m_ltd",
      istenenler: ["PUANTAJ"],
      donem: "2026-08",
      kanal: "LINK",
      gecerlilikGun: 3,
    } as never)
    const gelen = db.gelen.insert({
      talepId: talep.id,
      mukellefId: "m_ltd",
      istenen: "PUANTAJ",
      ad: "puantaj.xlsx",
      mimeType: "image/png",
      boyut: 10,
      yuklemeTarihi: new Date().toISOString(),
      durum: "BEKLIYOR",
    })
    const gorev = db.gorev.find("o_muh_ltd")!
    db.gorev.update(gorev.id, {
      checklist: gorev.checklist.map((c) =>
        c.metin === "Puantaj ve bordro alındı" ? { ...c, tamam: false } : c
      ),
    })

    await http.post<GelenEvrakView>(`/gelen-evrak/${gelen.id}/onayla`, {
      kategori: "BORDRO",
      ad: "puantaj.xlsx",
    } as never)

    expect(db.bordro.find("m_ltd:2026-08")).toMatchObject({
      durum: "GIRDI_GELDI",
      girdiTalepId: talep.id,
    })
    expect(
      db.gorev
        .find("o_muh_ltd")!
        .checklist.find((c) => c.metin === "Puantaj ve bordro alındı")!.tamam
    ).toBe(true)
    expect(
      (await liste()).items.find((s) => s.mukellefId === "m_ltd")
    ).toMatchObject({ durum: "GIRDI_GELDI", girdiTalepId: talep.id })
    // Onaylanan puantaj arşivde döneme bağlanır ve dönem belgelerinde görünür
    const detay = await http.get<BordroDetay>("/bordro/m_ltd/2026-08")
    expect(detay.belgeler).toMatchObject([
      { ad: "puantaj.xlsx", tur: "PUANTAJ" },
    ])
  })

  it("durum zaten ilerideyse geri alınmaz", async () => {
    await http.patch("/bordro/m_ltd/2026-08", { durum: "MUKELLEFE_GITTI" })
    const talep = await http.post<TalepView>("/evrak-talepleri", {
      mukellefId: "m_ltd",
      istenenler: ["PUANTAJ"],
      donem: "2026-08",
      kanal: "LINK",
      gecerlilikGun: 3,
    } as never)
    const gelen = db.gelen.insert({
      talepId: talep.id,
      mukellefId: "m_ltd",
      istenen: "PUANTAJ",
      ad: "p.png",
      mimeType: "image/png",
      boyut: 1,
      yuklemeTarihi: new Date().toISOString(),
      durum: "BEKLIYOR",
    })
    await http.post(`/gelen-evrak/${gelen.id}/onayla`, {
      kategori: "BORDRO",
      ad: "p.png",
    } as never)
    expect(db.bordro.find("m_ltd:2026-08")!.durum).toBe("MUKELLEFE_GITTI")
  })
})

describe("portalda 'Bu ay değişiklik yok'", () => {
  const talepAc = (body: Record<string, unknown> = {}) =>
    http.post<TalepView>("/evrak-talepleri", {
      mukellefId: "m_ltd",
      istenenler: ["PUANTAJ"],
      donem: "2026-08",
      kanal: "LINK",
      gecerlilikGun: 3,
      ...body,
    } as never)
  const portal = (token: string) => http.get<PortalResponse>(`/portal/${token}`)

  it("dosyasız tamamlanır; dönem girdi geldi olur ve talebe bağlanır", async () => {
    const talep = await talepAc()
    const token = db.talep.find(talep.id)!.token
    expect((await portal(token)).degisiklikYokSecilebilir).toBe(true)

    await http.post(`/portal/${token}/tamamla`, { degisiklikYok: true })
    expect(db.talep.find(talep.id)!.durum).toBe("TAMAMLANDI")
    expect(db.bordro.find("m_ltd:2026-08")).toMatchObject({
      durum: "GIRDI_GELDI",
      degisiklikYok: true,
      girdiTalepId: talep.id,
      guncelleyenId: "musteri",
    })
  })

  it("dönemsiz, puantajsız veya bordrosuz talepte seçilemez; dosyasız ve işaretsiz gönderim reddedilir", async () => {
    const donemsiz = await talepAc({ donem: undefined })
    const fis = await talepAc({ istenenler: ["FIS_FATURA"] })
    const sahis = await talepAc({ mukellefId: "m_sahis" })
    for (const t of [donemsiz, fis, sahis]) {
      const token = db.talep.find(t.id)!.token
      expect((await portal(token)).degisiklikYokSecilebilir).toBe(false)
      expect(
        await hataDurumu(
          http.post(`/portal/${token}/tamamla`, { degisiklikYok: true })
        )
      ).toBe(400)
    }
    const token = db.talep.find((await talepAc()).id)!.token
    expect(await hataDurumu(http.post(`/portal/${token}/tamamla`, {}))).toBe(
      400
    )
    expect(db.bordro.all()).toHaveLength(0)
  })
})

describe("bordro hatırlatması", () => {
  it("girdisi gelmeyen dönem için sorumluya bir kez bildirim üretir", async () => {
    useAuthStore.setState({ user: PERSONEL[2] }) // p_3, m_ltd sorumlusu
    const ilk = await http.get<BildirimListResponse>("/bildirim")
    const bordro = ilk.items.filter((b) => b.tur === "BORDRO_GIRDI_BEKLIYOR")
    expect(bordro.map((b) => b.mukellefId)).toEqual(
      expect.arrayContaining(["m_ltd"])
    )
    expect(bordro.every((b) => b.link?.includes("/bordro"))).toBe(true)

    const ikinci = await http.get<BildirimListResponse>("/bildirim")
    expect(
      ikinci.items.filter((b) => b.tur === "BORDRO_GIRDI_BEKLIYOR")
    ).toHaveLength(bordro.length)
  })
})

const PDF = "data:application/pdf;base64,JVBERi0xLjQK"
const OZET = {
  calisanSayisi: 8,
  brutToplam: 300_000,
  netToplam: 231_000,
  sgkIsciPayi: 42_000,
  sgkIsverenPayi: 65_250,
  issizlikToplam: 9_000,
  gelirVergisi: 24_000,
  damgaVergisi: 2_277,
}
const kaydet = (body: unknown, mukellef = "m_ltd", donem = "2026-08") =>
  http.post<BordroDetay>(`/bordro/${mukellef}/${donem}/ozet`, body)

describe("POST /api/bordro/oku (PDF → özet)", () => {
  it("PDF'ten dönem toplamlarını ve güven değerini döner; aynı dosya aynı sonucu verir", async () => {
    const dosya = { ad: "bordro-agustos.pdf", dataUrl: PDF }
    const a = await http.post<BordroOkuResponse>("/bordro/oku", { dosya })
    const b = await http.post<BordroOkuResponse>("/bordro/oku", { dosya })
    expect(a).toEqual(b)
    expect(a.ozet.netToplam).toBeLessThanOrEqual(a.ozet.brutToplam)
    expect(a.guven).toBeGreaterThan(0.8)
  })

  it("okunamayan belge 422; eksik içerik 422; oturumsuz 401", async () => {
    const oku = (dosya: unknown) => http.post("/bordro/oku", { dosya })
    expect(
      await hataDurumu(oku({ ad: "bulanik-bordro.pdf", dataUrl: PDF }))
    ).toBe(422)
    expect(await hataDurumu(oku({ ad: "b.pdf", dataUrl: "yok" }))).toBe(422)
    useAuthStore.setState({ user: null })
    expect(await hataDurumu(oku({ ad: "b.pdf", dataUrl: PDF }))).toBe(401)
  })
})

describe("POST /api/bordro/:mukellefId/:donem/ozet", () => {
  it("özeti kaydeder: durum hazırlandı, dosyalar dönemle BORDRO arşivinde, görev maddesi işaretli, 201", async () => {
    const gorev = db.gorev.find("o_muh_ltd")!
    db.gorev.update(gorev.id, {
      checklist: gorev.checklist.map((c) =>
        c.metin === "Bordro hazırlandı" ? { ...c, tamam: false } : c
      ),
    })

    const d = await kaydet({
      ozet: OZET,
      dosyalar: [
        { tur: "PUSULA", dosya: { ad: "pusulalar.pdf", dataUrl: PDF } },
        { tur: "ICMAL", dosya: { ad: "bordro.pdf", dataUrl: PDF } },
      ],
    })
    expect(d.satir).toMatchObject({ durum: "HAZIRLANDI", ozet: OZET })
    // Belgeler tür sırasıyla (icmal önce) döner
    expect(d.belgeler.map((b) => [b.ad, b.tur])).toEqual([
      ["bordro.pdf", "ICMAL"],
      ["pusulalar.pdf", "PUSULA"],
    ])
    expect(db.arsiv.find(d.belgeler[0]!.id)).toMatchObject({
      kategori: "BORDRO",
      mukellefId: "m_ltd",
      donem: "2026-08",
      bordroBelge: "ICMAL",
    })
    expect(
      db.gorev
        .find("o_muh_ltd")!
        .checklist.find((c) => c.metin === "Bordro hazırlandı")!.tamam
    ).toBe(true)
    expect(
      db.aktivite.where((a) => a.eylem === "BORDRO_OZET_ICE_AKTARILDI")
    ).toHaveLength(1)
  })

  it("ikinci yükleme özeti günceller; durum ilerideyse geri alınmaz", async () => {
    await kaydet({ ozet: OZET })
    await http.patch("/bordro/m_ltd/2026-08", { durum: "MUKELLEFE_GITTI" })
    const d = await kaydet({ ozet: { ...OZET, calisanSayisi: 9 } })
    expect(d.satir.ozet?.calisanSayisi).toBe(9)
    expect(d.satir.durum).toBe("MUKELLEFE_GITTI")
  })

  it("doğrulamalar: eksik/negatif/tutarsız özet, bozuk dosya, gelecek dönem, bordrosuz mükellef", async () => {
    expect(await hataDurumu(kaydet({}))).toBe(422)
    expect(
      await hataDurumu(kaydet({ ozet: { ...OZET, calisanSayisi: 0 } }))
    ).toBe(422)
    expect(
      await hataDurumu(kaydet({ ozet: { ...OZET, brutToplam: -1 } }))
    ).toBe(422)
    expect(
      await hataDurumu(kaydet({ ozet: { ...OZET, netToplam: 300_001 } }))
    ).toBe(422)
    expect(
      await hataDurumu(
        kaydet({
          ozet: OZET,
          dosyalar: [{ tur: "ICMAL", dosya: { ad: "x.pdf", dataUrl: "yok" } }],
        })
      )
    ).toBe(422)
    expect(
      await hataDurumu(
        kaydet({
          ozet: OZET,
          dosyalar: [{ tur: "MAAS", dosya: { ad: "x.pdf", dataUrl: PDF } }],
        })
      )
    ).toBe(422)
    expect(await hataDurumu(kaydet({ ozet: OZET }, "m_ltd", "2026-10"))).toBe(
      422
    )
    expect(await hataDurumu(kaydet({ ozet: OZET }, "m_sahis"))).toBe(409)
    expect(await hataDurumu(kaydet({ ozet: OZET }, "yok"))).toBe(404)
    expect(db.bordro.all()).toHaveLength(0)
  })
})

describe("dönem belgeleri", () => {
  const ekle = (body: unknown, mukellef = "m_ltd") =>
    http.post<BordroDetay>(`/bordro/${mukellef}/2026-08/belgeler`, body)

  it("özetsiz belge ekler; arşivden dönemle bulunur, silinen ve başka dönem gelmez", async () => {
    const d = await ekle({
      dosyalar: [
        { tur: "IMZALI", dosya: { ad: "imzali.pdf", dataUrl: PDF } },
        { tur: "DEKONT", dosya: { ad: "dekont.pdf", dataUrl: PDF } },
      ],
    })
    expect(d.satir.ozet).toBeUndefined()
    expect(d.belgeler.map((b) => b.tur)).toEqual(["IMZALI", "DEKONT"])

    // Arşivden elle dönem verilen dosya da bağlanır; silinen düşer
    const elle = db.arsiv.insert({
      mukellefId: "m_ltd",
      kategori: "BORDRO",
      ad: "tahakkuk.pdf",
      mimeType: "application/pdf",
      boyut: 1,
      yukleyenId: "p_2",
      yuklemeTarihi: new Date().toISOString(),
      donem: "2026-08",
      bordroBelge: "TAHAKKUK",
      silindi: false,
    })
    db.arsiv.update(d.belgeler[0]!.id, { silindi: true })
    db.arsiv.insert({ ...elle, id: "baska", donem: "2026-07" })

    const detay = await http.get<BordroDetay>("/bordro/m_ltd/2026-08")
    expect(detay.belgeler.map((b) => b.ad)).toEqual([
      "tahakkuk.pdf",
      "dekont.pdf",
    ])
  })

  it("doğrulamalar: boş liste, geçersiz tür, bordrosuz mükellef, oturumsuz", async () => {
    expect(await hataDurumu(ekle({ dosyalar: [] }))).toBe(422)
    expect(
      await hataDurumu(
        ekle({ dosyalar: [{ tur: "X", dosya: { ad: "a.pdf", dataUrl: PDF } }] })
      )
    ).toBe(422)
    const tek = {
      dosyalar: [{ tur: "PUSULA", dosya: { ad: "a.pdf", dataUrl: PDF } }],
    }
    expect(await hataDurumu(ekle(tek, "m_sahis"))).toBe(409)
    useAuthStore.setState({ user: null })
    expect(await hataDurumu(ekle(tek))).toBe(401)
  })
})

describe("bordro kontrolleri okuma anında hesaplanır", () => {
  it("tahakkuk sonradan yüklenince kontrol listesine girer", async () => {
    await kaydet({ ozet: OZET })
    expect(
      (await http.get<BordroDetay>("/bordro/m_ltd/2026-08")).kontroller.map(
        (k) => k.kod
      )
    ).toEqual(["NET_BRUT", "CALISAN"])

    db.tahakkuk.insert({
      mukellefId: "m_ltd",
      tip: "MUHTASAR_SGK",
      donem: "2026-08",
      odenecek: 100_000,
      tahakkukNo: "T1",
      vade: "2026-09-28",
      yukleyenId: "p_2",
      yuklemeTarihi: new Date().toISOString(),
    })
    const d = await http.get<BordroDetay>("/bordro/m_ltd/2026-08")
    expect(d.kontroller.find((k) => k.kod === "MUHSGK_TAHAKKUK")?.durum).toBe(
      "UYARI"
    )
    expect(d.tahakkuk).toMatchObject({ odenecek: 100_000, tahakkukNo: "T1" })
  })

  it("mizan yüklenince 361 / 335 kontrolleri gelir", async () => {
    await kaydet({ ozet: OZET })
    db.mizan.insert({
      mukellefId: "m_ltd",
      donem: "2026-08",
      dosyaAdi: "mizan.xlsx",
      hesaplar: [
        { kod: "361", ad: "", borc: 0, alacak: 116_250 },
        { kod: "335", ad: "", borc: 0, alacak: 231_000 },
      ],
      kontroller: [],
      yukleyenId: "p_2",
      yuklemeTarihi: new Date().toISOString(),
    })
    const d = await http.get<BordroDetay>("/bordro/m_ltd/2026-08")
    expect(d.mizanVar).toBe(true)
    expect(
      d.kontroller.filter((k) => k.kod.startsWith("MIZAN")).map((k) => k.durum)
    ).toEqual(["GECTI", "GECTI"])
  })
})

describe("POST /api/bordro/:mukellefId/:donem/calisan-uygula", () => {
  it("bordrodaki çalışan sayısını mükellef kartına yazar ve loglar", async () => {
    await kaydet({ ozet: { ...OZET, calisanSayisi: 12 } })
    const d = await http.post<BordroDetay>(
      "/bordro/m_ltd/2026-08/calisan-uygula"
    )
    expect(db.mukellef.find("m_ltd")).toMatchObject({
      calisanSayisi: 12,
      sgkIsyeriVar: true,
    })
    expect(d.kontroller.find((k) => k.kod === "CALISAN")?.durum).toBe("GECTI")
    expect(
      db.aktivite.where(
        (a) =>
          a.eylem === "MUKELLEF_GUNCELLENDI" &&
          Boolean(a.aciklama?.includes("8 → 12"))
      )
    ).toHaveLength(1)
  })

  it("özet yoksa 409; mükellef yoksa 404", async () => {
    expect(
      await hataDurumu(http.post("/bordro/m_ltd/2026-08/calisan-uygula"))
    ).toBe(409)
    expect(
      await hataDurumu(http.post("/bordro/yok/2026-08/calisan-uygula"))
    ).toBe(404)
  })
})

const hareket = (over: Record<string, unknown> = {}) => ({
  mukellefId: "m_ltd",
  tur: "GIRIS",
  tarih: "2026-09-24",
  kisi: "Ali Veli",
  ...over,
})

describe("/api/is-hareketleri", () => {
  it("ekler, listeler ve süreyi hesaplar; en acil önce gelir", async () => {
    const giris = await http.post<IsHareketiView>("/is-hareketleri", hareket())
    expect(giris).toMatchObject({
      durum: "BEKLIYOR",
      olusturanId: mehmet!.id,
      mukellefUnvan: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      sonTarih: "2026-09-24",
      kalanIsGunu: 1,
      uyari: "YAKLASIYOR",
    })
    // Çıkış: 10 Eyl + 10 gün = 20 Eylül Pazar → 21 Eylül; geçti
    await http.post(
      "/is-hareketleri",
      hareket({ tur: "CIKIS", tarih: "2026-09-10", kisi: "Veli Can" })
    )
    // Süresi rahat
    await http.post(
      "/is-hareketleri",
      hareket({ tarih: "2026-10-30", kisi: "Zeynep Ak" })
    )

    const liste = await http.get<IsHareketiView[]>("/is-hareketleri")
    expect(liste.map((h) => [h.kisi, h.uyari])).toEqual([
      ["Veli Can", "GECIKTI"],
      ["Ali Veli", "YAKLASIYOR"],
      ["Zeynep Ak", "YOK"],
    ])
    expect(
      await http.get<IsHareketiView[]>("/is-hareketleri", {
        params: { mukellefId: "m_as" },
      })
    ).toEqual([])
  })

  it("bildirildi olarak işaretlenir (tarih yazılır), geri alınır; bildirilen listenin sonuna gider", async () => {
    const h = await http.post<IsHareketiView>("/is-hareketleri", hareket())
    const bildirildi = await http.patch<IsHareketiView>(
      `/is-hareketleri/${h.id}`,
      {
        durum: "BILDIRILDI",
      }
    )
    expect(bildirildi).toMatchObject({ durum: "BILDIRILDI", uyari: "YOK" })
    expect(bildirildi.bildirimTarihi).toBeTruthy()

    const geri = await http.patch<IsHareketiView>(`/is-hareketleri/${h.id}`, {
      durum: "BEKLIYOR",
    })
    expect(geri.bildirimTarihi).toBeUndefined()
    expect(geri.uyari).toBe("YAKLASIYOR")
  })

  it("belge yalnızca aynı mükellefin arşivinden bağlanabilir", async () => {
    const h = await http.post<IsHareketiView>("/is-hareketleri", hareket())
    const belge = db.arsiv.where((d) => d.mukellefId === "m_ltd")[0]!
    const baska = db.arsiv.where((d) => d.mukellefId !== "m_ltd")[0]!
    expect(
      await http.patch<IsHareketiView>(`/is-hareketleri/${h.id}`, {
        belgeArsivId: belge.id,
      })
    ).toMatchObject({ belgeArsivId: belge.id })
    expect(
      await hataDurumu(
        http.patch(`/is-hareketleri/${h.id}`, { belgeArsivId: baska.id })
      )
    ).toBe(422)
    expect(
      (
        await http.patch<IsHareketiView>(`/is-hareketleri/${h.id}`, {
          belgeArsivId: null,
        })
      ).belgeArsivId
    ).toBeUndefined()
  })

  it("siler; doğrulamalar çalışır", async () => {
    const h = await http.post<IsHareketiView>("/is-hareketleri", hareket())
    await http.delete(`/is-hareketleri/${h.id}`)
    expect(db.isHareketi.all()).toHaveLength(0)
    expect(await hataDurumu(http.delete(`/is-hareketleri/${h.id}`))).toBe(404)

    const ekle = (over: Record<string, unknown>) =>
      hataDurumu(http.post("/is-hareketleri", hareket(over)))
    expect(await ekle({ tur: "IZIN" })).toBe(422)
    expect(await ekle({ tarih: "2026-02-30" })).toBe(422)
    expect(await ekle({ tarih: "yarin" })).toBe(422)
    expect(await ekle({ kisi: "  " })).toBe(422)
    expect(await ekle({ kisi: "x".repeat(81) })).toBe(422)
    expect(await ekle({ mukellefId: "yok" })).toBe(404)
    expect(
      await hataDurumu(
        http.patch(`/is-hareketleri/yok`, { durum: "BILDIRILDI" })
      )
    ).toBe(404)
    useAuthStore.setState({ user: null })
    expect(await ekle({})).toBe(401)
  })

  it("dashboard özeti ve hatırlatma bildirimi yalnızca bildirilmemiş kayıtları sayar", async () => {
    await http.post("/is-hareketleri", hareket()) // yaklaşıyor
    await http.post(
      "/is-hareketleri",
      hareket({ tur: "CIKIS", tarih: "2026-09-10", kisi: "Geç Kalan" })
    ) // gecikti
    const bildirilen = await http.post<IsHareketiView>(
      "/is-hareketleri",
      hareket({ tur: "CIKIS", tarih: "2026-09-01", kisi: "Tamam" })
    )
    await http.patch(`/is-hareketleri/${bildirilen.id}`, {
      durum: "BILDIRILDI",
    })

    const o = await http.get<BordroOzetResponse>("/bordro/ozet")
    expect(o).toMatchObject({ hareketYaklasan: 1, hareketGeciken: 1 })
    expect(
      await http.get<BordroOzetResponse>("/bordro/ozet", {
        params: { sorumlu: "p_2" },
      })
    ).toMatchObject({ hareketYaklasan: 0, hareketGeciken: 0 })

    useAuthStore.setState({ user: PERSONEL[2] }) // m_ltd sorumlusu p_3
    const b = (await http.get<BildirimListResponse>("/bildirim")).items.filter(
      (x) => x.tur === "ISE_HAREKETI_SURE"
    )
    expect(b).toHaveLength(2)
    expect(b.map((x) => x.baslik).sort()).toEqual([
      "İşe giriş bildirimi için son gün yaklaşıyor",
      "İşten çıkış bildirimi gecikti",
    ])
  })
})
