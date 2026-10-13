import { describe, expect, it } from "vitest"

import {
  hareketSonTarih,
  hareketUyari,
} from "@prime/shared/bordro/hareket-kurallari"

describe("hareketSonTarih", () => {
  it("işe girişte son gün başlama günüdür; tatile kaydırılmaz", () => {
    // 26 Eylül 2026 Cumartesi
    expect(hareketSonTarih("GIRIS", "2026-09-26")).toBe("2026-09-26")
  })

  it("çıkışta ayrılıştan 10 gün sonradır; tatile rastlarsa ilk iş gününe uzar", () => {
    expect(hareketSonTarih("CIKIS", "2026-09-10")).toBe("2026-09-21") // 20 Eyl Pazar → 21 Pzt
    expect(hareketSonTarih("CIKIS", "2026-09-14")).toBe("2026-09-24") // Perşembe
  })

  it("resmî tatile rastlayan son gün de kayar", () => {
    // 23 Nisan 2026 Perşembe (Ulusal Egemenlik); 13 Nisan + 10
    expect(hareketSonTarih("CIKIS", "2026-04-13")).toBe("2026-04-24")
  })
})

describe("hareketUyari", () => {
  it("bildirilmiş kayıt uyarı vermez", () => {
    expect(hareketUyari("BILDIRILDI", "2026-09-01", "2026-09-23")).toBe("YOK")
  })

  it("son gün geçtiyse gecikti; son güne 1 iş günü kala yaklaşıyor", () => {
    expect(hareketUyari("BEKLIYOR", "2026-09-22", "2026-09-23")).toBe("GECIKTI")
    expect(hareketUyari("BEKLIYOR", "2026-09-23", "2026-09-23")).toBe(
      "YAKLASIYOR"
    )
    expect(hareketUyari("BEKLIYOR", "2026-09-24", "2026-09-23")).toBe(
      "YAKLASIYOR"
    )
    expect(hareketUyari("BEKLIYOR", "2026-09-25", "2026-09-23")).toBe("YOK")
  })
})
