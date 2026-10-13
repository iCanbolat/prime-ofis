/**
 * Saat dilimi sorunlarından kaçınmak için takvim tarihleri "yyyy-MM-dd" string olarak taşınır
 * ve yerel gece yarısına çözülür.
 */
import { format, isValid, parse } from "date-fns"

export const YMD = "yyyy-MM-dd"

export function toYmd(date: Date): string {
  return format(date, YMD)
}

export function fromYmd(value: string): Date {
  const date = parse(value, YMD, new Date(0))
  if (!isValid(date)) throw new Error(`Geçersiz tarih: ${value}`)
  return date
}

/** Bugünün tarihi (yyyy-MM-dd). Testlerde `vi.useFakeTimers({ toFake: ["Date"] })` ile sabitlenir. */
export function bugun(): string {
  return toYmd(new Date())
}
