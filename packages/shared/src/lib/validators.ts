/**
 * Form doğrulama yardımcıları. VKN/TCKN algoritmaları `tax-id.ts`'dedir.
 */
export { isValidTckn, isValidVkn } from "./tax-id"

/** Yalnızca rakamları bırakır. */
export const digitsOnly = (value: string) => value.replace(/\D/g, "")

/**
 * Türkiye telefon numarası: 0 ile veya +90 ile yazılabilir; 10 haneli ulusal numara
 * 2-5 ile başlamalı (sabit hat 2-4, GSM 5).
 */
export function isValidPhoneTR(value: string): boolean {
  const digits = digitsOnly(value)
  const national = digits.startsWith("90")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits
  return /^[2-5]\d{9}$/.test(national)
}

/** Telefonu depolama biçimine çevirir: "0532 123 45 67" / "+90 532..." → "05321234567" */
export function normalizePhoneTR(value: string): string {
  const digits = digitsOnly(value)
  const national = digits.startsWith("90")
    ? digits.slice(2)
    : digits.replace(/^0/, "")
  return `0${national}`
}

/** MERSİS numarası 16 hanedir. */
export function isValidMersis(value: string): boolean {
  return /^\d{16}$/.test(value)
}

/** NACE kodu: "62.01.01" biçimi */
export function isValidNace(value: string): boolean {
  return /^\d{2}\.\d{2}\.\d{2}$/.test(value)
}
