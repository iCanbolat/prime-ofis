/**
 * Veritabanı satırındaki `null` alanları atar: domain tiplerinde isteğe bağlı alanlar `?:`
 * (yanıtta hiç yok) olarak tanımlı; mock API de bu biçimde döner. `koru` içindeki alanlar
 * `null` kalır (ör. bildirim `aliciId: null` = yayın).
 */
export function nullsuz<T extends object>(satir: T): NullsuzSatir<T>
export function nullsuz<T extends object, K extends keyof T>(
  satir: T,
  koru: readonly K[]
): NullsuzSatir<T, K>
export function nullsuz<T extends object, K extends keyof T>(
  satir: T,
  koru?: readonly K[]
): NullsuzSatir<T, K> {
  const sonuc: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(satir)) {
    if (v !== null || (koru as readonly PropertyKey[] | undefined)?.includes(k)) sonuc[k] = v
  }
  return sonuc as NullsuzSatir<T, K>
}

type NullAlanlari<T> = {
  [P in keyof T]: null extends T[P] ? P : never
}[keyof T]

export type NullsuzSatir<T, K extends keyof T = never> = {
  [P in Exclude<keyof T, NullAlanlari<T>> | K]: T[P]
} & {
  [P in Exclude<NullAlanlari<T>, K>]?: Exclude<T[P], null>
}
