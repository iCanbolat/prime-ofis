/**
 * e-Tebligat istek doğrulamaları — mock handler ve api aynı mesajları döner. Hata metni ya da null.
 */
import type {
  TebligatDurum,
  TebligatTur,
} from "../types/domain"
import { SURE_KURALLARI } from "./kurallar"

export const TEBLIGAT_DURUMLARI: TebligatDurum[] = [
  "YENI",
  "INCELENDI",
  "ISLEM_YAPILDI",
  "KAPANDI",
]
export const TEBLIGAT_TURLERI = Object.keys(SURE_KURALLARI) as TebligatTur[]
export const TEBLIGAT_BELGE_TURLERI = ["application/pdf", "image/png", "image/jpeg"]
export const TEBLIGAT_KULLANICI_KODU_RE = /^\d{6,11}$/
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const nesne = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>
const sureGecerli = (n: unknown) => typeof n === "number" && n >= 1 && n <= 365

/** `PUT /tebligat/erisim/:mukellefId` (kasa kaydı kontrolü ayrıca yapılır) */
export function erisimHatasi(body: unknown): string | null {
  const b = nesne(body)
  const kod = typeof b.kullaniciKodu === "string" ? b.kullaniciKodu.trim() : ""
  if (!TEBLIGAT_KULLANICI_KODU_RE.test(kod)) return "Kullanıcı kodu 6–11 haneli olmalı"
  if (typeof b.sifre !== "string" || b.sifre.length < 4) return "Şifre en az 4 karakter olmalı"
  if (b.kasaCredentialId !== undefined && typeof b.kasaCredentialId !== "string")
    return "Kasa kaydı geçersiz"
  return null
}

/** `POST /tebligat` (mükellef varlığı ayrıca kontrol edilir: "Mükellef seçin") */
export function tebligatEkleHatasi(body: unknown, bugunYmd: string): string | null {
  const b = nesne(body)
  if (!TEBLIGAT_TURLERI.includes(b.tur as TebligatTur)) return "Geçersiz tebligat türü"
  if (typeof b.konu !== "string" || !b.konu.trim()) return "Konu zorunludur"
  if (typeof b.ulasmaGunu !== "string" || !YMD_RE.test(b.ulasmaGunu) || b.ulasmaGunu > bugunYmd)
    return "Geçerli bir ulaşma tarihi girin"
  if (b.sureGun !== undefined && !sureGecerli(b.sureGun)) return "Süre 1–365 gün olmalı"
  if (b.belgeNo !== undefined && b.belgeNo !== null && typeof b.belgeNo !== "string")
    return "Belge no geçersiz"
  return null
}

/** `PATCH /tebligat/:id` (personel varlığı ayrıca kontrol edilir: "Personel bulunamadı") */
export function tebligatGuncelleHatasi(body: unknown): string | null {
  const b = nesne(body)
  if (b.durum !== undefined && !TEBLIGAT_DURUMLARI.includes(b.durum as TebligatDurum))
    return "Geçersiz durum"
  if (b.atananId !== undefined && b.atananId !== null && typeof b.atananId !== "string")
    return "Personel bulunamadı"
  if (b.not !== undefined && typeof b.not !== "string") return "Not geçersiz"
  if (b.sureGun !== undefined && b.sureGun !== null && !sureGecerli(b.sureGun))
    return "Süre 1–365 gün olmalı"
  return null
}
