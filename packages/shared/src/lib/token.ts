/** Uint8Array → base64url (padding'siz) */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Tahmin edilemez erişim token'ı: `crypto.getRandomValues` ile 32 byte → 43 karakter base64url.
 * Magic link'lerde (`/p/:token`) kullanılır.
 */
export function generateToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}
