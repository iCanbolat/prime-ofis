import { describe, expect, it } from "vitest"

import {
  beklenenLevhaYili,
  borcToplami,
  borcuYokturAcikMi,
  borcuYokturGecerlilik,
  borcuYokturGorunum,
  kalemleriGoster,
  levhaGuncelMi,
} from "@prime/shared/borc/kurallar"
import type { BorcKalemi } from "@prime/shared/types/domain"

const kalem = (k: Partial<BorcKalemi>): BorcKalemi => ({
  tur: "Katma Değer Vergisi",
  vade: "2026-09-28",
  asil: 1000,
  gecikme: 0,
  ...k,
})

describe("borcToplami", () => {
  it("toplamı ve vadesi geçmiş kısmı ayrı hesaplar; vade günü geçmiş sayılmaz", () => {
    const t = borcToplami(
      [
        kalem({ vade: "2026-09-20", asil: 1000.1, gecikme: 20.2 }),
        kalem({ vade: "2026-09-23", asil: 500 }),
        kalem({ vade: "2026-10-28", asil: 250 }),
      ],
      "2026-09-23"
    )
    expect(t).toEqual({
      toplam: 1770.3,
      vadesiGecmis: 1020.3,
      kalemSayisi: 3,
      enEskiVade: "2026-09-20",
    })
  })

  it("boş dökümde sıfır döner", () => {
    expect(borcToplami([], "2026-09-23")).toEqual({
      toplam: 0,
      vadesiGecmis: 0,
      kalemSayisi: 0,
      enEskiVade: undefined,
    })
  })
})

describe("kalemleriGoster", () => {
  it("aynı tip + dönem tahakkukla eşleşir, vadeye göre sıralanır", () => {
    const v = kalemleriGoster(
      [
        kalem({ yukumlulukTip: "KDV", donem: "2026-08", vade: "2026-09-28" }),
        kalem({
          tur: "Muhtasar",
          yukumlulukTip: "MUHTASAR_SGK",
          donem: "2026-07",
          vade: "2026-08-26",
        }),
        kalem({ tur: "Damga vergisi", vade: "2026-08-01" }),
      ],
      [
        { id: "h_1", tip: "KDV", donem: "2026-08" },
        { id: "h_2", tip: "MUHTASAR_SGK", donem: "2026-06" },
      ],
      "2026-09-23"
    )
    expect(v.map((k) => [k.tur, k.vadesiGecti, k.tahakkukId])).toEqual([
      ["Damga vergisi", true, undefined],
      ["Muhtasar", true, undefined],
      ["Katma Değer Vergisi", false, "h_1"],
    ])
  })
})

describe("vergi levhası", () => {
  it("yayın gününden sonra geçen yılın, öncesinde iki yıl öncesinin levhası beklenir", () => {
    expect(beklenenLevhaYili("2026-05-31")).toBe(2024)
    expect(beklenenLevhaYili("2026-06-01")).toBe(2025)
    expect(beklenenLevhaYili("2026-12-31")).toBe(2025)
  })

  it("beklenen yıl veya daha yenisi varsa güncel", () => {
    expect(levhaGuncelMi([{ yil: 2024 }], "2026-09-23")).toBe(false)
    expect(levhaGuncelMi([{ yil: 2024 }, { yil: 2025 }], "2026-09-23")).toBe(
      true
    )
    expect(levhaGuncelMi([], "2026-09-23")).toBe(false)
  })
})

describe("borcu yoktur", () => {
  it("hazır yazının süresi geçerlilik tarihinden sonra dolmuş görünür", () => {
    const gecerlilikTarihi = borcuYokturGecerlilik("2026-09-01")
    expect(gecerlilikTarihi).toBe("2026-10-01")
    const t = { durum: "HAZIR" as const, gecerlilikTarihi }
    expect(borcuYokturGorunum(t, "2026-10-01")).toBe("HAZIR")
    expect(borcuYokturGorunum(t, "2026-10-02")).toBe("SURESI_DOLDU")
    expect(borcuYokturGorunum({ durum: "BORCU_VAR" }, "2026-12-01")).toBe(
      "BORCU_VAR"
    )
  })

  it("doğrulama bekleyen ve hazırlanan talepler açık sayılır", () => {
    expect(borcuYokturAcikMi({ durum: "DOGRULAMA_BEKLIYOR" })).toBe(true)
    expect(borcuYokturAcikMi({ durum: "TALEP_EDILDI" })).toBe(true)
    expect(borcuYokturAcikMi({ durum: "HAZIR" })).toBe(false)
    expect(borcuYokturAcikMi({ durum: "BORCU_VAR" })).toBe(false)
  })
})
