import { describe, expect, it } from "vitest"

import {
  donemEtiketi,
  isGununeKaydir,
  uygulananTipler,
  yukumlulukleriHesapla,
} from "@prime/shared/takvim/motor"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import type { Mukellef } from "@prime/shared/types/domain"

const [sahis, ltd, as] = FIXTURE_MUKELLEFLER
const yil2026 = { baslangic: "2026-01-01", bitis: "2026-12-31" }

const bul = (
  m: Mukellef,
  tip: string,
  donem: string,
  aralik = { baslangic: "2025-01-01", bitis: "2027-12-31" }
) =>
  yukumlulukleriHesapla(m, aralik).find(
    (y) => y.tip === tip && y.donem === donem
  )

describe("uygulanan yükümlülükler (mükellef türüne göre)", () => {
  it("Şahıs, işletme, aylık KDV, SGK'sız: KDV, geçici, gelir — kurumlar/MUHSGK/Ba-Bs yok", () => {
    expect(uygulananTipler(sahis)).toEqual(["KDV", "GECICI_VERGI", "GELIR"])
  })

  it("Şahıs SGK işyeri açınca MUHSGK eklenir; bilanço esasına geçince Ba-Bs eklenir", () => {
    expect(
      uygulananTipler({ ...sahis, sgkIsyeriVar: true, defterTuru: "BILANCO" })
    ).toEqual(["KDV", "MUHTASAR_SGK", "GECICI_VERGI", "BA_BS", "GELIR"])
  })

  it("Ltd: KDV, MUHSGK, geçici, Ba-Bs, e-Defter, kurumlar — gelir yok", () => {
    expect(uygulananTipler(ltd)).toEqual([
      "KDV",
      "MUHTASAR_SGK",
      "GECICI_VERGI",
      "BA_BS",
      "E_DEFTER_BERAT",
      "KURUMLAR",
    ])
  })

  it("A.Ş. Ltd ile aynı seti alır; e-Defter mükellefi değilse berat yok", () => {
    expect(uygulananTipler(as)).toEqual(uygulananTipler(ltd))
    expect(uygulananTipler({ ...as, eDefterMukellefi: false })).not.toContain(
      "E_DEFTER_BERAT"
    )
  })

  it("KDV mükellefi olmayana KDV üretilmez", () => {
    expect(uygulananTipler({ ...sahis, kdvMukellefi: false })).not.toContain(
      "KDV"
    )
  })
})

describe("son günler", () => {
  it("aylık KDV: izleyen ayın 28'i", () => {
    expect(bul(ltd, "KDV", "2026-09")).toMatchObject({
      sonTarih: "2026-10-28",
      yasalSonTarih: "2026-10-28",
    })
  })

  it("MUHSGK: izleyen ayın 26'sı; Cumartesi → Pazartesi", () => {
    expect(bul(ltd, "MUHTASAR_SGK", "2026-08")).toMatchObject({
      yasalSonTarih: "2026-09-26",
      sonTarih: "2026-09-28",
    })
  })

  it("hafta sonuna denk gelen KDV ilk iş gününe kayar (28 Mart 2026 Cmt → 30 Mart Pzt)", () => {
    expect(bul(ltd, "KDV", "2026-02")).toMatchObject({
      yasalSonTarih: "2026-03-28",
      sonTarih: "2026-03-30",
    })
  })

  it("bayram + hafta sonu zinciri: Nisan 2026 KDV (28 Mayıs Kurban Bayramı) → 1 Haziran Pzt", () => {
    expect(bul(ltd, "KDV", "2026-04")).toMatchObject({
      yasalSonTarih: "2026-05-28",
      sonTarih: "2026-06-01",
    })
  })

  it("arife (yarım gün) kaydırma sebebi değildir: 26 Mayıs 2026 MUHSGK aynı gün kalır", () => {
    expect(bul(ltd, "MUHTASAR_SGK", "2026-04")).toMatchObject({
      sonTarih: "2026-05-26",
    })
  })

  it("yıl dönümü: Aralık 2026 KDV → 28 Ocak 2027", () => {
    expect(bul(ltd, "KDV", "2026-12")).toMatchObject({ sonTarih: "2027-01-28" })
  })

  it("geçici vergi: çeyreği izleyen 2. ayın 17'si; 4. çeyrek beyanı yok", () => {
    expect(bul(ltd, "GECICI_VERGI", "2026-Q1")?.sonTarih).toBe("2026-05-18") // 17 Mayıs Pazar → 18
    expect(bul(ltd, "GECICI_VERGI", "2026-Q2")?.sonTarih).toBe("2026-08-17")
    expect(bul(ltd, "GECICI_VERGI", "2026-Q3")?.sonTarih).toBe("2026-11-17")
    expect(bul(ltd, "GECICI_VERGI", "2026-Q4")).toBeUndefined()
  })

  it("3 aylık KDV yalnızca çeyrek dönemleri için üretilir", () => {
    const ucAylik = { ...sahis, kdvPeriyodu: "UC_AYLIK" as const }
    const kdv = yukumlulukleriHesapla(ucAylik, yil2026).filter(
      (y) => y.tip === "KDV"
    )
    expect(kdv.map((y) => y.donem)).toEqual([
      "2025-Q4",
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
    ])
    expect(kdv.map((y) => y.sonTarih)).toEqual([
      "2026-01-28",
      "2026-04-28",
      "2026-07-28",
      "2026-10-28",
    ])
  })

  it("kurumlar: izleyen yılın 30 Nisan'ı; gelir: 31 Mart", () => {
    expect(bul(ltd, "KURUMLAR", "2025")?.sonTarih).toBe("2026-04-30")
    expect(bul(sahis, "GELIR", "2025")?.sonTarih).toBe("2026-03-31")
  })

  it("Ba-Bs: izleyen ayın son günü (31 Ekim 2026 Cmt → 2 Kasım Pzt)", () => {
    expect(bul(ltd, "BA_BS", "2026-09")).toMatchObject({
      yasalSonTarih: "2026-10-31",
      sonTarih: "2026-11-02",
    })
  })

  it("e-Defter berat: izleyen 3. ayın sonu", () => {
    expect(bul(ltd, "E_DEFTER_BERAT", "2026-09")?.sonTarih).toBe("2026-12-31")
  })
})

describe("aralık", () => {
  it("yalnızca son günü aralığa düşenleri, tarihe göre sıralı döner", () => {
    const eylul = yukumlulukleriHesapla(ltd, {
      baslangic: "2026-09-01",
      bitis: "2026-09-30",
    })
    expect(eylul.map((y) => `${y.sonTarih} ${y.tip} ${y.donem}`)).toEqual([
      "2026-09-28 KDV 2026-08",
      "2026-09-28 MUHTASAR_SGK 2026-08",
      "2026-09-30 BA_BS 2026-08",
      "2026-09-30 E_DEFTER_BERAT 2026-06",
    ])
  })

  it("bir yılda aylık KDV 12 kez görünür", () => {
    expect(
      yukumlulukleriHesapla(ltd, yil2026).filter((y) => y.tip === "KDV")
    ).toHaveLength(12)
  })
})

describe("yardımcılar", () => {
  it("iş gününe kaydırma: iş günü değişmez, tatil zinciri atlanır", () => {
    expect(toYmd(isGununeKaydir(fromYmd("2026-09-23")))).toBe("2026-09-23")
    expect(toYmd(isGununeKaydir(fromYmd("2026-03-20")))).toBe("2026-03-23") // bayram cuma → pazartesi
  })

  it("dönem etiketleri", () => {
    expect(donemEtiketi("2026-09")).toBe("Eylül 2026")
    expect(donemEtiketi("2026-Q3")).toBe("2026/3 (Tem–Eyl)")
    expect(donemEtiketi("2025")).toBe("2025 yılı")
  })
})

describe("kaydirmaNedeni", () => {
  it("tatil adını veya hafta sonunu döner; kaydırma yoksa null", async () => {
    const { kaydirmaNedeni } = await import("@prime/shared/takvim/motor")
    expect(kaydirmaNedeni("2026-05-28", "2026-06-01")).toBe(
      "Kurban Bayramı 2. gün"
    )
    expect(kaydirmaNedeni("2026-03-28", "2026-03-30")).toBe("hafta sonu")
    expect(kaydirmaNedeni("2026-10-28", "2026-10-28")).toBeNull()
  })
})
