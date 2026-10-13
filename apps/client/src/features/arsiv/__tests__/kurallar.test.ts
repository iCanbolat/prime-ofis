import { describe, expect, it } from "vitest"

import {
  agacOlustur,
  dosyaDogrula,
  dosyaMimeTuru,
  eksikZorunlu,
  formatBoyut,
  gecerlilikDurumu,
} from "@prime/shared/arsiv/kurallar"
import { FIXTURE_ARSIV, FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"

const BUGUN = "2026-09-23"

describe("gecerlilikDurumu", () => {
  it.each([
    ["2026-10-13", "YAKINDA"], // 20 gün
    ["2026-10-23", "YAKINDA"], // tam 30 gün
    ["2026-10-24", "GECERLI"],
    ["2026-09-23", "YAKINDA"], // bugün doluyor
    ["2026-09-22", "DOLDU"],
  ])("%s → %s", (tarih, beklenen) => {
    expect(gecerlilikDurumu(tarih, BUGUN)).toBe(beklenen)
  })
})

describe("dosyaDogrula", () => {
  const dosya = (name: string, type: string, size = 1000) => ({
    name,
    type,
    size,
  })

  it("PDF, JPG, PNG ve HEIC kabul edilir", () => {
    expect(dosyaDogrula(dosya("a.pdf", "application/pdf"))).toBeNull()
    expect(dosyaDogrula(dosya("a.jpg", "image/jpeg"))).toBeNull()
    expect(dosyaDogrula(dosya("a.png", "image/png"))).toBeNull()
    // Bazı tarayıcılar HEIC için MIME türü vermez → uzantıdan çözülür
    expect(dosyaDogrula(dosya("IMG_1.HEIC", ""))).toBeNull()
    expect(dosyaMimeTuru(dosya("IMG_1.HEIC", ""))).toBe("image/heic")
  })

  it("desteklenmeyen tür ve 10 MB üstü reddedilir", () => {
    expect(
      dosyaDogrula(
        dosya(
          "rapor.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      )
    ).toMatch(/Desteklenmeyen/)
    expect(
      dosyaDogrula(dosya("buyuk.pdf", "application/pdf", 11 * 1024 * 1024))
    ).toMatch(/10 MB/)
    expect(dosyaDogrula(dosya("bos.pdf", "application/pdf", 0))).toMatch(/boş/)
  })
})

describe("eksikZorunlu / agacOlustur", () => {
  const [sahis, ltd, as] = FIXTURE_MUKELLEFLER as [never, never, never]

  it("imza sirküleri olmayan Ltd'de eksik listelenir", () => {
    expect(eksikZorunlu(ltd, FIXTURE_ARSIV)).toEqual(["IMZA_SIRKULERI"])
    expect(eksikZorunlu(as, FIXTURE_ARSIV)).toEqual([])
    expect(eksikZorunlu(sahis, FIXTURE_ARSIV)).toEqual([])
  })

  it("çöp kutusundaki dosya zorunlu evrak sayılmaz", () => {
    const dosyalar = FIXTURE_ARSIV.map((d) =>
      d.id === "d_sahis_kimlik" ? { ...d, silindi: true } : d
    )
    expect(eksikZorunlu(sahis, dosyalar)).toEqual(["KIMLIK"])
  })

  it("ağaç mükellef ve kategori sayılarını doğru üretir, unvana göre sıralar", () => {
    const agac = agacOlustur(FIXTURE_MUKELLEFLER, FIXTURE_ARSIV)
    expect(agac.map((m) => [m.mukellefId, m.toplam])).toEqual([
      ["m_sahis", 2],
      ["m_ltd", 3],
      ["m_as", 3],
    ])
    expect(agac[0]!.kategoriler).toEqual({ VERGI_LEVHASI: 1, KIMLIK: 1 })
  })
})

it("formatBoyut", () => {
  expect(formatBoyut(500)).toBe("500 B")
  expect(formatBoyut(245_760)).toBe("240 KB")
  expect(formatBoyut(3_500_000)).toBe("3,3 MB")
})
