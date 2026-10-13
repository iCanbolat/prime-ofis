/**
 * Şifre kasası kriptografisi: `@prime/shared/kasa/kripto` (demo seed'i ve api testleri de kullanır).
 * Burada yalnızca test ortamında hız için düşük PBKDF2 tur sayısı seçilir.
 */
import {
  KDF_ITERATIONS as URETIM_KDF_ITERATIONS,
  deriveKey as paylasilanDeriveKey,
} from "@prime/shared/kasa/kripto"

export {
  DecryptError,
  createVerifier,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  fromBase64,
  generatePassword,
  generateSalt,
  toBase64,
  verifyKey,
} from "@prime/shared/kasa/kripto"

/** Testlerde hız için düşük değer kullanılır; değer kasa meta'sında saklanır. */
export const KDF_ITERATIONS =
  import.meta.env.MODE === "test" ? 1_000 : URETIM_KDF_ITERATIONS

export function deriveKey(
  password: string,
  salt: string,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  return paylasilanDeriveKey(password, salt, iterations)
}
