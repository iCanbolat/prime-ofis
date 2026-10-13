/**
 * VKN (Vergi Kimlik No, 10 hane) ve TCKN (T.C. Kimlik No, 11 hane) doğrulama ve üretim.
 * Üretim fonksiyonları mock seed için kullanılır; `random` parametresi deterministik
 * üretim için dışarıdan verilir (0 <= r < 1 döndüren fonksiyon).
 */

type RandomFn = () => number

const digitsOf = (value: string) => value.split("").map(Number)

function vknCheckDigit(first9: number[]): number {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const tmp = (first9[i] + (9 - i)) % 10
    let weighted = (tmp * 2 ** (9 - i)) % 9
    if (tmp !== 0 && weighted === 0) weighted = 9
    sum += weighted
  }
  return (10 - (sum % 10)) % 10
}

export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false
  const d = digitsOf(value)
  return vknCheckDigit(d.slice(0, 9)) === d[9]
}

function tcknCheckDigits(first9: number[]): [number, number] {
  const odd = first9[0] + first9[2] + first9[4] + first9[6] + first9[8]
  const even = first9[1] + first9[3] + first9[5] + first9[7]
  const d10 = (((odd * 7 - even) % 10) + 10) % 10
  const d11 = (first9.reduce((a, b) => a + b, 0) + d10) % 10
  return [d10, d11]
}

export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false
  const d = digitsOf(value)
  const [d10, d11] = tcknCheckDigits(d.slice(0, 9))
  return d[9] === d10 && d[10] === d11
}

const randomDigit = (random: RandomFn) => Math.floor(random() * 10)

export function generateVkn(random: RandomFn = Math.random): string {
  const first9 = Array.from({ length: 9 }, () => randomDigit(random))
  return [...first9, vknCheckDigit(first9)].join("")
}

export function generateTckn(random: RandomFn = Math.random): string {
  const first9 = Array.from({ length: 9 }, () => randomDigit(random))
  first9[0] = 1 + Math.floor(random() * 9)
  return [...first9, ...tcknCheckDigits(first9)].join("")
}
