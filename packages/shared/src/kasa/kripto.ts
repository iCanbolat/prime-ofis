/**
 * Şifre kasası kriptografisi (Web Crypto; tarayıcı ve Node ≥ 20 ortak).
 * - Anahtar: ana şifre + büro salt'ı → PBKDF2-SHA256 → AES-256-GCM (dışa aktarılamaz CryptoKey)
 * - Her şifrelemede rastgele 12 byte IV; GCM auth tag sayesinde yanlış anahtar / değiştirilmiş veri çözülemez.
 * Sunucu şifreli veriyi saklar, çözmez (sıfır bilgili kasa); bu modülü istemci ve demo seed'i
 * (`@prime/mock-data/kasa`) kullanır.
 */
import type { EncryptedPayload } from "../types/domain"

/** OWASP 2023 önerisi. Değer kasa meta'sında saklanır; testler hız için düşük değer verir. */
export const KDF_ITERATIONS = 310_000

/**
 * Ortamın `CryptoKey` tipi (tarayıcıda DOM, Node'da `webcrypto`). Global ad Node tiplerinde
 * tanımlı değil; paket iki ortamda da derlendiği için türetilir.
 */
export type KasaAnahtari = Awaited<ReturnType<typeof crypto.subtle.importKey>>

const VERIFIER_PLAINTEXT = "prime-ofis:kasa:v1"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class DecryptError extends Error {
  constructor() {
    super("Şifreli veri çözülemedi: anahtar hatalı veya veri bozulmuş")
    this.name = "DecryptError"
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = KDF_ITERATIONS
): Promise<KasaAnahtari> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(salt), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export async function encryptText(
  plainText: string,
  key: KasaAnahtari
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plainText)
  )
  return { cipherText: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) }
}

export async function decryptText(
  payload: EncryptedPayload,
  key: KasaAnahtari
): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.cipherText)
    )
    return decoder.decode(plain)
  } catch {
    throw new DecryptError()
  }
}

export async function encryptJson(
  value: unknown,
  key: KasaAnahtari
): Promise<EncryptedPayload> {
  return encryptText(JSON.stringify(value), key)
}

export async function decryptJson<T>(
  payload: EncryptedPayload,
  key: KasaAnahtari
): Promise<T> {
  return JSON.parse(await decryptText(payload, key)) as T
}

/** Kasa oluşturulurken: anahtarın doğruluğunu sonradan kontrol etmek için bilinen metni şifreler. */
export function createVerifier(key: KasaAnahtari): Promise<EncryptedPayload> {
  return encryptText(VERIFIER_PLAINTEXT, key)
}

export async function verifyKey(
  key: KasaAnahtari,
  verifier: EncryptedPayload
): Promise<boolean> {
  try {
    return (await decryptText(verifier, key)) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_"

/** Karışıklık yaratan karakterler (0/O, 1/l/I) hariç kriptografik rastgele şifre. */
export function generatePassword(length = 14): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(
    bytes,
    (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]
  ).join("")
}
