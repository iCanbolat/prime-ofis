/**
 * Kanal seçimi ve adres kuralları — saf fonksiyonlar (UI, mock backend ve testler).
 */
import type { BildirimKategori } from "../bildirim/kategori"
import { epostaGecerli, telefonNormalize } from "../evrak-talebi/mesaj"
import type {
  BildirimTercihi,
  KanalAyari,
  KanalTip,
  Mukellef,
  MukellefKanal,
} from "../types/domain"

/** Kanal sunucudan gönderim yapabilir mi */
export function kanalHazir(ayar: KanalAyari | null | undefined): boolean {
  return Boolean(ayar?.aktif && ayar.durum === "BAGLI")
}

/**
 * Yeni personel için varsayılan: yalnızca kaçırılmaması gerekenler (son gün / geciken
 * hatırlatmaları ve e-Tebligat) dış kanallara gider. Uygulama içi bildirim her zaman açıktır.
 */
export const VARSAYILAN_TERCIH: Partial<Record<BildirimKategori, KanalTip[]>> =
  {
    uyari: ["EPOSTA", "TELEGRAM"],
    tebligat: ["EPOSTA", "TELEGRAM"],
  }

export function personelKanallari(
  tercih: Pick<BildirimTercihi, "kanallar"> | undefined,
  kategori: BildirimKategori
): KanalTip[] {
  return (tercih?.kanallar ?? VARSAYILAN_TERCIH)[kategori] ?? []
}

/** İstenen kanal → mükellefin tercihi → telefon geçerliyse WhatsApp, değilse e-posta */
export function mukellefKanali(
  m: Pick<Mukellef, "telefon" | "eposta" | "tercihKanal">,
  istenen?: MukellefKanal
): MukellefKanal {
  if (istenen) return istenen
  if (m.tercihKanal) return m.tercihKanal
  return telefonNormalize(m.telefon) || !epostaGecerli(m.eposta)
    ? "WHATSAPP"
    : "EPOSTA"
}

/** Gönderim geçmişinde gösterilen maskeli adres */
export function adresMaskele(kanal: KanalTip, adres: string): string {
  if (kanal === "TELEGRAM") return "Telegram sohbeti"
  if (kanal === "EPOSTA") {
    const [ad = "", alan = ""] = adres.split("@")
    return `${ad.slice(0, 2)}***@${alan}`
  }
  const n = telefonNormalize(adres) ?? adres.replace(/\D/g, "")
  return `+${n.slice(0, 2)} ${n.slice(2, 5)} *** ** ${n.slice(-2)}`
}
