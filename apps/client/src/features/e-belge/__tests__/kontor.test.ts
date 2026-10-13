import { describe, expect, it } from "vitest"

import {
  hediyeKontor,
  kontorBakiyesi,
  kontorDonemi,
  mukellefTuketimleri,
  sonDonemler,
} from "@prime/shared/e-belge/kontor"

const belge = (mukellefId: string, yon: "GELEN" | "GIDEN", ymd: string) => ({
  mukellefId,
  yon,
  alinmaTarihi: new Date(`${ymd}T10:00:00`).toISOString(),
})

/** Haziran 30, Temmuz 30, Ağustos 30, Eylül 5 belge */
const belgeler = [
  ...Array.from({ length: 30 }, () => belge("m_1", "GELEN", "2026-06-10")),
  ...Array.from({ length: 30 }, () => belge("m_1", "GIDEN", "2026-07-10")),
  ...Array.from({ length: 30 }, () => belge("m_2", "GIDEN", "2026-08-10")),
  belge("m_1", "GELEN", "2026-09-01"),
  belge("m_1", "GIDEN", "2026-09-02"),
  belge("m_2", "GIDEN", "2026-09-03"),
  belge("m_2", "GIDEN", "2026-09-04"),
  belge("m_2", "GELEN", "2026-09-05"),
]

describe("kontör kuralları", () => {
  it("Luca kullanıcısına %20 hediye", () => {
    expect(hediyeKontor(1000)).toBe(200)
    expect(hediyeKontor(250)).toBe(50)
    expect(hediyeKontor(0)).toBe(0)
  })

  it("belgenin dönemi yerel saatle alındığı ay", () => {
    expect(kontorDonemi(belge("m", "GELEN", "2026-09-30"))).toBe("2026-09")
  })

  it("son dönemler içinde bulunulan ay dahil, eskiden yeniye", () => {
    expect(sonDonemler("2026-01-15", 3)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ])
  })

  it("bakiye: kalan, birim maliyet, aylık ortalama ve tahmini süre", () => {
    const b = kontorBakiyesi(
      [{ paketAdet: 100, hediyeAdet: 20, tutar: 132 }],
      belgeler,
      "2026-09-23"
    )
    expect(b).toMatchObject({
      toplamAlinan: 120,
      toplamTuketim: 95,
      kalan: 25,
      aylikOrtalama: 30,
      tahminiAy: 0.8,
      dusukBakiye: true,
    })
    expect(b.birimMaliyet).toBeCloseTo(1.1)
  })

  it("iki aylık tüketimden fazla kontör varsa uyarı yok; tüketim yoksa süre hesaplanmaz", () => {
    expect(
      kontorBakiyesi(
        [{ paketAdet: 1000, hediyeAdet: 0, tutar: 0 }],
        belgeler,
        "2026-09-23"
      ).dusukBakiye
    ).toBe(false)
    const bos = kontorBakiyesi([], [], "2026-09-23")
    expect(bos).toMatchObject({
      kalan: 0,
      birimMaliyet: 0,
      tahminiAy: null,
      dusukBakiye: true,
    })
  })

  it("mükellef tüketimi gelen/giden ayrımıyla, çoktan aza", () => {
    expect(mukellefTuketimleri(belgeler, "2026-09")).toEqual([
      { mukellefId: "m_2", gelen: 1, giden: 2, toplam: 3 },
      { mukellefId: "m_1", gelen: 1, giden: 1, toplam: 2 },
    ])
  })
})
