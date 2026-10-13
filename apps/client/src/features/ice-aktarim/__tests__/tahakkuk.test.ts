import { describe, expect, it } from "vitest"

import {
  donemGecerliMi,
  tahakkukOku,
  takvimDonemi,
} from "@prime/shared/ice-aktarim/tahakkuk"

/** pdf.js'in satır satır çıkardığı metne benzer örnek (e-Beyanname tahakkuk fişi) */
const KDV_FISI = `T.C. HAZİNE VE MALİYE BAKANLIĞI
GELİR İDARESİ BAŞKANLIĞI
TAHAKKUK FİŞİ
Vergi Dairesi: KOZYATAĞI VERGİ DAİRESİ
Vergi Kimlik Numarası: 0174520662
Soyadı (Unvanı): ÇINAR YAZILIM SAN. VE TİC. LTD. ŞTİ.
Beyannamenin Türü: KDV1
Vergilendirme Dönemi: 08/2026 - 08/2026
Tahakkuk Fişi No: 2026091612345678
Onay Zamanı: 16/09/2026 14:32:10
Vergi Kodu Vergi Adı Matrah Tahakkuk Eden Mahsup Edilen Ödenecek Vade Tarihi
0015 GERÇEK USULDE KATMA DEĞER VERGİSİ 125.000,00 25.000,00 18.250,50 6.749,50 28/09/2026
1048 5035 SAYILI KANUNA GÖRE DAMGA VERGİSİ 0,00 0,00 0,00 0,00 28/09/2026
TOPLAM 25.000,00 18.250,50 6.749,50`

describe("tahakkuk fişi ayrıştırma", () => {
  it("KDV fişinden kimlik, tür, dönem, tahakkuk no, ödenecek ve vade", () => {
    expect(tahakkukOku(KDV_FISI)).toEqual({
      vknTckn: "0174520662",
      beyannameKodu: "KDV1",
      tip: "KDV",
      donem: "2026-08",
      tahakkukNo: "2026091612345678",
      odenecek: 6749.5,
      vade: "2026-09-28",
      uyarilar: [],
    })
  })

  it("üç aylık KDV ve geçici vergi çeyreğe, kurumlar yıla çevrilir", () => {
    expect(
      tahakkukOku(KDV_FISI.replace("08/2026 - 08/2026", "04/2026 - 06/2026"))
        .donem
    ).toBe("2026-Q2")
    const gecici = tahakkukOku(
      KDV_FISI.replace("KDV1", "KGECICI").replace(
        "08/2026 - 08/2026",
        "04/2026 - 06/2026"
      )
    )
    expect(gecici).toMatchObject({ tip: "GECICI_VERGI", donem: "2026-Q2" })
    expect(
      takvimDonemi("KURUMLAR", { yil: 2025, ay: 1 }, { yil: 2025, ay: 12 })
    ).toBe("2025")
  })

  it("kod yazmayan fişte başlıktan tür; ay adıyla dönem; 'Gelir İdaresi' GELIR sanılmaz", () => {
    const sonuc = tahakkukOku(`GELİR İDARESİ BAŞKANLIĞI
MUHTASAR VE PRİM HİZMET BEYANNAMESİ TAHAKKUK FİŞİ
T.C. Kimlik No: 10000000146
Dönem: Ağustos 2026
TOPLAM 3.120,00`)
    expect(sonuc).toMatchObject({
      vknTckn: "10000000146",
      beyannameKodu: "MUHSGK",
      tip: "MUHTASAR_SGK",
      donem: "2026-08",
      odenecek: 3120,
      vade: undefined,
    })
  })

  it("izlenmeyen tür ve eksik alanlar uyarı olarak döner", () => {
    const sonuc = tahakkukOku("Beyannamenin Türü: DAMGA\nOnay: 16/09/2026")
    expect(sonuc.tip).toBeUndefined()
    // dd/MM/yyyy tarihinin "09/2026" kısmı dönem sanılmaz
    expect(sonuc.donem).toBeUndefined()
    expect(sonuc.uyarilar).toEqual([
      "Vergi kimlik numarası bulunamadı",
      "DAMGA beyannamesi takvimde izlenmiyor",
      "Dönem bulunamadı",
      "Ödenecek tutar bulunamadı",
    ])
  })

  it("dönem biçimi yükümlülüğe göre doğrulanır", () => {
    expect(donemGecerliMi("KDV", "2026-08")).toBe(true)
    expect(donemGecerliMi("KDV", "2026-Q3")).toBe(true)
    expect(donemGecerliMi("MUHTASAR_SGK", "2026-Q3")).toBe(false)
    expect(donemGecerliMi("GECICI_VERGI", "2026-06")).toBe(false)
    expect(donemGecerliMi("KURUMLAR", "2025")).toBe(true)
  })
})
