/** Deterministik 32 bit karma (FNV-1a); mock'larda tohum üretmek için */
export function karma(metin: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
