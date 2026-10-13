import { describe, expect, it } from "vitest"

import {
  bahsedilenleriCoz,
  checklistIlerleme,
  donemGorevleriniPlanla,
  donemSecenekleri,
  gecikmisMi,
  tamamaTasiyabilirMi,
} from "@prime/shared/gorev/kurallar"
import { FIXTURE_MUKELLEFLER } from "@prime/mock-data/fixtures"
import { PERSONEL } from "@prime/mock-data/factories/personel"
import type { GorevChecklistMaddesi, Mukellef } from "@prime/shared/types/domain"

const madde = (tamam: boolean, i: number): GorevChecklistMaddesi => ({
  id: `c${i}`,
  metin: `Madde ${i}`,
  tamam,
})

const [sahis, ltd, as] = FIXTURE_MUKELLEFLER as [Mukellef, Mukellef, Mukellef]

describe("checklistIlerleme", () => {
  it.each([
    [[], { tamam: 0, toplam: 0, yuzde: 0 }],
    [[true, true, false, false], { tamam: 2, toplam: 4, yuzde: 50 }],
    [[true, false, false], { tamam: 1, toplam: 3, yuzde: 33 }],
    [[true, true, true], { tamam: 3, toplam: 3, yuzde: 100 }],
  ])("%j → %j", (durumlar, beklenen) => {
    expect(checklistIlerleme(durumlar.map(madde))).toEqual(beklenen)
  })
})

describe("gecikmisMi", () => {
  it("son tarihi geçmiş ve tamamlanmamış görev gecikmiştir", () => {
    expect(
      gecikmisMi({ sonTarih: "2026-09-22", durum: "DEVAM" }, "2026-09-23")
    ).toBe(true)
    expect(
      gecikmisMi({ sonTarih: "2026-09-23", durum: "DEVAM" }, "2026-09-23")
    ).toBe(false)
    expect(
      gecikmisMi({ sonTarih: "2026-09-01", durum: "TAMAM" }, "2026-09-23")
    ).toBe(false)
  })
})

describe("tamamaTasiyabilirMi", () => {
  const [yonetici, mehmet, zeynep] = PERSONEL
  it("yönetici her görevi, personel yalnızca kendi görevini tamamlayabilir", () => {
    expect(tamamaTasiyabilirMi(yonetici, { atananId: "p_3" })).toBe(true)
    expect(tamamaTasiyabilirMi(mehmet, { atananId: "p_2" })).toBe(true)
    expect(tamamaTasiyabilirMi(mehmet, { atananId: "p_3" })).toBe(false)
    expect(tamamaTasiyabilirMi(zeynep, { atananId: "p_3" })).toBe(true)
    expect(tamamaTasiyabilirMi(null, { atananId: "p_3" })).toBe(false)
  })
})

describe("donemGorevleriniPlanla", () => {
  it("yalnızca yükümlülüğe tabi aktif mükellefleri, takvim son günüyle döner", () => {
    // Şahıs SGK'sız → muhtasar yok
    const plan = donemGorevleriniPlanla(
      FIXTURE_MUKELLEFLER,
      "MUHTASAR_SGK",
      "2026-08",
      new Map()
    )
    expect(plan.map((s) => s.mukellefId)).toEqual(["m_ltd", "m_as"])
    // 26 Eylül 2026 Cumartesi → 28 Eylül
    expect(plan[0]).toMatchObject({ atananId: "p_3", sonTarih: "2026-09-28" })
  })

  it("3 aylık KDV'de yalnızca çeyrek dönemi üretilir", () => {
    const ucAylik = { ...sahis, kdvPeriyodu: "UC_AYLIK" } as Mukellef
    expect(
      donemGorevleriniPlanla([ucAylik], "KDV", "2026-08", new Map())
    ).toEqual([])
    expect(
      donemGorevleriniPlanla([ucAylik], "KDV", "2026-Q2", new Map())
    ).toMatchObject([{ mukellefId: "m_sahis", sonTarih: "2026-07-28" }])
  })

  it("yıllık kurumlar vergisi izleyen yılın Nisan sonuna düşer", () => {
    expect(
      donemGorevleriniPlanla(
        [ltd, as, sahis],
        "KURUMLAR",
        "2025",
        new Map()
      ).map((s) => [s.mukellefId, s.sonTarih])
    ).toEqual([
      ["m_ltd", "2026-04-30"],
      ["m_as", "2026-04-30"],
    ])
  })

  it("mevcut görevi olan mükellef işaretlenir, pasif mükellef dahil edilmez", () => {
    const pasif = { ...as, aktif: false }
    const plan = donemGorevleriniPlanla(
      [sahis, ltd, pasif],
      "KDV",
      "2026-08",
      new Map([["m_ltd:KDV:2026-08", "o_1"]])
    )
    expect(plan.map((s) => [s.mukellefId, s.mevcutGorevId])).toEqual([
      ["m_sahis", undefined],
      ["m_ltd", "o_1"],
    ])
  })
})

describe("bahsedilenleriCoz", () => {
  it("@Ad ve @Ad Soyad bahsetmelerini çözer; kelime içi eşleşmez", () => {
    expect(
      bahsedilenleriCoz("@Zeynep Demir kontrol eder misin? @mehmet", PERSONEL)
    ).toEqual(["p_2", "p_3"])
    expect(bahsedilenleriCoz("@Emreyi arayalım", PERSONEL)).toEqual([])
    expect(bahsedilenleriCoz("e-posta: ayse@buro.com", PERSONEL)).toEqual([])
  })
})

describe("donemSecenekleri", () => {
  it("önerilen dönem geçen aydır", () => {
    const secenekler = donemSecenekleri("2026-09-23")
    expect(secenekler[0]).toEqual({ value: "2026-08", label: "Ağustos 2026" })
    expect(secenekler.map((d) => d.value)).toContain("2026-Q2")
    expect(secenekler.map((d) => d.value)).toContain("2025")
  })
})
