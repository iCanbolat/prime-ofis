import { describe, expect, it } from "vitest"

import {
  BOS_MUKELLEF_FORMU,
  formValuesToInput,
  mukellefFormSchema,
  mukellefToFormValues,
  type MukellefFormValues,
} from "@prime/shared/mukellef/schemas"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"

const gecerliLtd: MukellefFormValues = {
  ...BOS_MUKELLEF_FORMU,
  tur: "LTD",
  unvan: "Deneme Yazılım Ltd. Şti.",
  vkn: "0174520662",
  vergiDairesi: "Kadıköy",
  telefon: "0532 123 45 67",
  il: "İstanbul",
  ilce: "Kadıköy",
  naceKodu: "62.01.01",
  faaliyet: "Yazılım",
  sorumluPersonelId: "p_1",
}

function hatalar(values: MukellefFormValues) {
  const result = mukellefFormSchema.safeParse(values)
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((i) => [i.path.join("."), i.message])
  )
}

describe("mukellefFormSchema", () => {
  it("geçerli Ltd kaydını kabul eder", () => {
    expect(hatalar(gecerliLtd)).toEqual({})
  })

  it("Şahıs için TCKN zorunlu, VKN aranmaz", () => {
    const sahis = {
      ...gecerliLtd,
      tur: "SAHIS" as const,
      vkn: "",
      defterTuru: "ISLETME" as const,
    }
    expect(hatalar(sahis)).toEqual({ tckn: "TCKN zorunludur" })
    expect(hatalar({ ...sahis, tckn: "10000000146" })).toEqual({})
  })

  it("geçersiz TCKN/VKN algoritma kontrolünden geçmez", () => {
    expect(hatalar({ ...gecerliLtd, vkn: "0174520663" })).toHaveProperty("vkn")
    expect(
      hatalar({
        ...gecerliLtd,
        tur: "SAHIS",
        defterTuru: "ISLETME",
        tckn: "10000000147",
      })
    ).toHaveProperty("tckn")
  })

  it("Ltd/A.Ş. için VKN zorunlu; MERSİS verilirse 16 hane", () => {
    expect(hatalar({ ...gecerliLtd, vkn: "" })).toEqual({
      vkn: "VKN zorunludur",
    })
    expect(hatalar({ ...gecerliLtd, mersisNo: "123" })).toHaveProperty(
      "mersisNo"
    )
  })

  it("3 aylık KDV yalnızca işletme defteri tutan şahıslara açık", () => {
    expect(hatalar({ ...gecerliLtd, kdvPeriyodu: "UC_AYLIK" })).toHaveProperty(
      "kdvPeriyodu"
    )
    expect(
      hatalar({
        ...gecerliLtd,
        tur: "SAHIS",
        tckn: "10000000146",
        defterTuru: "ISLETME",
        kdvPeriyodu: "UC_AYLIK",
      })
    ).toEqual({})
  })

  it("çalışanı olan mükellefte SGK işyeri kaydı zorunlu", () => {
    expect(
      hatalar({ ...gecerliLtd, calisanSayisi: 3, sgkIsyeriVar: false })
    ).toHaveProperty("sgkIsyeriVar")
    expect(
      hatalar({ ...gecerliLtd, calisanSayisi: 3, sgkIsyeriVar: true })
    ).toEqual({})
  })

  it("telefon, e-posta, NACE ve sorumlu doğrulanır", () => {
    const e = hatalar({
      ...gecerliLtd,
      telefon: "123",
      eposta: "gecersiz",
      naceKodu: "62",
      sorumluPersonelId: "",
    })
    expect(Object.keys(e).sort()).toEqual([
      "eposta",
      "naceKodu",
      "sorumluPersonelId",
      "telefon",
    ])
    expect(hatalar({ ...gecerliLtd, eposta: "" })).toEqual({})
  })
})

describe("form ↔ API dönüşümü", () => {
  it("Şahıs'a geçilen kayıtta şirket alanları atılır, telefon normalize edilir", () => {
    const input = formValuesToInput({
      ...gecerliLtd,
      tur: "SAHIS",
      tckn: "10000000146",
      ticaretSicilNo: "12345",
      mersisNo: "0123456789012345",
      defterTuru: "ISLETME",
    })
    expect(input).toMatchObject({
      tckn: "10000000146",
      telefon: "05321234567",
      defterTuru: "ISLETME",
    })
    expect(input.vkn).toBeUndefined()
    expect(input.ticaretSicilNo).toBeUndefined()
    expect(input.mersisNo).toBeUndefined()
  })

  it("şirkette TCKN atılır, defter türü bilanço olur", () => {
    const input = formValuesToInput({
      ...gecerliLtd,
      tckn: "10000000146",
      defterTuru: "ISLETME",
    })
    expect(input.tckn).toBeUndefined()
    expect(input.defterTuru).toBe("BILANCO")
  })

  it("mevcut mükellef forma dönüştürülüp geri çevrilince aynı kalır", () => {
    for (const m of FIXTURE_MUKELLEFLER) {
      const { id: _id, olusturmaTarihi: _t, ...beklenen } = m
      const input = formValuesToInput(mukellefToFormValues(m))
      expect(
        mukellefFormSchema.safeParse(mukellefToFormValues(m)).success
      ).toBe(true)
      // Tercih kanalı olmayan mükellef formda varsayılan WhatsApp ile döner
      expect(JSON.parse(JSON.stringify(input))).toEqual(
        JSON.parse(JSON.stringify({ tercihKanal: "WHATSAPP", ...beklenen }))
      )
    }
  })
})
