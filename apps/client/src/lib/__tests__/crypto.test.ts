import { describe, expect, it } from "vitest"

import {
  DecryptError,
  createVerifier,
  decryptJson,
  decryptText,
  deriveKey,
  encryptJson,
  encryptText,
  fromBase64,
  generatePassword,
  generateSalt,
  toBase64,
  verifyKey,
} from "@/lib/crypto"

const ITER = 1_000

describe("base64", () => {
  it("byte dizisini kayıpsız dönüştürür", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([
      0, 1, 127, 128, 255,
    ])
  })
})

describe("AES-256-GCM", () => {
  it("encrypt → decrypt aynı metni (Türkçe karakterlerle) geri verir", async () => {
    const key = await deriveKey("ana-şifre", generateSalt(), ITER)
    const payload = await encryptText("Gİb parolası: ğüşıöç 123!", key)
    expect(payload.cipherText).not.toContain("parolası")
    expect(await decryptText(payload, key)).toBe("Gİb parolası: ğüşıöç 123!")
  })

  it("JSON nesnesini şifreler ve çözer", async () => {
    const key = await deriveKey("x", generateSalt(), ITER)
    const secret = { sifre: "abc", ekSifre: "123456" }
    expect(await decryptJson(await encryptJson(secret, key), key)).toEqual(
      secret
    )
  })

  it("aynı metin iki kez şifrelenince farklı IV ve cipherText üretir", async () => {
    const key = await deriveKey("x", generateSalt(), ITER)
    const a = await encryptText("aynı", key)
    const b = await encryptText("aynı", key)
    expect(a.iv).not.toBe(b.iv)
    expect(a.cipherText).not.toBe(b.cipherText)
    expect(fromBase64(a.iv)).toHaveLength(12)
  })

  it("yanlış anahtarla çözme DecryptError fırlatır", async () => {
    const salt = generateSalt()
    const dogru = await deriveKey("dogru", salt, ITER)
    const yanlis = await deriveKey("yanlis", salt, ITER)
    const payload = await encryptText("gizli", dogru)
    await expect(decryptText(payload, yanlis)).rejects.toBeInstanceOf(
      DecryptError
    )
  })

  it("aynı şifre farklı salt ile farklı anahtar üretir", async () => {
    const a = await deriveKey("ayni", generateSalt(), ITER)
    const b = await deriveKey("ayni", generateSalt(), ITER)
    await expect(
      decryptText(await encryptText("x", a), b)
    ).rejects.toBeInstanceOf(DecryptError)
  })

  it("değiştirilmiş (tamper) cipherText çözülemez", async () => {
    const key = await deriveKey("x", generateSalt(), ITER)
    const payload = await encryptText("gizli veri", key)
    const bytes = fromBase64(payload.cipherText)
    bytes[0] ^= 0xff
    await expect(
      decryptText({ ...payload, cipherText: toBase64(bytes) }, key)
    ).rejects.toBeInstanceOf(DecryptError)
  })

  it("türetilen anahtar dışa aktarılamaz", async () => {
    const key = await deriveKey("x", generateSalt(), ITER)
    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 })
  })
})

describe("verifier", () => {
  it("doğru anahtarı kabul eder, yanlışı reddeder", async () => {
    const salt = generateSalt()
    const key = await deriveKey("demo1234", salt, ITER)
    const verifier = await createVerifier(key)
    expect(await verifyKey(key, verifier)).toBe(true)
    expect(
      await verifyKey(await deriveKey("demo12345", salt, ITER), verifier)
    ).toBe(false)
  })
})

describe("generatePassword", () => {
  it("istenen uzunlukta, karışıklık yaratan karakterler olmadan üretir", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(16)
      expect(p).toHaveLength(16)
      expect(p).not.toMatch(/[0O1lI]/)
    }
    expect(generatePassword()).not.toBe(generatePassword())
  })
})
