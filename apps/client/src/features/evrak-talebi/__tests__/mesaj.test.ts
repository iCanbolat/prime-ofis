import { describe, expect, it } from "vitest"

import { talepDurumu } from "@prime/shared/evrak-talebi/durum"
import {
  mesajOlustur,
  portalLinki,
  epostaLinki,
  sablonHatasi,
  talepDegiskenleri,
  telefonNormalize,
  whatsappLinki,
} from "@prime/shared/evrak-talebi/mesaj"
import { generateToken } from "@prime/shared/lib/token"
import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"

describe("generateToken", () => {
  it("32 byte → 43 karakter base64url, URL güvenli", () => {
    const token = generateToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("benzersiz üretilir", () => {
    const tokenlar = new Set(Array.from({ length: 500 }, () => generateToken()))
    expect(tokenlar.size).toBe(500)
  })
})

describe("mesajOlustur", () => {
  it("şablon değişkenlerini doldurur", () => {
    const link = portalLinki("abc", "https://ofis.test")
    const mesaj = mesajOlustur(
      VARSAYILAN_SABLONLAR.TALEP,
      talepDegiskenleri({
        mukellefUnvan: "Çınar Yazılım Ltd. Şti.",
        buroAd: "Prime Mali Müşavirlik",
        donem: "2026-08",
        istenenler: ["FIS_FATURA", "BANKA_EKSTRESI"],
        link,
        sonKullanma: "2026-09-30T20:59:59.000Z",
      })
    )
    expect(mesaj).toContain("Merhaba Çınar Yazılım Ltd. Şti.")
    expect(mesaj).toContain("Prime Mali Müşavirlik olarak Ağustos 2026 dönemi")
    expect(mesaj).toContain("aylık fiş / fatura, banka ekstresi")
    expect(mesaj).toContain("https://ofis.test/p/abc")
    expect(mesaj).toContain("Son gün: 30.09.2026")
    expect(mesaj).not.toMatch(/\{\w+\}/)
  })

  it("bilinmeyen değişkenleri boşaltır", () => {
    expect(mesajOlustur("Merhaba {unvan} {yok}!", { unvan: "Ali" })).toBe(
      "Merhaba Ali !"
    )
  })
})

describe("telefon ve paylaşım bağlantıları", () => {
  it.each([
    ["05321234567", "905321234567"],
    ["0532 123 45 67", "905321234567"],
    ["+90 532 123 45 67", "905321234567"],
    ["5321234567", "905321234567"],
    ["(0532) 123-45-67", "905321234567"],
  ])("%s → %s", (girdi, beklenen) => {
    expect(telefonNormalize(girdi)).toBe(beklenen)
  })

  it("geçersiz numara null döner", () => {
    expect(telefonNormalize("12345")).toBeNull()
    expect(whatsappLinki("12345", "x")).toBeNull()
  })

  it("wa.me ve mailto bağlantıları normalize adres ve kodlanmış metin içerir", () => {
    expect(whatsappLinki("0532 123 45 67", "Merhaba & link")).toBe(
      "https://wa.me/905321234567?text=Merhaba%20%26%20link"
    )
    expect(epostaLinki(" ali@veli.com ", "Evrak talebi", "Selam & link")).toBe(
      "mailto:ali@veli.com?subject=Evrak%20talebi&body=Selam%20%26%20link"
    )
    expect(epostaLinki("gecersiz", "k", "m")).toBeNull()
  })

  it("şablon kuralları: TALEP/RED {link}, borç hatırlatma {bakiye} ister", () => {
    expect(sablonHatasi("TALEP", "Merhaba")).toMatch(/\{link\}/)
    expect(sablonHatasi("TAHAKKUK", "Tahakkuk {tutar}")).toBeNull()
    expect(sablonHatasi("BORC_HATIRLATMA", "Borç")).toMatch(/\{bakiye\}/)
    expect(sablonHatasi("RED", "  ")).toBe("Şablon boş olamaz")
  })
})

describe("talepDurumu", () => {
  const simdi = new Date("2026-09-23T10:00:00Z")
  it("aktif ve süresi geçmişse SURESI_DOLDU", () => {
    expect(
      talepDurumu(
        { durum: "AKTIF", sonKullanma: "2026-09-22T20:59:59Z" },
        simdi
      )
    ).toBe("SURESI_DOLDU")
    expect(
      talepDurumu(
        { durum: "AKTIF", sonKullanma: "2026-09-24T20:59:59Z" },
        simdi
      )
    ).toBe("AKTIF")
    expect(
      talepDurumu(
        { durum: "TAMAMLANDI", sonKullanma: "2026-09-01T00:00:00Z" },
        simdi
      )
    ).toBe("TAMAMLANDI")
  })
})
