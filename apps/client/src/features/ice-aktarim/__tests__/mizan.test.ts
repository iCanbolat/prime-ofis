import { describe, expect, it } from "vitest"

import {
  MizanOkumaHatasi,
  hucreSayi,
  mizanKontrolleri,
  mizanOku,
  mizanOzeti,
} from "@prime/shared/ice-aktarim/mizan"
import type { MizanHesap } from "@prime/shared/types/domain"

describe("hücre sayısı", () => {
  it.each([
    [1234.5, 1234.5],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["(1.234,56)", -1234.56],
    ["12,5", 12.5],
    ["1234.5", 1234.5],
    ["1.234", 1234],
    ["₺ 250,00", 250],
    ["", 0],
    [null, 0],
    ["abc", null],
  ])("%s → %s", (girdi, beklenen) => {
    expect(hucreSayi(girdi)).toBe(beklenen)
  })
})

describe("mizan okuma", () => {
  it("başlığı bulur, ana hesapları alır, alt hesapları iki kez saymaz", () => {
    const { hesaplar, atlanan } = mizanOku([
      ["ÇINAR YAZILIM — MİZAN (01.01.2026 - 31.08.2026)"],
      [],
      [
        "Hesap Kodu",
        "Hesap Adı",
        "Borç",
        "Alacak",
        "Borç Bakiye",
        "Alacak Bakiye",
      ],
      ["100", "KASA", "50.000,00", "42.000,00", "8.000,00", ""],
      ["100.01", "TL KASA", "50.000,00", "42.000,00", "8.000,00", ""],
      ["102", "BANKALAR", 200000, 150000, 50000, ""],
      ["320", "SATICILAR", 0, 58000, "", 58000],
      ["", "TOPLAM", 250000, 250000],
    ])
    expect(hesaplar).toEqual([
      { kod: "100", ad: "KASA", borc: 50000, alacak: 42000 },
      { kod: "102", ad: "BANKALAR", borc: 200000, alacak: 150000 },
      { kod: "320", ad: "SATICILAR", borc: 0, alacak: 58000 },
    ])
    expect(atlanan).toBe(1)
  })

  it("iki satırlı başlık ve yalnızca alt hesaplar (ilk alt düzey toplanır)", () => {
    const { hesaplar } = mizanOku([
      ["Kod", "Açıklama", "Tutar", "", "Bakiye", ""],
      ["", "", "Borç", "Alacak", "Borç", "Alacak"],
      ["120.01", "A Müşterisi", "1.000,00", "400,00", "600,00", ""],
      ["120.01.001", "A Şube", "1.000,00", "400,00", "600,00", ""],
      ["120.02", "B Müşterisi", "500,00", "0,00", "500,00", ""],
    ])
    expect(hesaplar).toEqual([{ kod: "120", ad: "", borc: 1500, alacak: 400 }])
  })

  it("başlık yoksa anlaşılır hata", () => {
    expect(() =>
      mizanOku([
        ["a", "b"],
        [1, 2],
      ])
    ).toThrow(MizanOkumaHatasi)
  })
})

const h = (kod: string, borc: number, alacak: number): MizanHesap => ({
  kod,
  ad: "",
  borc,
  alacak,
})

describe("mizan kontrolleri", () => {
  it("denk ve sorunsuz mizan", () => {
    const hesaplar = [h("100", 1000, 200), h("600", 0, 800)]
    expect(mizanKontrolleri(hesaplar)).toEqual([
      expect.objectContaining({ kod: "DENKLIK", durum: "GECTI" }),
      expect.objectContaining({ kod: "KASA", durum: "GECTI" }),
    ])
    expect(mizanOzeti(hesaplar)).toEqual({
      toplamBorc: 1000,
      toplamAlacak: 1000,
      donemSonucu: 800,
    })
  })

  it("dönem sonucu 7xx maliyetlerini yansıtma yapılmış/yapılmamış tek sayar", () => {
    const yansitmasiz = [
      h("102", 7000, 0),
      h("600", 0, 10000),
      h("770", 3000, 0),
    ]
    expect(mizanOzeti(yansitmasiz).donemSonucu).toBe(7000)
    const yansitmali = [
      h("102", 7000, 0),
      h("600", 0, 10000),
      h("632", 3000, 0),
      h("770", 3000, 0),
      h("771", 0, 3000),
    ]
    expect(mizanOzeti(yansitmali).donemSonucu).toBe(7000)
  })

  it("denksizlik, ters kasa/stok, banka, ortak ve KDV mahsubu", () => {
    const kontroller = mizanKontrolleri([
      h("100", 100, 300),
      h("102", 0, 50),
      h("131", 5000, 0),
      h("153", 1000, 1500),
      h("191", 900, 0),
      h("391", 0, 1200),
    ])
    expect(Object.fromEntries(kontroller.map((k) => [k.kod, k.durum]))).toEqual(
      {
        DENKLIK: "HATA",
        KASA: "HATA",
        BANKA: "UYARI",
        STOK: "HATA",
        ORTAK: "UYARI",
        KDV_MAHSUP: "UYARI",
      }
    )
    expect(kontroller[0]!.aciklama).toContain("fark")
  })

  it("360 hesabı dönem tahakkuklarıyla karşılaştırılır (1 TL tolerans)", () => {
    const hesaplar = [
      h("102", 10000, 0),
      h("360", 0, 6749.5),
      h("600", 0, 3250.5),
    ]
    expect(
      mizanKontrolleri(hesaplar, { tahakkukToplami: 6750 }).at(-1)
    ).toMatchObject({ kod: "VERGI_360", durum: "GECTI" })
    expect(
      mizanKontrolleri(hesaplar, { tahakkukToplami: 9869.5 }).at(-1)
    ).toMatchObject({ kod: "VERGI_360", durum: "UYARI" })
    // Tahakkuk yoksa kontrol çalışmaz
    expect(mizanKontrolleri(hesaplar).some((k) => k.kod === "VERGI_360")).toBe(
      false
    )
  })
})
