/**
 * Personel giriş şifreleri (mock sunucu). Şifre düz metin saklanmaz: PBKDF2-SHA256 özeti
 * `db.kimlik` koleksiyonunda tutulur. Gerçek backend'de bu doğrulama sunucuya taşınır.
 */
import { db } from "@/mocks/db"
import {
  KDF_ITERATIONS,
  fromBase64,
  generateSalt,
  toBase64,
} from "@/lib/crypto"
import type { PersonelKimlik } from "@prime/shared/types/domain"

export const SIFRE_MIN_UZUNLUK = 8

async function ozet(sifre: string, salt: string, iterations: number) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sifre),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(salt), iterations, hash: "SHA-256" },
    baseKey,
    256
  )
  return toBase64(new Uint8Array(bits))
}

/** Sabit süreli karşılaştırma: özetin ne kadarının tuttuğu süreden anlaşılmasın. */
function esit(a: string, b: string) {
  if (a.length !== b.length) return false
  let fark = 0
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return fark === 0
}

export async function sifreBelirle(personelId: string, sifre: string) {
  const salt = generateSalt()
  const kayit: PersonelKimlik = {
    id: personelId,
    salt,
    hash: await ozet(sifre, salt, KDF_ITERATIONS),
    iterations: KDF_ITERATIONS,
  }
  if (db.kimlik.find(personelId)) db.kimlik.update(personelId, kayit)
  else db.kimlik.insert(kayit)
}

export async function sifreDogrula(
  personelId: string,
  sifre: string
): Promise<boolean> {
  const kayit = db.kimlik.find(personelId)
  if (!kayit || !sifre) return false
  return esit(await ozet(sifre, kayit.salt, kayit.iterations), kayit.hash)
}
