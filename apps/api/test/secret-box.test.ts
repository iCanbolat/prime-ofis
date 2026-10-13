import { randomBytes } from "node:crypto"

import { describe, expect, it } from "vitest"

import { SecretBox } from "../src/core/secret-box.js"

const anahtar = () => randomBytes(32).toString("base64")

describe("SecretBox", () => {
  it("şifreler ve çözer; her seferinde farklı çıktı", () => {
    const kutu = new SecretBox({ SECRET_KEY: anahtar() })
    const a = kutu.sifrele("luca-anahtari-123")
    const b = kutu.sifrele("luca-anahtari-123")
    expect(a).toMatch(/^v1:/)
    expect(a).not.toBe(b)
    expect(kutu.coz(a)).toBe("luca-anahtari-123")
    expect(kutu.coz(kutu.sifrele(""))).toBe("")
    expect(kutu.coz(kutu.sifrele("şifre ğüşiöç"))).toBe("şifre ğüşiöç")
  })

  it("kurcalanmış veri ve yanlış anahtar çözülemez", () => {
    const kutu = new SecretBox({ SECRET_KEY: anahtar() })
    const kapali = kutu.sifrele("gizli")
    const veri = Buffer.from(kapali.slice(3), "base64")
    veri[veri.length - 1]! ^= 1
    expect(() => kutu.coz(`v1:${veri.toString("base64")}`)).toThrow(/çözülemedi/)
    expect(() => new SecretBox({ SECRET_KEY: anahtar() }).coz(kapali)).toThrow(/çözülemedi/)
    expect(() => kutu.coz("duz-metin")).toThrow()
  })

  it("rotasyon: eski anahtarla şifreli değer yeni kutuda çözülür ve güncel değildir", () => {
    const eski = anahtar()
    const yeni = anahtar()
    const kapali = new SecretBox({ SECRET_KEY: eski }).sifrele("ivd-sifresi")
    const kutu = new SecretBox({ SECRET_KEY: yeni, SECRET_KEY_ESKI: eski })
    expect(kutu.coz(kapali)).toBe("ivd-sifresi")
    expect(kutu.guncelMi(kapali)).toBe(false)
    const yeniden = kutu.sifrele(kutu.coz(kapali))
    expect(kutu.guncelMi(yeniden)).toBe(true)
    expect(new SecretBox({ SECRET_KEY: yeni }).coz(yeniden)).toBe("ivd-sifresi")
  })

  it("anahtar yoksa açık hata; ipucu son 4 karakter", () => {
    const kutu = new SecretBox({})
    expect(kutu.hazir).toBe(false)
    expect(() => kutu.sifrele("x")).toThrow(/SECRET_KEY/)
    expect(SecretBox.ipucu("1234567890")).toBe("••••7890")
    expect(SecretBox.ipucu("kisa")).toBe("••••")
  })
})
