import { addDays } from "date-fns"

import type { EvrakTalebi, TalepDurumu } from "../types/domain"

/** Aktif ama son kullanma tarihi geçmiş talepler "Süresi doldu" sayılır. */
export function talepDurumu(
  talep: Pick<EvrakTalebi, "durum" | "sonKullanma">,
  simdi: Date = new Date()
): TalepDurumu {
  if (talep.durum === "AKTIF" && new Date(talep.sonKullanma) < simdi)
    return "SURESI_DOLDU"
  return talep.durum
}

/** Talep geçerliliği en çok bu kadar gün */
export const TALEP_MAKS_GUN = 60

/** Son kullanma: başlangıçtan `gun` gün sonra, gün sonu (yerel 23:59:59) */
export function sonKullanmaHesapla(gun: number, baslangic: Date = new Date()) {
  const tarih = addDays(baslangic, gun)
  tarih.setHours(23, 59, 59, 0)
  return tarih.toISOString()
}

/** Yeniden açılan talebin son kullanması: mevcut ya da şimdiden en az 7 gün sonrası */
export function yenidenAcSonKullanma(
  talep: Pick<EvrakTalebi, "sonKullanma">,
  simdi: Date = new Date()
) {
  const enAz = sonKullanmaHesapla(7, simdi)
  return talep.sonKullanma > enAz ? talep.sonKullanma : enAz
}
