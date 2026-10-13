import { describe, expect, it } from "vitest"

import { kesintiKarsilastir } from "@prime/shared/tahsilat/kurallar"
import { isValidTckn, isValidVkn } from "@prime/shared/lib/tax-id"
import { DEFAULT_SEED, createSeed } from "@prime/mock-data/seed"

describe("createSeed", () => {
  it("aynı seed ile birebir aynı veriyi üretir", () => {
    expect(createSeed(DEFAULT_SEED)).toEqual(createSeed(DEFAULT_SEED))
  })

  it("farklı seed ile farklı mükellefler üretir", () => {
    const a = createSeed(1).mukellef.map((m) => m.unvan)
    const b = createSeed(2).mukellef.map((m) => m.unvan)
    expect(a).not.toEqual(b)
  })

  it("1 büro, 4 personel (1 yönetici) ve 40 mükellef içerir", () => {
    const state = createSeed()
    expect(state.buro).toHaveLength(1)
    expect(state.personel).toHaveLength(4)
    expect(state.personel.filter((p) => p.rol === "YONETICI")).toHaveLength(1)
    expect(state.mukellef).toHaveLength(40)
    expect(state.aktivite).toEqual([])
  })

  it("mükellef türü dağılımı 16 Şahıs / 18 Ltd / 6 A.Ş.", () => {
    const { mukellef } = createSeed()
    const count = (tur: string) => mukellef.filter((m) => m.tur === tur).length
    expect([count("SAHIS"), count("LTD"), count("AS")]).toEqual([16, 18, 6])
  })

  it("mükellef id'leri benzersiz", () => {
    const ids = createSeed().mukellef.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("Şahıs → geçerli TCKN, Ltd/A.Ş. → geçerli VKN taşır", () => {
    for (const m of createSeed().mukellef) {
      if (m.tur === "SAHIS") {
        expect(m.tckn && isValidTckn(m.tckn), `${m.id} TCKN`).toBe(true)
        expect(m.vkn).toBeUndefined()
      } else {
        expect(m.vkn && isValidVkn(m.vkn), `${m.id} VKN`).toBe(true)
        expect(m.tckn).toBeUndefined()
      }
    }
  })

  it("iş kuralları tutarlı", () => {
    const { mukellef, personel } = createSeed()
    const personelIds = new Set(personel.map((p) => p.id))

    for (const m of mukellef) {
      expect(personelIds.has(m.sorumluPersonelId)).toBe(true)
      expect(m.sgkIsyeriVar).toBe(m.calisanSayisi > 0)
      if (m.tur !== "SAHIS") {
        expect(m.defterTuru).toBe("BILANCO")
        expect(m.kdvMukellefi).toBe(true)
        expect(m.kdvPeriyodu).toBe("AYLIK")
      }
      if (m.tur === "AS") expect(m.eDefterMukellefi).toBe(true)
      if (m.kdvPeriyodu === "UC_AYLIK") expect(m.defterTuru).toBe("ISLETME")
    }
  })

  it("arşiv: her dosya var olan mükellefe ait, id'ler benzersiz, süreli belgeler tarihli", () => {
    const { arsiv, mukellef } = createSeed()
    const ids = new Set(mukellef.map((m) => m.id))
    expect(arsiv.length).toBeGreaterThan(80)
    expect(new Set(arsiv.map((d) => d.id)).size).toBe(arsiv.length)
    for (const d of arsiv) {
      expect(ids.has(d.mukellefId)).toBe(true)
      if (d.kategori === "IMZA_SIRKULERI")
        expect(d.gecerlilikTarihi).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(arsiv.some((d) => d.silindi)).toBe(true)
  })

  it("görevler: ~120 kayıt, deterministik, takvim durumuyla tutarlı, idempotent anahtar", () => {
    const { gorev, takvim, mukellef } = createSeed()
    expect(gorev.length).toBeGreaterThanOrEqual(110)
    expect(gorev.length).toBeLessThanOrEqual(140)
    expect(createSeed().gorev).toEqual(gorev)

    const ids = new Set(mukellef.map((m) => m.id))
    const beyan = new Map(takvim.map((t) => [t.id, t.durum]))
    const anahtarlar = gorev.flatMap((g) => g.otomatikAnahtar ?? [])
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length)
    for (const g of gorev) {
      expect(ids.has(g.mukellefId)).toBe(true)
      if (!g.otomatikAnahtar) continue
      const durum = beyan.get(g.otomatikAnahtar)
      if (durum === "ONAYLANDI") expect(g.durum).toBe("TAMAM")
      if (durum === "HAZIRLANDI") expect(g.durum).toBe("KONTROL")
      if (g.durum === "TAMAM")
        expect(g.checklist.every((m) => m.tamam)).toBe(true)
    }
    expect(gorev.some((g) => g.tip === "DIGER")).toBe(true)
    expect(gorev.some((g) => g.yorumlar.length > 0)).toBe(true)
  })

  it("e-Belge verisi tutarlı: bağlantı yalnızca aktif mükellefte, faturalar bağlı mükelleflerde", () => {
    const { mukellef, baglanti, ebelge, berat, takvim } = createSeed()
    const aktif = new Set(mukellef.filter((m) => m.aktif).map((m) => m.id))
    const baglilar = new Set(baglanti.map((b) => b.mukellefId))
    expect(baglanti.every((b) => aktif.has(b.mukellefId))).toBe(true)
    expect(baglanti.filter((b) => b.durum === "HATA")).toHaveLength(2)
    expect(ebelge.every((e) => baglilar.has(e.mukellefId))).toBe(true)
    expect(new Set(ebelge.map((e) => e.ettn)).size).toBe(ebelge.length)
    for (const e of ebelge) {
      expect(e.toplam).toBeCloseTo(e.matrah + e.kdv, 2)
      // Yalnızca gelen ticari faturalar yanıt taşır
      expect(Boolean(e.yanit)).toBe(e.yon === "GELEN" && e.senaryo === "TICARI")
    }
    expect(ebelge.some((e) => e.yanit === "BEKLIYOR")).toBe(true)
    // Takvimde onaylı olan berat dönemi entegratörde de onaylı
    const onayli = new Set(
      takvim
        .filter((t) => t.tip === "E_DEFTER_BERAT" && t.durum === "ONAYLANDI")
        .map((t) => `${t.mukellefId}:${t.donem}`)
    )
    for (const b of berat)
      if (onayli.has(b.id)) expect(b.durum).toBe("ONAYLANDI")
  })

  it("tahsilat: ücretli mükellefler, tutarlı kapatmalar ve her kesinti durumu", () => {
    const { mukellef, cari, kesinti } = createSeed()
    const ucretli = mukellef.filter((m) => m.ucret)
    expect(ucretli.length).toBeGreaterThan(25)
    const borclar = new Map(
      cari.filter((h) => h.tip === "BORC").map((h) => [h.id, h])
    )
    const kapatilan = new Map<string, number>()
    for (const h of cari) {
      if (h.tip !== "ODEME") continue
      expect(h.tarih <= "2026-09-22").toBe(true)
      const toplam = (h.kapatmalar ?? []).reduce((t, k) => t + k.tutar, 0)
      expect(toplam).toBeLessThanOrEqual(h.tutar + 0.005)
      for (const k of h.kapatmalar ?? []) {
        expect(borclar.get(k.borcId)?.mukellefId).toBe(h.mukellefId)
        kapatilan.set(k.borcId, (kapatilan.get(k.borcId) ?? 0) + k.tutar)
      }
    }
    for (const [id, t] of kapatilan)
      expect(t).toBeLessThanOrEqual(borclar.get(id)!.tutar + 0.005)
    // Otomatik ücret anahtarları benzersiz
    const anahtarlar = cari.flatMap((h) => h.otomatikAnahtar ?? [])
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length)

    const state = createSeed()
    const durumlar = new Set(
      kesintiKarsilastir(state.cari, state.mukellef, kesinti, 2026).map(
        (s) => s.durum
      )
    )
    expect([...durumlar].sort()).toEqual([
      "BILDIRILMEMIS",
      "EKSIK",
      "ESLESTI",
      "FAZLA",
      "KAYITSIZ",
    ])
  })
})
