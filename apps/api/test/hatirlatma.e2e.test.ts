import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PERSONEL } from "@prime/mock-data/factories/personel"

import { arsivDosya, bildirim, gonderim } from "../src/db/schema/index.js"
import { HatirlatmaService } from "../src/hatirlatma/hatirlatma.service.js"
import { testUygulamasi, type TestUygulamasi } from "./harness.js"

const YONETICI = PERSONEL[0]!.id
const MEHMET = PERSONEL[1]!.id

describe("hatırlatmalar", () => {
  let t: TestUygulamasi
  let hatirlatma: HatirlatmaService

  beforeAll(async () => {
    t = await testUygulamasi()
    hatirlatma = t.app.get(HatirlatmaService)
  })
  afterAll(() => t.kapat())

  beforeEach(async () => {
    await t.fixtureYukle()
    t.saat.sabitle(new Date(2026, 8, 23, 10, 0))
  })

  const turler = async (tur: string) =>
    t.db.select().from(bildirim).where(eq(bildirim.tur, tur as never))

  it("geciken görev atanana bir kez hatırlatılır; GET /bildirim üretmez", async () => {
    const ben = t.istemci(await t.girisYap(MEHMET))
    await ben.get("/bildirim")
    expect(await turler("GOREV_GECIKTI")).toHaveLength(0)

    const n = await hatirlatma.uret()
    expect(n).toBeGreaterThan(0)
    const gorevler = await turler("GOREV_GECIKTI")
    expect(gorevler.length).toBeGreaterThan(0)
    expect(gorevler.every((b) => b.anahtar?.startsWith("GOREV_GECIKTI:"))).toBe(true)
    expect(gorevler.some((b) => b.aliciId === MEHMET)).toBe(true)
    expect(await hatirlatma.uret()).toBe(0)
  })

  it("belge geçerliliği: 7 gün penceresi, sorumluya, durum değişince yeniden", async () => {
    await t.db.insert(arsivDosya).values({
      id: "d_faaliyet",
      mukellefId: "m_ltd",
      kategori: "FAALIYET_BELGESI",
      ad: "faaliyet.pdf",
      mimeType: "application/pdf",
      boyut: 100,
      yukleyenId: YONETICI,
      yuklemeTarihi: "2026-01-01T00:00:00.000Z",
      gecerlilikTarihi: "2026-09-26",
    })
    await hatirlatma.uret()
    const [b] = await turler("BELGE_GECERLILIK")
    expect(b).toMatchObject({
      baslik: "Belgenin geçerliliği 3 gün içinde doluyor",
      link: "/arsiv?mukellef=m_ltd&kategori=FAALIYET_BELGESI",
      hedefId: "d_faaliyet",
    })
    t.saat.sabitle(new Date(2026, 8, 28, 10, 0))
    await hatirlatma.uret()
    const sonra = await turler("BELGE_GECERLILIK")
    expect(sonra.map((x) => x.baslik)).toContain("Belgenin geçerlilik süresi doldu")
  })

  it("yaklaşan beyanlar sorumlu + son gün bazında tek bildirim", async () => {
    t.saat.sabitle(new Date(2026, 8, 25, 10, 0))
    await hatirlatma.uret()
    const beyanlar = await turler("BEYAN_YAKLASIYOR")
    expect(beyanlar.length).toBeGreaterThan(0)
    expect(new Set(beyanlar.map((b) => b.anahtar)).size).toBe(beyanlar.length)
    expect(beyanlar.every((b) => b.hedefTip === "TAKVIM" && b.link === "/takvim?durum=bekliyor")).toBe(
      true
    )
  })

  it("geciken ödemeler yöneticilere haftada bir; uyarı kategorisi e-postaya kuyruğa girer", async () => {
    await hatirlatma.uret()
    const odemeler = await turler("ODEME_GECIKTI")
    expect(odemeler.map((b) => b.aliciId)).toContain(YONETICI)
    expect(odemeler[0]!.anahtar).toMatch(/^ODEME_GECIKTI:p_\d+:2026-W39$/)
    // Mehmet'in geciken görevi "uyari" → varsayılan tercihle e-posta
    const kuyruk = await t.db.select().from(gonderim).where(eq(gonderim.aliciId, MEHMET))
    expect(kuyruk.some((g) => g.kanal === "EPOSTA" && g.durum === "KUYRUKTA")).toBe(true)
  })
})
