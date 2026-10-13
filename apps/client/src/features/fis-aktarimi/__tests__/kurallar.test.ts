import { describe, expect, it } from "vitest"

import {
  aktarimPaketleri,
  belgeTuruBul,
  ekstreAnahtari,
  ekstreTaslaklari,
  eslemeBul,
  eslemeleriOgren,
  fisHatalari,
  fisTaslagi,
  fisToplamlari,
  lucaDosyaAdi,
  lucaSatirlari,
  mukerrerUyarilari,
  tutarOku,
} from "@prime/shared/fis-aktarimi/kurallar"
import {
  VARSAYILAN_LUCA_SABLONU,
  varsayilanHesapAyari,
} from "@prime/shared/fis-aktarimi/sabitler"
import type { EkstreOkumasi, FisOkumasi } from "@prime/shared/types/domain"

const ayar = varsayilanHesapAyari("m_1")

const fis: FisOkumasi = {
  belgeTarihi: "2026-08-14",
  belgeNo: "BM0001",
  saticiUnvan: "BİM",
  saticiVkn: "1750051846",
  kdvKirilimi: [
    { oran: 1, matrah: 100, kdv: 1 },
    { oran: 20, matrah: 50, kdv: 10 },
  ],
  toplam: 161,
  odeme: "NAKIT",
  guven: 0.95,
}

describe("fisTaslagi", () => {
  it("her KDV oranında matrah gidere, KDV 191'e borç; toplam ödeme türüne göre alacak", () => {
    const t = fisTaslagi(fis, ayar)
    expect(t.satirlar.map((s) => [s.hesapKodu, s.borc, s.alacak])).toEqual([
      ["770.01", 100, 0],
      ["191.01.001", 1, 0],
      ["770.01", 50, 0],
      ["191.01.020", 10, 0],
      ["100.01", 0, 161],
    ])
    expect(t.uyarilar).toEqual([])
    expect(fisHatalari(t)).toEqual([])
    expect(t).toMatchObject({ tarih: "2026-08-14", evrakNo: "BM0001" })
  })

  it("kart → banka, veresiye → satıcı hesabı", () => {
    expect(
      fisTaslagi({ ...fis, odeme: "KART" }, ayar).satirlar.at(-1)?.hesapKodu
    ).toBe("102.01")
    expect(
      fisTaslagi({ ...fis, odeme: "VERESIYE" }, ayar).satirlar.at(-1)?.hesapKodu
    ).toBe("320.01")
  })

  it("satıcı VKN'si için öğrenilmiş eşleme gider hesabını değiştirir", () => {
    const t = fisTaslagi(fis, {
      ...ayar,
      eslemeler: [{ anahtar: "1750051846", hesapKodu: "760.01" }],
    })
    expect(
      t.satirlar.filter((s) => s.eslemeAnahtari).map((s) => s.hesapKodu)
    ).toEqual(["760.01", "760.01"])
  })

  it("tutmayan toplam, düşük güven ve tanımsız KDV oranı uyarı üretir", () => {
    const t = fisTaslagi(
      {
        ...fis,
        toplam: 170,
        guven: 0.5,
        kdvKirilimi: [...fis.kdvKirilimi, { oran: 8, matrah: 10, kdv: 0.8 }],
      },
      ayar
    )
    expect(t.uyarilar).toEqual([
      "%8 KDV için hesap tanımlı değil",
      "Belge toplamı (170.00) KDV kırılımıyla (171.80) tutmuyor",
      "Okuma güveni düşük; tutarları belgeyle karşılaştırın",
    ])
    expect(fisHatalari(t)).toContain("Borç ve alacak toplamları eşit değil")
    expect(fisHatalari(t)).toContain("1 satırda hesap kodu yok")
  })
})

describe("ekstre", () => {
  const ekstre: EkstreOkumasi = {
    banka: "Garanti BBVA",
    donemBas: "2026-08-01",
    donemSon: "2026-08-31",
    hareketler: [
      { tarih: "2026-08-03", aciklama: "SGK PRİM ÖDEMESİ", tutar: -5000 },
      {
        tarih: "2026-08-09",
        aciklama: "EFT GELEN - DELTA-YAZILIM LTD",
        tutar: 1200.5,
      },
    ],
  }

  it("ekstre anahtarı genel bankacılık kelimelerini ve rakamları atar", () => {
    expect(ekstreAnahtari("EFT GİDEN - ABC GIDA LTD 12345")).toBe("ABC GIDA")
    expect(ekstreAnahtari("SGK PRİM ÖDEMESİ")).toBe("SGK PRİM")
  })

  it("eşleme tam kelimeyle ve noktalamadan bağımsız bulunur", () => {
    const e = [{ anahtar: "DELTA YAZILIM", hesapKodu: "120.01" }]
    expect(eslemeBul("EFT GELEN - DELTA-YAZILIM LTD", e)).toBe("120.01")
    expect(eslemeBul("DELTAX YAZILIM", e)).toBeUndefined()
  })

  it("her hareket banka ile karşı hesap arasında çift satır; eşleşmeyen boş kalır", () => {
    const [t] = ekstreTaslaklari(ekstre, {
      ...ayar,
      eslemeler: [{ anahtar: "SGK PRİM", hesapKodu: "361.01" }],
    })
    expect(t!.satirlar.map((s) => [s.hesapKodu, s.borc, s.alacak])).toEqual([
      ["102.01", 0, 5000],
      ["361.01", 5000, 0],
      ["102.01", 1200.5, 0],
      ["", 0, 1200.5],
    ])
    expect(t!.uyarilar).toEqual(["1 hareketin karşı hesabı belirlenemedi"])
    expect(t!.satirlar[3]!.eslemeAnahtari).toBe("DELTA YAZILIM")
    expect(fisHatalari(t!)).toEqual(["1 satırda hesap kodu yok"])
  })

  it("400 satırı aşan ekstre parçalara bölünür", () => {
    const hareketler = Array.from({ length: 450 }, (_, i) => ({
      tarih: "2026-08-10",
      aciklama: `POS ${i}`,
      tutar: 10,
    }))
    const parcalar = ekstreTaslaklari({ ...ekstre, hareketler }, ayar)
    expect(parcalar.map((p) => [p.satirlar.length, p.parca])).toEqual([
      [400, "1/3"],
      [400, "2/3"],
      [100, "3/3"],
    ])
  })
})

describe("doğrulama ve öğrenme", () => {
  it("tutar Türkçe ve noktalı yazımla okunur", () => {
    expect(tutarOku("1.250,50")).toBe(1250.5)
    expect(tutarOku("1250.5")).toBe(1250.5)
    expect(tutarOku(" ")).toBe(0)
    expect(tutarOku("12a")).toBeNaN()
  })

  it("toplamlar kuruş hassasiyetinde hesaplanır", () => {
    expect(
      fisToplamlari([
        { borc: 0.1, alacak: 0 },
        { borc: 0.2, alacak: 0 },
        { borc: 0, alacak: 0.3 },
      ])
    ).toEqual({
      borc: 0.3,
      alacak: 0.3,
      fark: 0,
    })
  })

  it("aynı satırda hem borç hem alacak ya da boş tutar hatadır", () => {
    expect(
      fisHatalari({
        tarih: "2026-02-30",
        satirlar: [
          { hesapKodu: "1", aciklama: "", borc: 5, alacak: 5 },
          { hesapKodu: "2", aciklama: "", borc: 0, alacak: 0 },
        ],
      })
    ).toEqual([
      "Fiş tarihi geçersiz",
      "2 satırda tutar yalnızca borç ya da alacakta olmalı",
    ])
  })

  it("mükerrer okuma ve e-Fatura çakışması uyarılır", () => {
    expect(
      mukerrerUyarilari(
        fis,
        [{ belgeNo: "BM0001", saticiVkn: "1750051846" }],
        [
          {
            yon: "GELEN",
            belgeNo: "BM0001",
            karsiTaraf: { unvan: "BİM", vknTckn: "1750051846" },
          },
        ]
      )
    ).toHaveLength(2)
    expect(
      mukerrerUyarilari(fis, [{ belgeNo: "BM0001", saticiVkn: "999" }], [])
    ).toEqual([])
  })

  it("değişen hesaplar anahtar için öğrenilir, aynı anahtar güncellenir", () => {
    const onceki = [
      {
        hesapKodu: "",
        aciklama: "",
        borc: 1,
        alacak: 0,
        eslemeAnahtari: "SGK PRİM",
      },
      {
        hesapKodu: "770.01",
        aciklama: "",
        borc: 1,
        alacak: 0,
        eslemeAnahtari: "123",
      },
      { hesapKodu: "102.01", aciklama: "", borc: 0, alacak: 2 },
    ]
    const yeni = [
      { ...onceki[0]!, hesapKodu: "361.01" },
      onceki[1]!,
      { ...onceki[2]!, hesapKodu: "100.01" },
    ]
    expect(
      eslemeleriOgren(onceki, yeni, [
        { anahtar: "SGK PRİM", hesapKodu: "360.01" },
      ])
    ).toEqual([{ anahtar: "SGK PRİM", hesapKodu: "361.01" }])
  })
})

describe("Luca dosyası", () => {
  it("fişler 50'şerlik paketlere tarih sırasıyla bölünür", () => {
    const fisler = Array.from({ length: 120 }, (_, i) => ({
      tarih: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    }))
    const paketler = aktarimPaketleri(fisler)
    expect(paketler.map((p) => p.length)).toEqual([50, 50, 20])
    expect(paketler[0]![0]!.tarih).toBe("2026-08-01")
  })

  it("satırlar şablon sütun sırasıyla, fiş başına artan fiş no ile yazılır", () => {
    const satirlar = lucaSatirlari(
      [
        {
          tarih: "2026-08-14",
          aciklama: "BİM",
          evrakNo: "BM1",
          evrakTarihi: "2026-08-14",
          belgeTuru: "EA",
          satirlar: [
            { hesapKodu: "770.01", aciklama: "a", borc: 10, alacak: 0 },
            { hesapKodu: "100.01", aciklama: "b", borc: 0, alacak: 10 },
          ],
        },
        {
          tarih: "2026-08-15",
          aciklama: "X",
          satirlar: [{ hesapKodu: "1", aciklama: "c", borc: 1, alacak: 0 }],
        },
      ],
      { ...VARSAYILAN_LUCA_SABLONU, baslangicFisNo: 7 }
    )
    expect(satirlar[0]).toEqual([
      "Fiş No",
      "Fiş Tarihi",
      "Fiş Açıklama",
      "Hesap Kodu",
      "Evrak No",
      "Evrak Tarihi",
      "Detay Açıklama",
      "Borç",
      "Alacak",
      "Miktar",
      "Belge Türü",
      "Para Birimi",
      "Kur",
      "Döviz Tutar",
    ])
    expect(satirlar[1]).toEqual([
      7,
      "14.08.2026",
      "BİM",
      "770.01",
      "BM1",
      "14.08.2026",
      "a",
      10,
      0,
      "",
      "EA",
      "",
      "",
      "",
    ])
    // Belge türü yoksa muhasebe fişi
    expect(satirlar[3]).toEqual([
      8,
      "15.08.2026",
      "X",
      "1",
      "",
      "",
      "c",
      1,
      0,
      "",
      "MF",
      "",
      "",
      "",
    ])
  })

  it("belge türü gelen e-belgeden bulunur, eşleşme yoksa MF", () => {
    const eb = (tur: "E_FATURA" | "E_ARSIV", belgeNo: string) => ({
      yon: "GELEN" as const,
      tur,
      belgeNo,
      karsiTaraf: { vknTckn: "1234567890", unvan: "X" },
    })
    const ebelgeler = [eb("E_FATURA", "EF1"), eb("E_ARSIV", "EA1")]
    const okuma = (belgeNo: string) => ({ belgeNo, saticiVkn: "1234567890" })
    expect(belgeTuruBul(okuma("EF1"), ebelgeler)).toBe("EF")
    expect(belgeTuruBul(okuma("EA1"), ebelgeler)).toBe("EA")
    expect(belgeTuruBul(okuma("KAGIT1"), ebelgeler)).toBe("MF")
    expect(belgeTuruBul({ belgeNo: "EF1", saticiVkn: "999" }, ebelgeler)).toBe(
      "MF"
    )
  })

  it("dosya adı Türkçe karakterlerden arındırılır", () => {
    expect(lucaDosyaAdi("Çınar Yazılım Ltd. Şti.", "2026-09-24", 2)).toBe(
      "Luca_Cinar-Yazilim-Ltd-Sti_2026-09-24_2.xlsx"
    )
  })
})
