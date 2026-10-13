/**
 * Giriş ve personel yönetimi şemaları (api doğrulaması ve client formları ortak).
 * Mesajlar mock API'deki doğrulamayla aynıdır.
 */
import { z } from "../lib/zod"
import type { PersonelRenk, Rol } from "../types/domain"

export const SIFRE_MIN_UZUNLUK = 8
export const SIFRE_MAX_UZUNLUK = 128

const ROLLER = ["YONETICI", "PERSONEL"] as const satisfies readonly Rol[]
const RENKLER = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
] as const satisfies readonly PersonelRenk[]
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EPOSTA_HATASI = "Geçerli bir e-posta girin"
const SIFRE_KISA = `Şifre en az ${SIFRE_MIN_UZUNLUK} karakter olmalı`

export const epostaSemasi = z
  .string({ error: EPOSTA_HATASI })
  .trim()
  .toLowerCase()
  .regex(EPOSTA, EPOSTA_HATASI)

export const sifreSemasi = z
  .string({ error: SIFRE_KISA })
  .min(SIFRE_MIN_UZUNLUK, SIFRE_KISA)
  .max(
    SIFRE_MAX_UZUNLUK,
    `Şifre en fazla ${SIFRE_MAX_UZUNLUK} karakter olabilir`
  )

export const girisSemasi = z.object({
  eposta: epostaSemasi,
  sifre: z.string({ error: "Şifre girin" }).min(1, "Şifre girin"),
})
export type GirisGirdisi = z.infer<typeof girisSemasi>

const adSoyad = z
  .string({ error: "Ad ve soyad zorunludur" })
  .trim()
  .min(1, "Ad ve soyad zorunludur")

export const personelBilgiSemasi = z.object({
  ad: adSoyad,
  soyad: adSoyad,
  eposta: epostaSemasi,
  telefon: z
    .string()
    .nullish()
    .transform((v) => (v ?? "").replace(/\D/g, ""))
    .refine((v) => !v || v.length === 11, "Telefon 11 haneli olmalı (05XX…)"),
  rol: z.enum(ROLLER, { error: "Geçersiz rol" }),
  renk: z.enum(RENKLER).catch("blue"),
  aktif: z.boolean().default(true),
})

export const yoneticiOnayiSemasi = z.object({
  yoneticiSifresi: z.string().default(""),
})

export const personelOlusturSemasi = personelBilgiSemasi.extend({
  sifre: sifreSemasi,
})

export const personelSifreSemasi = z.object({ sifre: sifreSemasi })
