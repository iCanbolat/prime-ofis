import { describe, expect, it } from "vitest"

import {
  generateTckn,
  generateVkn,
  isValidTckn,
  isValidVkn,
} from "@prime/shared/lib/tax-id"

/** Basit deterministik PRNG (Park–Miller) */
function lcg(seed: number) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

describe("isValidTckn", () => {
  it.each(["10000000146", "60465985014"])("%s geçerli", (value) => {
    expect(isValidTckn(value)).toBe(true)
  })

  it.each([
    ["10000000147", "son hane hatalı"],
    ["10000000156", "10. hane hatalı"],
    ["00000000146", "0 ile başlıyor"],
    ["1000000014", "10 hane"],
    ["100000001466", "12 hane"],
    ["1000000014a", "harf içeriyor"],
    ["", "boş"],
  ])("%s geçersiz (%s)", (value) => {
    expect(isValidTckn(value)).toBe(false)
  })
})

describe("isValidVkn", () => {
  it.each(["0174520662", "9358005601", "1234567890"])("%s geçerli", (value) => {
    expect(isValidVkn(value)).toBe(true)
  })

  it.each([
    ["0174520663", "kontrol hanesi hatalı"],
    ["017452066", "9 hane"],
    ["01745206621", "11 hane"],
    ["01745a0662", "harf içeriyor"],
  ])("%s geçersiz (%s)", (value) => {
    expect(isValidVkn(value)).toBe(false)
  })
})

describe("üretim", () => {
  it("üretilen 500 VKN ve TCKN'nin tamamı doğrulamadan geçer", () => {
    const random = lcg(7)
    for (let i = 0; i < 500; i++) {
      expect(isValidVkn(generateVkn(random))).toBe(true)
      expect(isValidTckn(generateTckn(random))).toBe(true)
    }
  })

  it("aynı rastgele kaynakla aynı değerleri üretir", () => {
    expect(generateVkn(lcg(1))).toBe(generateVkn(lcg(1)))
    expect(generateTckn(lcg(1))).toBe(generateTckn(lcg(1)))
  })
})
