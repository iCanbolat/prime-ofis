import { describe, expect, it } from "vitest"

import {
  bordroBelgeTahmini,
  bordroSonTarih,
  bordroUygulanirMi,
  bordroUyari,
  guncelBordroDonemi,
  kalanIsGunu,
  sonBordroDonemleri,
} from "@prime/shared/bordro/kurallar"
import { CHECKLIST_SABLONLARI } from "@prime/shared/gorev/sabitler"
import {
  BORDRO_MADDE_GIRDI,
  BORDRO_MADDE_HAZIR,
} from "@prime/shared/bordro/sabitler"

describe("bordroSonTarih", () => {
  it("MUHSGK son günü ertesi ayın 26'sıdır; tatilde ilk iş gününe kayar", () => {
    // 26 Eylül 2026 Cumartesi → 28 Eylül Pazartesi
    expect(bordroSonTarih("2026-08")).toBe("2026-09-28")
    // 26 Ekim 2026 Pazartesi
    expect(bordroSonTarih("2026-09")).toBe("2026-10-26")
  })

  it("yıl sonu dönemi ertesi yılın Ocak ayına düşer", () => {
    expect(bordroSonTarih("2025-12")).toBe("2026-01-26")
  })
})

describe("kalanIsGunu", () => {
  it("bugün hariç, son gün dahil iş günü sayar", () => {
    // Per 24, Cum 25, Pzt 28
    expect(kalanIsGunu("2026-09-23", "2026-09-28")).toBe(3)
    expect(kalanIsGunu("2026-09-25", "2026-09-28")).toBe(1)
    expect(kalanIsGunu("2026-09-28", "2026-09-28")).toBe(0)
  })

  it("son gün geçtiyse negatiftir", () => {
    expect(kalanIsGunu("2026-09-28", "2026-09-23")).toBe(-3)
  })
})

describe("bordroUyari", () => {
  const son = "2026-09-28"

  it("girdi gelmediyse son güne 5 iş günü kala yaklaşıyor", () => {
    expect(bordroUyari("BEKLENIYOR", son, "2026-09-21")).toBe("YAKLASIYOR") // 5 iş günü
    expect(bordroUyari("BEKLENIYOR", son, "2026-09-18")).toBe("YOK") // 6 iş günü
  })

  it("girdi geldiyse yalnızca son güne 1 iş günü kala uyarır", () => {
    expect(bordroUyari("GIRDI_GELDI", son, "2026-09-23")).toBe("YOK")
    expect(bordroUyari("HAZIRLANDI", son, "2026-09-25")).toBe("YAKLASIYOR")
    expect(bordroUyari("MUKELLEFE_GITTI", son, "2026-09-28")).toBe("YAKLASIYOR")
  })

  it("son gün geçtiyse ve beyan verilmediyse gecikti; beyan verildiyse sorun yok", () => {
    expect(bordroUyari("BEKLENIYOR", son, "2026-09-29")).toBe("GECIKTI")
    expect(bordroUyari("MUKELLEFE_GITTI", son, "2026-09-29")).toBe("GECIKTI")
    expect(bordroUyari("BEYAN_VERILDI", son, "2026-09-29")).toBe("YOK")
  })
})

describe("dönem yardımcıları", () => {
  it("içinde bulunulan ayın bordro dönemi bir önceki aydır", () => {
    expect(guncelBordroDonemi("2026-09-23")).toBe("2026-08")
    expect(guncelBordroDonemi("2026-01-05")).toBe("2025-12")
  })

  it("son dönemler en yeniden eskiye sıralanır", () => {
    expect(sonBordroDonemleri("2026-09-23", 3)).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ])
  })
})

describe("bordroUygulanirMi", () => {
  it("aktif ve çalışanı ya da SGK işyeri kaydı olan mükellefte geçerlidir", () => {
    expect(
      bordroUygulanirMi({ aktif: true, calisanSayisi: 3, sgkIsyeriVar: true })
    ).toBe(true)
    expect(
      bordroUygulanirMi({ aktif: true, calisanSayisi: 0, sgkIsyeriVar: true })
    ).toBe(true)
    expect(
      bordroUygulanirMi({ aktif: true, calisanSayisi: 0, sgkIsyeriVar: false })
    ).toBe(false)
    expect(
      bordroUygulanirMi({ aktif: false, calisanSayisi: 3, sgkIsyeriVar: true })
    ).toBe(false)
  })
})

describe("MUHSGK görev şablonu", () => {
  it("bordro maddeleri şablondaki metinlerle birebir aynıdır", () => {
    const sablon = CHECKLIST_SABLONLARI.MUHTASAR_SGK
    expect(sablon).toContain(BORDRO_MADDE_GIRDI)
    expect(sablon).toContain(BORDRO_MADDE_HAZIR)
  })
})

describe("bordroBelgeTahmini", () => {
  it.each([
    ["BORDRO_PUSULASI_2026-08.pdf", "PUSULA"],
    ["Ücret Hesap Pusulaları.pdf", "PUSULA"],
    ["MUHSGK Tahakkuk Fişi.pdf", "TAHAKKUK"],
    ["puantaj ağustos.xlsx", "PUANTAJ"],
    ["İMZALI BORDRO.pdf", "IMZALI"],
    ["maaş dekontu.pdf", "DEKONT"],
    ["Bordro Dökümü.xlsx", "ICMAL"],
    ["icmal.pdf", "ICMAL"],
    ["tarama001.pdf", "ICMAL"],
  ] as const)("%s → %s", (ad, tur) => {
    expect(bordroBelgeTahmini(ad)).toBe(tur)
  })
})
