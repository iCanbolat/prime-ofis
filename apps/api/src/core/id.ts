import { randomBytes } from "node:crypto"

const ALFABE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * `${önek}_${16 karakter base62}` (≈ 95 bit). Önekler mock katmanıyla aynıdır
 * (`m` mükellef, `d` arşiv dosyası, `e` evrak talebi …); bileşik id'ler doğal anahtardan türetilir.
 */
export function newId(onek: string, uzunluk = 16): string {
  // 62'ye bölümdeki sapmayı önlemek için 248'den büyük baytlar atlanır (248 = 4 × 62)
  let sonuc = ""
  while (sonuc.length < uzunluk) {
    for (const b of randomBytes(uzunluk * 2)) {
      if (b < 248) sonuc += ALFABE[b % 62]
      if (sonuc.length === uzunluk) break
    }
  }
  return `${onek}_${sonuc}`
}
