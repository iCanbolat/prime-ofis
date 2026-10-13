import { SISTEM_SIRASI, sistemGerekliMi } from "./sistemler"
import type { CredentialKaydi } from "../types/api"
import type { Mukellef, Sistem } from "../types/domain"

export type HucreDurumu = "kayitli" | "eksik" | "gerekmez"

/** Kasa tamamlanma matrisinin bir satırı: mükellef × sistem */
export interface KasaSatiri {
  mukellef: Mukellef
  hucreler: Record<Sistem, HucreDurumu>
  eksikSayisi: number
}

export const HUCRE_ETIKET: Record<HucreDurumu, string> = {
  kayitli: "Kayıtlı",
  eksik: "Eksik",
  gerekmez: "Gerekmez",
}

export function kasaSatirlari(
  mukellefler: Mukellef[],
  credentials: CredentialKaydi[]
): KasaSatiri[] {
  const kayitli = new Set(credentials.map((c) => `${c.mukellefId}:${c.sistem}`))
  return mukellefler.map((m) => {
    const hucreler = Object.fromEntries(
      SISTEM_SIRASI.map((s) => [
        s,
        kayitli.has(`${m.id}:${s}`)
          ? "kayitli"
          : sistemGerekliMi(m, s)
            ? "eksik"
            : "gerekmez",
      ])
    ) as Record<Sistem, HucreDurumu>
    const eksikSayisi = Object.values(hucreler).filter(
      (h) => h === "eksik"
    ).length
    return { mukellef: m, hucreler, eksikSayisi }
  })
}
