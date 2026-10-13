import { describe, expect, it } from "vitest"

import {
  KesintiOkumaHatasi,
  acikBorclar,
  aylikSeri,
  cariDurum,
  donemCoz,
  fifoKapat,
  kapatmaHatasi,
  kesintiDurumu,
  kesintiKarsilastir,
  kesintiListesiOku,
  odemeStopaji,
  ucretDonemleri,
  ucretHesapla,
  yaslandirma,
} from "@prime/shared/tahsilat/kurallar"
import type { CariHareket } from "@prime/shared/types/domain"

const borc = (
  id: string,
  tarih: string,
  tutar: number,
  stopaj = 0
): CariHareket => ({
  id,
  mukellefId: "m_1",
  tip: "BORC",
  kalem: "AYLIK_UCRET",
  tarih,
  brut: tutar,
  kdv: 0,
  stopaj,
  tutar,
  olusturanId: "sistem",
  olusturmaTarihi: `${tarih}T09:00:00.000Z`,
})

const odeme = (
  id: string,
  tarih: string,
  tutar: number,
  kapatmalar: CariHareket["kapatmalar"],
  kalem: CariHareket["kalem"] = "ODEME"
): CariHareket => ({
  id,
  mukellefId: "m_1",
  tip: "ODEME",
  kalem,
  tarih,
  brut: 0,
  kdv: 0,
  stopaj: 0,
  tutar,
  kapatmalar,
  olusturanId: "p_1",
  olusturmaTarihi: `${tarih}T09:00:00.000Z`,
})

describe("ücret hesabı", () => {
  it("brüt + KDV − %20 stopaj", () => {
    expect(ucretHesapla(10_000, 20, true)).toEqual({
      brut: 10_000,
      kdv: 2_000,
      stopaj: 2_000,
      net: 10_000,
    })
    expect(ucretHesapla(10_000, 20, false).net).toBe(12_000)
    expect(ucretHesapla(3_333.33, 20, true)).toEqual({
      brut: 3_333.33,
      kdv: 666.67,
      stopaj: 666.67,
      net: 3_333.33,
    })
  })

  it("başlangıç ayından bu aya kadar (dahil) dönemler; yıl sınırı geçilir", () => {
    expect(ucretDonemleri({ baslangicDonem: "2025-11" }, "2026-02-14")).toEqual(
      ["2025-11", "2025-12", "2026-01", "2026-02"]
    )
    expect(ucretDonemleri({ baslangicDonem: "2026-10" }, "2026-09-30")).toEqual(
      []
    )
  })
})

describe("kapatma", () => {
  const hareketler = [
    borc("b1", "2026-06-01", 1000),
    borc("b2", "2026-07-01", 1000),
    borc("b3", "2026-08-01", 1000),
    odeme("o1", "2026-06-10", 1000, [{ borcId: "b1", tutar: 1000 }]),
    odeme("o2", "2026-07-20", 400, [{ borcId: "b2", tutar: 400 }]),
  ]

  it("açık borçlar kalanlarıyla, eskiden yeniye", () => {
    expect(acikBorclar(hareketler)).toEqual([
      { id: "b2", tarih: "2026-07-01", kalan: 600 },
      { id: "b3", tarih: "2026-08-01", kalan: 1000 },
    ])
  })

  it("FIFO en eski borçtan başlar, kısmi kapatır, artanı dağıtmaz", () => {
    const acik = acikBorclar(hareketler)
    expect(fifoKapat(800, acik)).toEqual([
      { borcId: "b2", tutar: 600 },
      { borcId: "b3", tutar: 200 },
    ])
    expect(fifoKapat(2000, acik)).toEqual([
      { borcId: "b2", tutar: 600 },
      { borcId: "b3", tutar: 1000 },
    ])
  })

  it("elle kapatma doğrulaması", () => {
    const acik = acikBorclar(hareketler)
    expect(kapatmaHatasi(600, [{ borcId: "b2", tutar: 600 }], acik)).toBeNull()
    expect(kapatmaHatasi(700, [{ borcId: "b2", tutar: 700 }], acik)).toMatch(
      /kalanını aşıyor/
    )
    expect(kapatmaHatasi(500, [{ borcId: "b3", tutar: 600 }], acik)).toMatch(
      /ödeme tutarını aşıyor/
    )
    expect(kapatmaHatasi(500, [{ borcId: "b1", tutar: 100 }], acik)).toMatch(
      /zaten kapalı/
    )
  })

  it("cari durum: 30 günü geçen açık borç gecikmiş sayılır", () => {
    expect(cariDurum(hareketler, "2026-07-31")).toMatchObject({
      bakiye: 1600,
      acikBorc: 1600,
      enEskiAcik: "2026-07-01",
      gecikmeGun: 30,
      geciken: false,
    })
    expect(cariDurum(hareketler, "2026-08-01").geciken).toBe(true)
  })

  it("yaşlandırma ve aylık seri (düzeltme tahsilata sayılmaz)", () => {
    expect(yaslandirma(acikBorclar(hareketler), "2026-09-15")).toEqual({
      "0-30": 0,
      "31-60": 1000,
      "61-90": 600,
      "90+": 0,
    })
    const seri = aylikSeri(
      [...hareketler, odeme("d1", "2026-08-05", 100, [], "DUZELTME")],
      "2026-08-15",
      3
    )
    expect(seri).toEqual([
      { donem: "2026-06", tahakkuk: 1000, tahsilat: 1000 },
      { donem: "2026-07", tahakkuk: 1000, tahsilat: 400 },
      { donem: "2026-08", tahakkuk: 1000, tahsilat: 0 },
    ])
  })
})

describe("kesinti kontrolü", () => {
  it("ödemenin stopajı kapattığı pay oranında", () => {
    const borclar = new Map([["b1", { tutar: 10_000, stopaj: 2_000 }]])
    expect(
      odemeStopaji({ kapatmalar: [{ borcId: "b1", tutar: 5_000 }] }, borclar)
    ).toBe(1000)
  })

  it("durum tablosu (1 TL tolerans)", () => {
    expect(kesintiDurumu(2000, 2000.5)).toBe("ESLESTI")
    expect(kesintiDurumu(2000, 1000)).toBe("EKSIK")
    expect(kesintiDurumu(2000, 2400)).toBe("FAZLA")
    expect(kesintiDurumu(2000, 0)).toBe("BILDIRILMEMIS")
    expect(kesintiDurumu(0, 600)).toBe("KAYITSIZ")
  })

  it("ödeme dönemine göre mükellef × ay karşılaştırır; bilinmeyen VKN ayrı satır", () => {
    const hareketler = [
      borc("b1", "2026-01-01", 10_000, 2_000),
      borc("b2", "2026-02-01", 10_000, 2_000),
      odeme("o1", "2026-02-05", 10_000, [{ borcId: "b1", tutar: 10_000 }]),
      odeme("o2", "2026-03-05", 10_000, [{ borcId: "b2", tutar: 10_000 }]),
    ]
    const mukellefler = [{ id: "m_1", unvan: "Çınar Ltd.", vkn: "0174520662" }]
    const satirlar = kesintiKarsilastir(
      hareketler,
      mukellefler,
      [
        { vkn: "0174520662", unvan: "Çınar", donem: "2026-02", kesinti: 2000 },
        {
          vkn: "1111111111",
          unvan: "Bilinmeyen",
          donem: "2026-03",
          kesinti: 300,
        },
      ],
      2026
    )
    expect(
      satirlar.map((s) => [s.unvan, s.donem, s.beklenen, s.bildirilen, s.durum])
    ).toEqual([
      ["Bilinmeyen", "2026-03", 0, 300, "KAYITSIZ"],
      ["Çınar Ltd.", "2026-02", 2000, 2000, "ESLESTI"],
      ["Çınar Ltd.", "2026-03", 2000, 0, "BILDIRILMEMIS"],
    ])
  })
})

describe("İVD kesinti listesi okuma", () => {
  it("dönem biçimleri", () => {
    expect(donemCoz("2026/03")).toBe("2026-03")
    expect(donemCoz("03/2026")).toBe("2026-03")
    expect(donemCoz("202603")).toBe("2026-03")
    expect(donemCoz("Mart 2026")).toBe("2026-03")
    expect(donemCoz("15.03.2026")).toBe("2026-03")
    expect(donemCoz(new Date(2026, 2, 15))).toBe("2026-03")
    expect(donemCoz("2026/13")).toBeNull()
  })

  it("başlıktan sütun tespiti; toplam ve geçersiz satırlar atlanır", () => {
    const okuma = kesintiListesiOku([
      ["HAKKINIZDA YAPILAN KESİNTİLER"],
      [],
      [
        "Kesintiyi Yapan VKN",
        "Unvanı",
        "Dönem",
        "Gayrisafi Tutar",
        "Kesinti Tutarı",
      ],
      ["0174520662", "Çınar Yazılım", "2026/02", "10.000,00", "2.000,00"],
      ["9358005601", "Öztürk İnşaat", "Mart 2026", 5000, 1000],
      ["", "TOPLAM", "", "15.000,00", "3.000,00"],
    ])
    expect(okuma.kayitlar).toEqual([
      {
        vkn: "0174520662",
        unvan: "Çınar Yazılım",
        donem: "2026-02",
        matrah: 10_000,
        kesinti: 2_000,
      },
      {
        vkn: "9358005601",
        unvan: "Öztürk İnşaat",
        donem: "2026-03",
        matrah: 5_000,
        kesinti: 1_000,
      },
    ])
    expect(okuma.atlanan).toBe(1)
  })

  it("ayrı Yıl ve Ay sütunları", () => {
    const okuma = kesintiListesiOku([
      ["VKN", "Yıl", "Ay", "Tevkifat"],
      ["0174520662", "2026", "4", "800"],
    ])
    expect(okuma.kayitlar[0]).toMatchObject({ donem: "2026-04", kesinti: 800 })
  })

  it("başlık bulunamazsa anlamlı hata", () => {
    expect(() => kesintiListesiOku([["a", "b"]])).toThrow(KesintiOkumaHatasi)
  })
})
