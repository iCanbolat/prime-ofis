import { format, isValid, parseISO } from "date-fns"
import { tr } from "date-fns/locale"

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
})

export function formatTRY(amount: number): string {
  return tryFormatter.format(amount)
}

function toDate(value: Date | string): Date | null {
  const date = typeof value === "string" ? parseISO(value) : value
  return isValid(date) ? date : null
}

/** 23.09.2026 */
export function formatDate(value: Date | string): string {
  const date = toDate(value)
  return date ? format(date, "dd.MM.yyyy") : "—"
}

/** 23.09.2026 14:05 */
export function formatDateTime(value: Date | string): string {
  const date = toDate(value)
  return date ? format(date, "dd.MM.yyyy HH:mm") : "—"
}

/** 23 Eylül 2026 */
export function formatDateLong(value: Date | string): string {
  const date = toDate(value)
  return date ? format(date, "d MMMM yyyy", { locale: tr }) : "—"
}

/** "2026-09" → "Eylül 2026" */
export function formatDonem(donem: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(donem)
  if (!match) return donem
  const month = Number(match[2])
  if (month < 1 || month > 12) return donem
  const date = new Date(Number(match[1]), month - 1, 1)
  const label = format(date, "LLLL yyyy", { locale: tr })
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1)
}

/** VKN/TCKN'nin ortasını maskeler: "1234567890" → "123****890" */
export function maskTaxId(value: string | undefined): string {
  if (!value) return "—"
  if (value.length <= 6) return value
  return `${value.slice(0, 3)}${"*".repeat(value.length - 6)}${value.slice(-3)}`
}

/** "05321234567" / "+905321234567" → "0532 123 45 67" */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  const local = digits.startsWith("90")
    ? digits.slice(2)
    : digits.replace(/^0/, "")
  if (local.length !== 10) return value
  return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`
}

/** "Ayşe Yılmaz" → "AY" */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR"))
    .join("")
}
