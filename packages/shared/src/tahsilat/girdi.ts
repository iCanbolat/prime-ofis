/**
 * Tahsilat istek doğrulamaları — mock handler ve api aynı mesajları döner. Hata metni ya da null.
 */
import type { Kapatma, MukellefUcret } from "../types/domain"

export const TAHSILAT_DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const TAHSILAT_TARIH_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAKS_TUTAR = 10_000_000
export const KDV_ORANLARI = [0, 1, 10, 20]

const sayi = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const doluMetin = (v: unknown) => typeof v === "string" && v.trim() !== ""

/** Elle kapatma ya da avans hareketi ekleme isteği */
export function hareketHatasi(body: unknown, bugunYmd: string): string | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  if (b.tip !== "BORC" && b.tip !== "ODEME") return "Geçersiz hareket tipi"
  if (typeof b.tarih !== "string" || !TAHSILAT_TARIH_RE.test(b.tarih))
    return "Geçerli bir tarih girin"
  if (b.tarih > bugunYmd) return "Gelecek tarihli kayıt girilemez"
  if (b.tip === "BORC") {
    if (!sayi(b.brut) || !(b.brut > 0) || b.brut > MAKS_TUTAR)
      return "Brüt tutar sıfırdan büyük olmalı"
    if (!KDV_ORANLARI.includes(b.kdvOrani as number)) return "Geçersiz KDV oranı"
    if (!doluMetin(b.aciklama)) return "Açıklama zorunludur"
  } else {
    if (b.kalem !== "ODEME" && b.kalem !== "DUZELTME") return "Geçersiz ödeme türü"
    if (!sayi(b.tutar) || !(b.tutar > 0) || b.tutar > MAKS_TUTAR)
      return "Tutar sıfırdan büyük olmalı"
    if (b.kalem === "DUZELTME" && !doluMetin(b.aciklama))
      return "Düzeltme için açıklama zorunludur"
    if (b.kapatmalar !== undefined && !kapatmaBicimiGecerli(b.kapatmalar))
      return "Kapatmalar geçersiz"
  }
  if (b.makbuzNo !== undefined && b.makbuzNo !== null && typeof b.makbuzNo !== "string")
    return "Makbuz numarası geçersiz"
  return null
}

function kapatmaBicimiGecerli(v: unknown): v is Kapatma[] {
  return (
    Array.isArray(v) &&
    v.every(
      (k: unknown) =>
        !!k &&
        typeof k === "object" &&
        typeof (k as Kapatma).borcId === "string" &&
        sayi((k as Kapatma).tutar)
    )
  )
}

/** Aylık ücret tanımı */
export function ucretHatasi(u: unknown): string | null {
  const ucret = (u && typeof u === "object" ? u : {}) as Partial<MukellefUcret>
  if (!sayi(ucret.aylikBrut) || !(ucret.aylikBrut > 0) || ucret.aylikBrut > MAKS_TUTAR)
    return "Aylık ücret sıfırdan büyük olmalı"
  if (!KDV_ORANLARI.includes(ucret.kdvOrani as number)) return "Geçersiz KDV oranı"
  if (typeof ucret.stopajVar !== "boolean") return "Stopaj bilgisi eksik"
  if (typeof ucret.baslangicDonem !== "string" || !TAHSILAT_DONEM_RE.test(ucret.baslangicDonem))
    return "Başlangıç dönemi geçersiz"
  return null
}

/** Hızlı başlangıçtaki açılış bakiyesi (+ borç, − avans) */
export function acilisBakiyesiHatasi(b: unknown): string | null {
  const bakiye = (b && typeof b === "object" ? b : {}) as { tutar?: unknown; tarih?: unknown }
  if (
    typeof bakiye.tarih !== "string" ||
    !TAHSILAT_TARIH_RE.test(bakiye.tarih) ||
    !sayi(bakiye.tutar) ||
    Math.abs(bakiye.tutar) > MAKS_TUTAR
  )
    return "Açılış bakiyesi geçersiz"
  return null
}

/** İVD kesinti listesi içe aktarımı (yıl + satırlar) */
export function kesintiIceAktarHatasi(yil: unknown, kayitlar: unknown): string | null {
  if (!(typeof yil === "number" && Number.isInteger(yil) && yil >= 2000 && yil <= 2100))
    return "Geçersiz yıl"
  if (!Array.isArray(kayitlar) || kayitlar.length === 0) return "İçe aktarılacak satır yok"
  const satirlar = kayitlar.map((k: unknown) =>
    (k && typeof k === "object" ? k : {}) as Record<string, unknown>
  )
  const yilDisi = satirlar.filter(
    (k) => typeof k.donem !== "string" || !k.donem.startsWith(`${yil}-`)
  )
  if (yilDisi.length) return `${yilDisi.length} satır ${yil} yılına ait değil`
  if (
    satirlar.some(
      (k) =>
        typeof k.vkn !== "string" ||
        !/^\d{10,11}$/.test(k.vkn) ||
        !sayi(k.kesinti) ||
        !(k.kesinti > 0) ||
        (k.matrah !== undefined && !sayi(k.matrah))
    )
  )
    return "Geçersiz VKN veya kesinti tutarı"
  return null
}
