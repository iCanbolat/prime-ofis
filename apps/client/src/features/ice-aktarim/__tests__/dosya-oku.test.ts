import { describe, expect, it } from "vitest"

import { bordroOzetiOku } from "@prime/shared/bordro/bordro-oku"
import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"

const csv = (metin: string, ad = "tablo.csv") =>
  new File([metin], ad, { type: "text/csv" })

describe("tabloSatirlari (CSV)", () => {
  it("noktalı virgülle ayrılmış Türkçe ondalıkları bozmadan metin olarak okur", async () => {
    const satirlar = await tabloSatirlari(
      csv("Ad;Tutar\nAli;33030,00\nVeli;1.234,56")
    )
    expect(satirlar).toEqual([
      ["Ad", "Tutar"],
      ["Ali", "33030,00"],
      ["Veli", "1.234,56"],
    ])
  })

  it("baştaki sıfırlar korunur (VKN / TCKN sütunları)", async () => {
    const satirlar = await tabloSatirlari(csv("VKN;Ad\n0123456789;Acme"))
    expect(satirlar[1]).toEqual(["0123456789", "Acme"])
  })

  it("bordro dökümü CSV'si doğru toplanır", async () => {
    const { ozet } = bordroOzetiOku(
      await tabloSatirlari(
        csv(
          [
            "Ad Soyad;Brüt Ücret;Net Ücret;Gelir Vergisi",
            "Ali Veli;33030,00;28075,50;0",
            "Ayşe Kaya;50000;38500;3250,50",
          ].join("\n")
        )
      )
    )
    expect(ozet).toMatchObject({
      calisanSayisi: 2,
      brutToplam: 83_030,
      netToplam: 66_575.5,
      gelirVergisi: 3_250.5,
    })
  })
})
