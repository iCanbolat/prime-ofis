import { describe, expect, it } from "vitest"

import { BordroOkumaHatasi, bordroOzetiOku } from "@prime/shared/bordro/bordro-oku"

const BASLIK = [
  "Sıra",
  "Ad Soyad",
  "Brüt Ücret",
  "SGK İşçi Payı",
  "SGK İşveren Payı",
  "İşsizlik Sigortası",
  "Gelir Vergisi",
  "Damga Vergisi",
  "Net Ücret",
]

describe("bordroOzetiOku", () => {
  it("çalışan satırlarını toplar; Türkçe sayı biçimlerini okur", () => {
    const { ozet, satirSayisi, toplamSatirindan, eksikSutunlar } =
      bordroOzetiOku([
        ["Ağustos 2026 bordro dökümü"],
        BASLIK,
        [
          1,
          "Ali Veli",
          "33.030,00",
          "4.624,20",
          "7.184,03",
          "990,90",
          "0",
          "250,70",
          "28.075,50",
        ],
        [2, "Ayşe Kaya", 50000, 7000, 10875, 1500, "3.250,50", 379.5, 38000],
        ["", "", "", "", "", "", "", "", ""],
      ])
    expect(satirSayisi).toBe(2)
    expect(toplamSatirindan).toBe(false)
    expect(eksikSutunlar).toEqual([])
    expect(ozet).toEqual({
      calisanSayisi: 2,
      brutToplam: 83_030,
      netToplam: 66_075.5,
      sgkIsciPayi: 11_624.2,
      sgkIsverenPayi: 18_059.03,
      issizlikToplam: 2_490.9,
      gelirVergisi: 3_250.5,
      damgaVergisi: 630.2,
    })
  })

  it("dosyada TOPLAM satırı varsa onu alır ve çalışan sayısına katmaz", () => {
    const { ozet, toplamSatirindan } = bordroOzetiOku([
      BASLIK,
      [1, "A", 1000, 140, 217.5, 30, 50, 7.59, 770],
      [2, "B", 2000, 280, 435, 60, 100, 15.18, 1540],
      ["", "TOPLAM", 3000, 420, 652.5, 90, 150, 22.77, 2310],
    ])
    expect(toplamSatirindan).toBe(true)
    expect(ozet).toMatchObject({
      calisanSayisi: 2,
      brutToplam: 3000,
      netToplam: 2310,
      damgaVergisi: 22.77,
    })
  })

  it("işçi ve işveren işsizlik sütunlarını birleştirir; eksik isteğe bağlı sütunları bildirir", () => {
    const { ozet, eksikSutunlar } = bordroOzetiOku([
      ["Personel", "Brüt", "Net", "İşsizlik İşçi", "İşsizlik İşveren"],
      ["A", 1000, 800, 10, 20],
    ])
    expect(ozet.issizlikToplam).toBe(30)
    expect(eksikSutunlar).toEqual([
      "SGK İşçi Payı",
      "SGK İşveren Payı",
      "Gelir Vergisi",
      "Damga Vergisi",
    ])
    expect(ozet.sgkIsciPayi).toBe(0)
  })

  it("brüt/net sütunu yoksa ya da çalışan satırı yoksa açıklayıcı hata verir", () => {
    expect(() =>
      bordroOzetiOku([
        ["Ad", "Maaş"],
        ["A", 1],
      ])
    ).toThrow(BordroOkumaHatasi)
    expect(() => bordroOzetiOku([BASLIK])).toThrow(
      "Dosyada çalışan satırı bulunamadı"
    )
  })

  it("çalışan adı ve kimlik bilgisi çıktıda yer almaz", () => {
    const { ozet } = bordroOzetiOku([
      ["TCKN", "Ad Soyad", "Brüt Ücret", "Net Ücret"],
      ["12345678901", "Gizli Kişi", 1000, 800],
    ])
    expect(JSON.stringify(ozet)).not.toMatch(/Gizli|12345678901/)
  })
})
