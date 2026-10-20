import { describe, expect, it } from "vitest"

import { bakiyeleriOku } from "@prime/shared/ice-aktarim/bakiye-okuma"
import { sifreleriOku } from "@prime/shared/ice-aktarim/sifre-okuma"
import {
  SutunHatasi,
  donemHucresi,
  evetHayir,
  kimlikNo,
  sutunlariEslestir,
  tarihHucresi,
} from "@prime/shared/ice-aktarim/sutun-eslestir"
import { generateTckn, generateVkn } from "@prime/shared/lib/tax-id"
import {
  FIXTURE_MUKELLEFLER,
  FIXTURE_UCRETLER,
} from "@prime/mock-data/fixtures"
import type { Mukellef } from "@prime/shared/types/domain"

const YENI_VKN = generateVkn(() => 0.37)
/** Kontrol hanesi bozuk VKN */
const GECERSIZ_VKN = `${YENI_VKN.slice(0, 9)}${(Number(YENI_VKN[9]) + 1) % 10}`
const YENI_TCKN = generateTckn(() => 0.42)
const mukellefler: Mukellef[] = FIXTURE_MUKELLEFLER.map((m) =>
  FIXTURE_UCRETLER[m.id] ? { ...m, ucret: FIXTURE_UCRETLER[m.id] } : m
)

describe("sutunlariEslestir", () => {
  const tanimlar = [
    { anahtar: "unvan", baslik: "Unvan", zorunlu: true },
    { anahtar: "kimlik", baslik: "VKN/TCKN", esAdlar: ["Vergi No"] },
  ]

  it("başlığı Türkçe karakter, büyük/küçük harf ve noktalamadan bağımsız bulur; üstteki başlık satırlarını atlar", () => {
    const { indeks, baslikSatiri } = sutunlariEslestir(
      [["Müşteri listesi"], [], ["", "vergi no.", "ÜNVAN"]],
      tanimlar
    )
    expect(baslikSatiri).toBe(2)
    expect(indeks).toEqual({ unvan: 2, kimlik: 1 })
  })

  it("zorunlu sütun yoksa eksik sütunu söyler", () => {
    expect(() => sutunlariEslestir([["VKN/TCKN", "Adres"]], tanimlar)).toThrow(
      new SutunHatasi("Zorunlu sütun bulunamadı: Unvan")
    )
  })
})

describe("hücre yardımcıları", () => {
  it("kimlikNo: Excel'in düşürdüğü baştaki sıfırı tamamlar, algoritmayı doğrular", () => {
    expect(kimlikNo(174520662)).toEqual({ vkn: "0174520662" })
    expect(kimlikNo("017 452 0662")).toEqual({ vkn: "0174520662" })
    expect(kimlikNo(YENI_TCKN)).toEqual({ tckn: YENI_TCKN })
    expect(kimlikNo(GECERSIZ_VKN)).toBeNull()
  })

  it("evetHayir, tarih ve dönem biçimleri", () => {
    expect([evetHayir("Evet"), evetHayir("x"), evetHayir("hayır")]).toEqual([
      true,
      true,
      false,
    ])
    expect(evetHayir("belki")).toBeUndefined()
    expect(tarihHucresi("30.09.2026")).toBe("2026-09-30")
    expect(tarihHucresi(46295)).toBe("2026-09-30")
    expect(tarihHucresi("31.02.2026")).toBeNull()
    expect(donemHucresi("10/2026")).toBe("2026-10")
    expect(donemHucresi("Ekim 2026")).toBe("2026-10")
    expect(donemHucresi("2026-13")).toBeNull()
  })
})

describe("sifreleriOku", () => {
  const baslik = [
    "VKN/TCKN",
    "Unvan",
    "GİB Kullanıcı Kodu",
    "GİB Parola",
    "GİB Şifre",
    "İVD Şifre",
    "SGK Kullanıcı Adı",
    "SGK Sistem Şifresi",
    "SGK İşyeri Şifresi",
  ]
  const oku = (uzerineYaz: boolean, ...satirlar: unknown[][]) =>
    sifreleriOku([baslik, ...satirlar], {
      mukellefler,
      mevcut: new Set(["m_ltd:GIB"]),
      uzerineYaz,
    })

  it("geniş satırı sistem başına kayda çevirir; İVD kullanıcı adı boşsa VKN kullanılır", () => {
    const sonuc = oku(false, [
      "",
      "öztürk inşaat a.ş.",
      "111",
      "p1",
      "s1",
      "ivd",
      "sgk",
      "",
      "is",
    ])
    expect(sonuc.map((s) => [s.etiket, s.durum])).toEqual([
      ["Öztürk İnşaat A.Ş. · GİB", "aktarilacak"],
      ["Öztürk İnşaat A.Ş. · İnteraktif VD", "aktarilacak"],
      ["Öztürk İnşaat A.Ş. · SGK", "hatali"],
    ])
    expect(sonuc[0]!.veri).toEqual({
      mukellefId: "m_as",
      sistem: "GIB",
      kullaniciAdi: "111",
      secret: { sifre: "p1", ekSifre: "s1" },
      not: undefined,
    })
    expect(sonuc[1]!.veri!.kullaniciAdi).toBe("9358005601")
    expect(sonuc[2]!.mesajlar).toEqual(["Eksik: Sistem şifresi"])
  })

  it("kasada kayıtlı sistem varsayılan olarak atlanır, üzerine yaz seçilince güncellenir", () => {
    const satir = ["0174520662", "", "k", "p", "", "", "", "", ""]
    expect(oku(false, satir)[0]).toMatchObject({
      durum: "atlanacak",
      mesajlar: ["Kasada kayıtlı"],
    })
    expect(oku(true, satir)[0]).toMatchObject({
      durum: "aktarilacak",
      mesajlar: ["Kasadaki kayıt güncellenecek"],
    })
  })

  it("mükellef bulunamazsa satır hatalıdır", () => {
    expect(oku(false, [YENI_VKN, "", "k", "p"])[0]).toMatchObject({
      durum: "hatali",
      mesajlar: ["Mükellef bulunamadı; önce mükellefleri aktarın"],
    })
  })
})

describe("bakiyeleriOku", () => {
  const oku = (uzerineYaz: boolean, ...satirlar: unknown[][]) =>
    bakiyeleriOku(
      [
        [
          "VKN/TCKN",
          "Aylık Brüt Ücret",
          "KDV %",
          "Stopaj",
          "Başlangıç",
          "Bakiye",
          "Bakiye Tarihi",
        ],
        ...satirlar,
      ],
      { mukellefler, bugun: "2026-09-23", uzerineYaz }
    )

  it("başlangıç dönemi boşsa bakiye tarihinden sonraki ay; stopaj varsayılanı türe göre", () => {
    const [as, sahis] = oku(
      false,
      ["9358005601", "7.500,00", "", "", "", "12500", "30.09.2026"],
      ["10000000146", 3000, "%10", "", "", -500, ""]
    )
    expect(as!.veri).toEqual({
      mukellefId: "m_as",
      ucret: {
        aylikBrut: 7500,
        kdvOrani: 20,
        stopajVar: true,
        baslangicDonem: "2026-10",
      },
      bakiye: { tutar: 12500, tarih: "2026-09-30" },
    })
    expect(sahis!.veri).toMatchObject({
      ucret: { kdvOrani: 10, stopajVar: false, baslangicDonem: "2026-10" },
      bakiye: { tutar: -500, tarih: "2026-09-23" },
    })
  })

  it("tanımlı ücret üzerine yazılmadıkça korunur; yalnızca bakiye aktarılır", () => {
    const satir = ["0174520662", 12000, "", "", "", 2000, ""]
    const [s] = oku(false, satir)
    expect(s!.durum).toBe("aktarilacak")
    expect(s!.veri!.ucret).toBeUndefined()
    expect(s!.mesajlar).toEqual(["Ücret zaten tanımlı, değiştirilmeyecek"])
    expect(oku(true, satir)[0]!.veri!.ucret?.aylikBrut).toBe(12000)
  })

  it("geçersiz KDV oranı ve tarih hatalıdır", () => {
    expect(
      oku(false, ["9358005601", 1000, 18, "", "", "", "32.13.2026"])[0]
    ).toMatchObject({
      durum: "hatali",
      mesajlar: [
        "Bakiye tarihi geçersiz: 32.13.2026",
        "KDV oranı 20, 10, 1 veya 0 olmalı: 18",
        "Başlangıç dönemi geçersiz: ",
      ],
    })
  })
})
