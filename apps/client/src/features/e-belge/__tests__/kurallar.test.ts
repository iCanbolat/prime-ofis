import { describe, expect, it } from "vitest"

import {
  beratTakvimId,
  formatTutar,
  yanitDurumu,
  yanitKalanGun,
  yanitlanabilirMi,
} from "@prime/shared/e-belge/kurallar"
import type { EBelge } from "@prime/shared/types/domain"

const simdi = new Date(2026, 8, 23, 10, 0)
const fatura = (
  alanlar: Partial<Pick<EBelge, "yon" | "senaryo" | "yanit" | "alinmaTarihi">>
) => ({
  yon: "GELEN" as const,
  senaryo: "TICARI" as const,
  yanit: "BEKLIYOR" as const,
  alinmaTarihi: new Date(2026, 8, 20, 9, 0).toISOString(),
  ...alanlar,
})

describe("ticari fatura yanıt süresi (8 gün)", () => {
  it.each([
    [new Date(2026, 8, 23, 9, 0), 8],
    [new Date(2026, 8, 16, 9, 0), 1],
    [new Date(2026, 8, 15, 11, 0), 0],
    [new Date(2026, 8, 14, 9, 0), -1],
  ])("alınma %s → kalan %i gün", (alinma, kalan) => {
    expect(yanitKalanGun(alinma.toISOString(), simdi)).toBe(kalan)
  })

  it("süre geçen BEKLIYOR → SURESI_DOLDU; verilmiş yanıt korunur", () => {
    const eski = new Date(2026, 8, 15, 9, 0).toISOString()
    expect(yanitDurumu(fatura({ alinmaTarihi: eski }), simdi)).toBe(
      "SURESI_DOLDU"
    )
    expect(
      yanitDurumu(fatura({ alinmaTarihi: eski, yanit: "KABUL" }), simdi)
    ).toBe("KABUL")
    expect(yanitDurumu(fatura({}), simdi)).toBe("BEKLIYOR")
    expect(yanitDurumu(fatura({ yanit: undefined }), simdi)).toBeUndefined()
  })

  it("yalnızca süresi dolmamış gelen ticari fatura yanıtlanabilir", () => {
    expect(yanitlanabilirMi(fatura({}), simdi)).toBe(true)
    expect(yanitlanabilirMi(fatura({ senaryo: "TEMEL" }), simdi)).toBe(false)
    expect(yanitlanabilirMi(fatura({ yon: "GIDEN" }), simdi)).toBe(false)
    expect(yanitlanabilirMi(fatura({ yanit: "RED" }), simdi)).toBe(false)
    expect(
      yanitlanabilirMi(
        fatura({ alinmaTarihi: new Date(2026, 8, 1).toISOString() }),
        simdi
      )
    ).toBe(false)
  })
})

describe("yardımcılar", () => {
  it("berat dönemi takvim olay id'sine eşlenir", () => {
    expect(beratTakvimId("m_ltd", "2026-06")).toBe(
      "m_ltd:E_DEFTER_BERAT:2026-06"
    )
  })

  it("tutar para birimiyle biçimlenir", () => {
    expect(formatTutar(1234.5)).toBe("₺1.234,50")
    expect(formatTutar(600, "USD")).toBe("$600,00")
  })
})
