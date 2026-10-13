import { describe, expect, it } from "vitest"

import {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDonem,
  formatPhone,
  formatTRY,
  initials,
  maskTaxId,
} from "@prime/shared/lib/format"

describe("formatTRY", () => {
  it("Türk lirası biçiminde yazar", () => {
    expect(formatTRY(1234.5)).toBe("₺1.234,50")
    expect(formatTRY(0)).toBe("₺0,00")
  })
})

describe("tarih biçimleri", () => {
  it.each([
    ["2026-09-23", "23.09.2026"],
    ["2026-01-05T10:00:00", "05.01.2026"],
    [new Date(2026, 11, 31), "31.12.2026"],
  ])("formatDate(%s) → %s", (input, expected) => {
    expect(formatDate(input)).toBe(expected)
  })

  it("geçersiz tarihte tire döner", () => {
    expect(formatDate("abc")).toBe("—")
    expect(formatDateTime("")).toBe("—")
  })

  it("saat ve uzun biçim", () => {
    expect(formatDateTime("2026-09-23T14:05:00")).toBe("23.09.2026 14:05")
    expect(formatDateLong("2026-09-23")).toBe("23 Eylül 2026")
  })
})

describe("formatDonem", () => {
  it.each([
    ["2026-09", "Eylül 2026"],
    ["2026-01", "Ocak 2026"],
    ["2025-12", "Aralık 2025"],
  ])("%s → %s", (input, expected) => {
    expect(formatDonem(input)).toBe(expected)
  })

  it("biçim dışı değeri olduğu gibi döndürür", () => {
    expect(formatDonem("2026-13")).toBe("2026-13")
    expect(formatDonem("Q3")).toBe("Q3")
  })
})

describe("maskTaxId", () => {
  it.each([
    ["1234567890", "123****890"],
    ["10000000146", "100*****146"],
    [undefined, "—"],
    ["12345", "12345"],
  ])("%s → %s", (input, expected) => {
    expect(maskTaxId(input)).toBe(expected)
  })
})

describe("formatPhone", () => {
  it.each([
    ["05321234567", "0532 123 45 67"],
    ["+905321234567", "0532 123 45 67"],
    ["5321234567", "0532 123 45 67"],
    ["123", "123"],
  ])("%s → %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected)
  })
})

describe("initials", () => {
  it("ilk iki kelimenin baş harflerini Türkçe büyük harfle döner", () => {
    expect(initials("Ayşe Yılmaz")).toBe("AY")
    expect(initials("  ismail  ünal  kaya ")).toBe("İÜ")
    expect(initials("Zeynep")).toBe("Z")
  })
})
