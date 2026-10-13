/**
 * Evrak talebi mesajları: şablon doldurma, telefon normalizasyonu ve paylaşım bağlantıları.
 * Saf fonksiyonlar (UI ve testler).
 */
import { ISTENEN_EVRAKLAR } from "./sabitler"
import { formatDate, formatDonem } from "../lib/format"
import type { IstenenEvrak, MesajSablonTip } from "../types/domain"

export const SABLON_DEGISKENLERI = [
  { ad: "unvan", aciklama: "Mükellef unvanı" },
  { ad: "buro", aciklama: "Büro adı" },
  { ad: "donem", aciklama: "Dönem (ör. Eylül 2026)" },
  { ad: "evraklar", aciklama: "İstenen evraklar" },
  { ad: "link", aciklama: "Yükleme bağlantısı" },
  { ad: "sonTarih", aciklama: "Son yükleme günü" },
  { ad: "neden", aciklama: "Red nedeni (red şablonu)" },
  { ad: "beyan", aciklama: "Beyanname türü (ör. KDV)" },
  { ad: "tutar", aciklama: "Ödenecek tutar" },
  { ad: "vade", aciklama: "Son ödeme günü" },
  { ad: "bakiye", aciklama: "Açık borç tutarı" },
  { ad: "donemler", aciklama: "Borçlu dönemler" },
  { ad: "iban", aciklama: "Büro IBAN'ı" },
] as const

export type SablonDegiskenAdi = (typeof SABLON_DEGISKENLERI)[number]["ad"]
export type SablonDegiskenleri = Partial<Record<SablonDegiskenAdi, string>>

/** Şablon türüne göre kullanılabilen değişkenler ve zorunlu olan */
export const SABLON_KURALLARI: Record<
  MesajSablonTip,
  { degiskenler: SablonDegiskenAdi[]; zorunlu?: SablonDegiskenAdi }
> = {
  TALEP: {
    degiskenler: ["unvan", "buro", "donem", "evraklar", "link", "sonTarih"],
    zorunlu: "link",
  },
  RED: {
    degiskenler: [
      "unvan",
      "buro",
      "donem",
      "evraklar",
      "link",
      "sonTarih",
      "neden",
    ],
    zorunlu: "link",
  },
  TAHAKKUK: {
    degiskenler: ["unvan", "buro", "donem", "beyan", "tutar", "vade"],
  },
  BORC_HATIRLATMA: {
    degiskenler: ["unvan", "buro", "bakiye", "donemler", "iban"],
    zorunlu: "bakiye",
  },
}

export const SABLON_TIPLERI = Object.keys(SABLON_KURALLARI) as MesajSablonTip[]

/** Şablon metni doğrulaması; hata metni ya da null (istemci ve mock sunucu aynı kuralı kullanır) */
export function sablonHatasi(tip: MesajSablonTip, metin: string | undefined) {
  const m = metin?.trim()
  if (!m) return "Şablon boş olamaz"
  if (m.length > 1000) return "Şablon en fazla 1000 karakter olabilir"
  const zorunlu = SABLON_KURALLARI[tip].zorunlu
  if (zorunlu && !m.includes(`{${zorunlu}}`))
    return `Şablon {${zorunlu}} değişkenini içermeli`
  return null
}

/** `{degisken}` yer tutucularını doldurur; bilinmeyen/boş değişkenler olduğu gibi kalmaz, boşaltılır. */
export function mesajOlustur(
  sablon: string,
  degiskenler: SablonDegiskenleri
): string {
  return sablon
    .replace(/\{(\w+)\}/g, (_, ad: string) =>
      ad in degiskenler
        ? (degiskenler[ad as keyof SablonDegiskenleri] ?? "")
        : ""
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/** Talep verisinden şablon değişkenleri */
export function talepDegiskenleri(t: {
  mukellefUnvan: string
  buroAd: string
  donem?: string
  istenenler: IstenenEvrak[]
  link: string
  sonKullanma: string
  neden?: string
}): SablonDegiskenleri {
  return {
    unvan: t.mukellefUnvan,
    buro: t.buroAd,
    donem: t.donem ? formatDonem(t.donem) : "ilgili",
    evraklar: t.istenenler
      .map((i) => ISTENEN_EVRAKLAR[i].ad.toLocaleLowerCase("tr-TR"))
      .join(", "),
    link: t.link,
    sonTarih: formatDate(t.sonKullanma),
    neden: t.neden,
  }
}

/**
 * Türkiye cep telefonunu uluslararası rakam dizisine çevirir: "0532 123 45 67" / "+90 532..." /
 * "532..." → "905321234567". Geçersizse null.
 */
export function telefonNormalize(telefon: string): string | null {
  const rakamlar = telefon.replace(/\D/g, "")
  let yerel: string
  if (rakamlar.length === 12 && rakamlar.startsWith("90"))
    yerel = rakamlar.slice(2)
  else if (rakamlar.length === 11 && rakamlar.startsWith("0"))
    yerel = rakamlar.slice(1)
  else if (rakamlar.length === 10) yerel = rakamlar
  else return null
  return `90${yerel}`
}

export function whatsappLinki(telefon: string, mesaj: string): string | null {
  const numara = telefonNormalize(telefon)
  return numara
    ? `https://wa.me/${numara}?text=${encodeURIComponent(mesaj)}`
    : null
}

const EPOSTA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function epostaGecerli(eposta: string | undefined): boolean {
  return Boolean(eposta && EPOSTA_RE.test(eposta.trim()))
}

/** E-posta kanalı yapılandırılmamışsa kullanıcının e-posta istemcisinde açılır */
export function epostaLinki(
  eposta: string,
  konu: string,
  mesaj: string
): string | null {
  if (!epostaGecerli(eposta)) return null
  return `mailto:${eposta.trim()}?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(mesaj)}`
}

/** `origin` uygulamanın kök adresidir (client: `window.location.origin`, api: `APP_URL`). */
export function portalLinki(token: string, origin: string) {
  return `${origin}/p/${token}`
}
