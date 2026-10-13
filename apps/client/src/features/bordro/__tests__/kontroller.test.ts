import { describe, expect, it } from "vitest"

import {
  bordroKontrolleri,
  bordroPrimToplami,
  bordroYukumlulugu,
} from "@prime/shared/bordro/kontroller"
import type { BordroOzeti, MizanHesap } from "@prime/shared/types/domain"

const OZET: BordroOzeti = {
  calisanSayisi: 8,
  brutToplam: 300_000,
  netToplam: 231_000,
  sgkIsciPayi: 42_000,
  sgkIsverenPayi: 65_250,
  issizlikToplam: 9_000,
  gelirVergisi: 24_000,
  damgaVergisi: 2_277,
}

const kod = (k: ReturnType<typeof bordroKontrolleri>, kodu: string) =>
  k.find((x) => x.kod === kodu)

describe("bordroKontrolleri", () => {
  it("bağlam yoksa yalnızca net/brüt kontrolü çalışır", () => {
    const k = bordroKontrolleri(OZET)
    expect(k.map((x) => x.kod)).toEqual(["NET_BRUT"])
    expect(k[0]!.durum).toBe("GECTI")
  })

  it("net brütü aşarsa ya da brüt sıfırsa HATA", () => {
    expect(
      kod(bordroKontrolleri({ ...OZET, netToplam: 300_001 }), "NET_BRUT")?.durum
    ).toBe("HATA")
    expect(
      kod(
        bordroKontrolleri({ ...OZET, brutToplam: 0, netToplam: 0 }),
        "NET_BRUT"
      )?.durum
    ).toBe("HATA")
  })

  it("çalışan sayısı mükellef kartından farklıysa UYARI", () => {
    expect(
      kod(bordroKontrolleri(OZET, { mukellefCalisanSayisi: 8 }), "CALISAN")
        ?.durum
    ).toBe("GECTI")
    const k = kod(
      bordroKontrolleri(OZET, { mukellefCalisanSayisi: 6 }),
      "CALISAN"
    )
    expect(k?.durum).toBe("UYARI")
    expect(k?.aciklama).toContain("Bordroda 8, mükellef kartında 6")
  })

  it("yükümlülük ve prim toplamları", () => {
    expect(bordroYukumlulugu(OZET)).toBe(142_527)
    expect(bordroPrimToplami(OZET)).toBe(116_250)
  })

  it("MUHSGK tahakkuku bordro yükümlülüğünden düşükse UYARI; eşit ya da fazlaysa GEÇTİ", () => {
    const hesapla = (tahakkuk: number) =>
      kod(
        bordroKontrolleri(OZET, { muhsgkTahakkuk: tahakkuk }),
        "MUHSGK_TAHAKKUK"
      )!
    expect(hesapla(142_527).durum).toBe("GECTI")
    expect(hesapla(142_526.5).durum).toBe("GECTI") // tolerans
    expect(hesapla(130_000).durum).toBe("UYARI")
    expect(hesapla(130_000).aciklama).toContain("Teşvik")
    const fazla = hesapla(150_000)
    expect(fazla.durum).toBe("GECTI")
    expect(fazla.aciklama).toContain("diğer kesintiler")
  })

  it("mizan yoksa 361/335 kontrolü eklenmez; varsa bakiyeleri karşılaştırır", () => {
    expect(
      bordroKontrolleri(OZET, { mukellefCalisanSayisi: 8 }).some((x) =>
        x.kod.startsWith("MIZAN")
      )
    ).toBe(false)

    const uyumlu: MizanHesap[] = [
      { kod: "361", ad: "Ödenecek SGK", borc: 0, alacak: 116_250 },
      { kod: "335", ad: "Personele borçlar", borc: 0, alacak: 231_000 },
    ]
    const iyi = bordroKontrolleri(OZET, { mizanHesaplari: uyumlu })
    expect(kod(iyi, "MIZAN_361")?.durum).toBe("GECTI")
    expect(kod(iyi, "MIZAN_335")?.durum).toBe("GECTI")

    const kotu = bordroKontrolleri(OZET, {
      mizanHesaplari: [
        { kod: "361", ad: "", borc: 0, alacak: 50_000 },
        { kod: "335", ad: "", borc: 0, alacak: 500_000 },
      ],
    })
    expect(kod(kotu, "MIZAN_361")?.durum).toBe("UYARI")
    expect(kod(kotu, "MIZAN_335")?.durum).toBe("UYARI")

    // Hesap hiç yoksa 361 bakiyesi 0 sayılır
    expect(
      kod(bordroKontrolleri(OZET, { mizanHesaplari: [] }), "MIZAN_361")?.durum
    ).toBe("UYARI")
  })

  it("hiçbir kontrol NET_BRUT dışında HATA üretmez", () => {
    const k = bordroKontrolleri(OZET, {
      mukellefCalisanSayisi: 1,
      muhsgkTahakkuk: 0,
      mizanHesaplari: [],
    })
    expect(k.filter((x) => x.durum === "HATA")).toHaveLength(0)
  })
})
