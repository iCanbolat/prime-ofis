import { describe, expect, it } from "vitest"

import {
  isValidMersis,
  isValidNace,
  isValidPhoneTR,
  normalizePhoneTR,
} from "@prime/shared/lib/validators"

describe("isValidPhoneTR", () => {
  it.each([
    "05321234567",
    "0532 123 45 67",
    "+90 532 123 45 67",
    "905321234567",
    "5321234567",
    "0216 345 67 89",
  ])("%s geçerli", (v) => expect(isValidPhoneTR(v)).toBe(true))

  it.each([
    "0532123456",
    "053212345678",
    "01234567890",
    "0632 123 45 67",
    "abc",
    "",
  ])("%s geçersiz", (v) => expect(isValidPhoneTR(v)).toBe(false))
})

describe("normalizePhoneTR", () => {
  it.each([
    ["0532 123 45 67", "05321234567"],
    ["+90 (532) 123-45-67", "05321234567"],
    ["5321234567", "05321234567"],
  ])("%s → %s", (input, expected) =>
    expect(normalizePhoneTR(input)).toBe(expected)
  )
})

describe("isValidMersis", () => {
  it("16 hane ister", () => {
    expect(isValidMersis("0123456789012345")).toBe(true)
    expect(isValidMersis("012345678901234")).toBe(false)
    expect(isValidMersis("01234567890123a5")).toBe(false)
  })
})

describe("isValidNace", () => {
  it("00.00.00 biçimi", () => {
    expect(isValidNace("62.01.01")).toBe(true)
    expect(isValidNace("62.01")).toBe(false)
    expect(isValidNace("620101")).toBe(false)
  })
})
