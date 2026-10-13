/**
 * Kanal ve bildirim tercihi istek doğrulamaları — mock handler ve api aynı mesajları döner.
 */
import type { BildirimKategori } from "../bildirim/kategori"
import { SABLON_TIPLERI } from "../evrak-talebi/mesaj"
import type { KanalKaydetRequest, MukellefGonderRequest } from "../types/api"
import type { KanalAyari, KanalTip } from "../types/domain"

export const KANAL_TIPLERI: KanalTip[] = ["EPOSTA", "TELEGRAM", "WHATSAPP"]

export const BILDIRIM_KATEGORILERI: BildirimKategori[] = [
  "gorev",
  "anilma",
  "evrak",
  "ebelge",
  "arsiv",
  "mukellef",
  "tahsilat",
  "tebligat",
  "borc",
  "uyari",
  "sistem",
]

const EPOSTA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Kaydedilecek (gizlisiz) ayar; durum, ipucu ve izleme alanları kaydedilirken eklenir */
export type KanalKaydi = KanalAyari extends infer K
  ? K extends KanalAyari
    ? Omit<
        K,
        "gizliIpucu" | "durum" | "sonTest" | "hataMesaji" | "guncelleyenId" | "guncellemeTarihi"
      >
    : never
  : never

/**
 * Kaydetme isteğini doğrular ve normalleştirir. Hata metni ya da `{ ayar, gizli }`.
 * `mevcutVar`: kanal daha önce kurulmuş mu (gizli değer yalnızca ilk kurulumda zorunlu).
 */
export function kanalKaydiHazirla(
  body: KanalKaydetRequest,
  mevcutVar: boolean
): { ayar: KanalKaydi; gizli?: string } | string {
  const temel = { id: body.tip, aktif: Boolean(body.aktif) }
  if (body.tip === "EPOSTA") {
    if (!body.sunucu?.trim()) return "SMTP sunucusu zorunludur"
    if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535)
      return "Geçerli bir port girin"
    if (!body.kullanici?.trim()) return "Kullanıcı adı zorunludur"
    if (!EPOSTA_RE.test(body.gonderenAdres ?? ""))
      return "Geçerli bir gönderen adresi girin"
    if (!mevcutVar && !body.sifre) return "SMTP şifresi zorunludur"
    return {
      ayar: {
        ...temel,
        tip: "EPOSTA",
        sunucu: body.sunucu.trim(),
        port: body.port,
        guvenlik: body.guvenlik === "TLS" ? "TLS" : "STARTTLS",
        kullanici: body.kullanici.trim(),
        gonderenAd: body.gonderenAd?.trim() || body.gonderenAdres,
        gonderenAdres: body.gonderenAdres.trim(),
      },
      gizli: body.sifre || undefined,
    }
  }
  if (body.tip === "TELEGRAM") {
    const bot = body.botKullaniciAdi?.trim().replace(/^@/, "")
    if (!bot || !/^\w{5,32}bot$/i.test(bot))
      return "Bot kullanıcı adı 'bot' ile bitmeli (ör. PrimeOfisBot)"
    if (!mevcutVar && !body.token) return "Bot token zorunludur"
    if (body.token && !/^\d+:[\w-]{20,}$/.test(body.token))
      return "Token BotFather'ın verdiği biçimde olmalı (123456:ABC…)"
    return {
      ayar: { ...temel, tip: "TELEGRAM", botKullaniciAdi: bot },
      gizli: body.token || undefined,
    }
  }
  if (body.tip === "WHATSAPP") {
    if (!/^\d{6,20}$/.test(body.telefonNumarasiId ?? ""))
      return "Telefon numarası kimliği (Phone number ID) rakamlardan oluşmalı"
    if (!/^\d{6,20}$/.test(body.wabaId ?? ""))
      return "WhatsApp Business hesap kimliği (WABA ID) rakamlardan oluşmalı"
    if (!body.gorunenNumara?.trim()) return "Görünen numara zorunludur"
    if (!mevcutVar && !body.erisimAnahtari) return "Kalıcı erişim anahtarı zorunludur"
    const sablonlar: Record<string, string> = Object.fromEntries(
      Object.entries(body.sablonlar ?? {})
        .map(([k, v]): [string, string] => [k, String(v ?? "").trim()])
        .filter(([, v]) => v)
    )
    if (Object.values(sablonlar).some((v) => !/^[a-z0-9_]{1,512}$/.test(v)))
      return "Şablon adları küçük harf, rakam ve alt çizgiden oluşmalı"
    return {
      ayar: {
        ...temel,
        tip: "WHATSAPP",
        telefonNumarasiId: body.telefonNumarasiId,
        wabaId: body.wabaId,
        gorunenNumara: body.gorunenNumara.trim(),
        sablonlar,
      },
      gizli: body.erisimAnahtari || undefined,
    }
  }
  return "Geçersiz kanal"
}

/** `PUT /bildirim-tercihleri/ben` gövdesi */
export function tercihHatasi(kanallar: unknown): string | null {
  if (!kanallar || typeof kanallar !== "object" || Array.isArray(kanallar))
    return "Tercih bulunamadı"
  for (const [k, v] of Object.entries(kanallar)) {
    if (!BILDIRIM_KATEGORILERI.includes(k as BildirimKategori)) return "Geçersiz kategori"
    if (!Array.isArray(v) || v.some((t) => !KANAL_TIPLERI.includes(t)))
      return "Geçersiz kanal"
  }
  return null
}

export const MUKELLEF_GONDER_EN_FAZLA = 200

/** `POST /gonderim/mukellef` gövdesi (hedef bazlı hatalar sonuçta döner) */
export function mukellefGonderHatasi(body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as Partial<MukellefGonderRequest>
  if (!SABLON_TIPLERI.includes(b.sablon as never)) return "Geçersiz mesaj türü"
  if (b.kanal && b.kanal !== "WHATSAPP" && b.kanal !== "EPOSTA")
    return "Mükellefe yalnızca WhatsApp veya e-posta ile gönderilir"
  if (!Array.isArray(b.hedefler) || b.hedefler.length === 0) return "En az bir mükellef seçin"
  if (b.hedefler.length > MUKELLEF_GONDER_EN_FAZLA)
    return `Tek seferde en fazla ${MUKELLEF_GONDER_EN_FAZLA} mükellefe gönderilir`
  if (
    b.hedefler.some(
      (h) => !h || typeof h !== "object" || typeof (h as { mukellefId?: unknown }).mukellefId !== "string"
    )
  )
    return "Geçersiz hedef"
  return null
}
