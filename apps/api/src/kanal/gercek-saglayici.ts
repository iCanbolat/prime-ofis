import nodemailer from "nodemailer"

import { telefonNormalize } from "@prime/shared/evrak-talebi/mesaj"
import type { KanalDogrulamaSonucu } from "@prime/shared/kanal/kanal-adapter"
import type {
  EpostaKanalAyari,
  KanalAyari,
  WhatsappKanalAyari,
} from "@prime/shared/types/domain"

import { KanalSaglayici, type SaglayiciSonucu, type SunucuMesaji } from "./saglayici.js"

export const GRAPH_API = "https://graph.facebook.com/v21.0"
const ZAMAN_ASIMI_MS = 15_000

const TELEGRAM_YOK = "Telegram kanalı henüz desteklenmiyor"

/** Gerçek sağlayıcılar: SMTP (nodemailer) ve Meta WhatsApp Cloud API. Telegram ertelendi. */
export class GercekKanalSaglayici extends KanalSaglayici {
  constructor(private readonly istek: typeof fetch = fetch) {
    super()
  }

  async dogrula(ayar: KanalAyari, gizli: string): Promise<KanalDogrulamaSonucu> {
    if (ayar.tip === "EPOSTA") {
      try {
        await smtpTasiyici(ayar, gizli).verify()
        return { gecerli: true }
      } catch (e) {
        return { gecerli: false, hataMesaji: smtpHataMesaji(e) }
      }
    }
    if (ayar.tip === "WHATSAPP") {
      const y = await this.graph(
        `${GRAPH_API}/${ayar.telefonNumarasiId}?fields=display_phone_number`,
        gizli
      )
      return y.ok
        ? { gecerli: true }
        : { gecerli: false, hataMesaji: y.hataMesaji ?? "Meta bağlantısı doğrulanamadı" }
    }
    return { gecerli: false, hataMesaji: TELEGRAM_YOK }
  }

  async gonder(ayar: KanalAyari, mesaj: SunucuMesaji, gizli?: string): Promise<SaglayiciSonucu> {
    if (!gizli) return { basarili: false, hataMesaji: "Kanal kimlik bilgisi eksik" }
    if (ayar.tip === "EPOSTA") return this.eposta(ayar, mesaj, gizli)
    if (ayar.tip === "WHATSAPP") return this.whatsapp(ayar, mesaj, gizli)
    return { basarili: false, hataMesaji: TELEGRAM_YOK }
  }

  private async eposta(
    ayar: EpostaKanalAyari,
    mesaj: SunucuMesaji,
    sifre: string
  ): Promise<SaglayiciSonucu> {
    try {
      const sonuc = await smtpTasiyici(ayar, sifre).sendMail({
        from: { name: ayar.gonderenAd, address: ayar.gonderenAdres },
        to: mesaj.adres,
        subject: mesaj.konu,
        text: mesaj.metin,
        attachments: mesaj.ekler?.map((e) => ({
          filename: e.ad,
          content: e.icerik,
          contentType: e.mimeType,
        })),
      })
      return { basarili: true, saglayiciId: sonuc.messageId }
    } catch (e) {
      return { basarili: false, hataMesaji: smtpHataMesaji(e), gecici: smtpGeciciMi(e) }
    }
  }

  private async whatsapp(
    ayar: WhatsappKanalAyari,
    mesaj: SunucuMesaji,
    anahtar: string
  ): Promise<SaglayiciSonucu> {
    const telefon = telefonNormalize(mesaj.adres)
    if (!telefon) return { basarili: false, hataMesaji: "Geçersiz cep telefonu numarası" }
    const sablon = mesaj.whatsappSablon && ayar.sablonlar[mesaj.whatsappSablon]
    if (!sablon)
      return {
        basarili: false,
        hataMesaji: "Bu mesaj türü için onaylı WhatsApp şablonu eşlenmemiş",
      }
    const y = await this.graph(`${GRAPH_API}/${ayar.telefonNumarasiId}/messages`, anahtar, {
      messaging_product: "whatsapp",
      to: telefon,
      type: "template",
      template: {
        name: sablon,
        language: { code: "tr" },
        components: mesaj.parametreler?.length
          ? [
              {
                type: "body",
                parameters: mesaj.parametreler.map((p) => ({ type: "text", text: p || "—" })),
              },
            ]
          : [],
      },
    })
    if (!y.ok) return { basarili: false, hataMesaji: y.hataMesaji, gecici: y.gecici }
    const id = (y.govde as { messages?: { id?: string }[] } | undefined)?.messages?.[0]?.id
    return { basarili: true, saglayiciId: id }
  }

  private async graph(
    url: string,
    anahtar: string,
    govde?: object
  ): Promise<{ ok: boolean; govde?: unknown; hataMesaji?: string; gecici?: boolean }> {
    let yanit: Response
    try {
      yanit = await this.istek(url, {
        method: govde ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${anahtar}`,
          ...(govde ? { "content-type": "application/json" } : {}),
        },
        body: govde ? JSON.stringify(govde) : undefined,
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      })
    } catch {
      return { ok: false, hataMesaji: "Meta sunucusuna ulaşılamadı", gecici: true }
    }
    const veri = (await yanit.json().catch(() => undefined)) as
      | { error?: { message?: string; code?: number } }
      | undefined
    if (yanit.ok) return { ok: true, govde: veri }
    const hata = veri?.error
    return {
      ok: false,
      hataMesaji: hata?.message
        ? `${hata.message}${hata.code ? ` (${hata.code})` : ""}`
        : `Meta hata yanıtı (${yanit.status})`,
      gecici: yanit.status === 429 || yanit.status >= 500,
    }
  }
}

function smtpTasiyici(ayar: EpostaKanalAyari, sifre: string) {
  return nodemailer.createTransport({
    host: ayar.sunucu,
    port: ayar.port,
    secure: ayar.guvenlik === "TLS",
    requireTLS: ayar.guvenlik === "STARTTLS",
    auth: { user: ayar.kullanici, pass: sifre },
    connectionTimeout: ZAMAN_ASIMI_MS,
    greetingTimeout: ZAMAN_ASIMI_MS,
    socketTimeout: ZAMAN_ASIMI_MS * 2,
  })
}

interface SmtpHatasi {
  code?: string
  responseCode?: number
  message?: string
}

function smtpHataMesaji(e: unknown): string {
  const h = e as SmtpHatasi
  if (h.code === "EAUTH") return `SMTP kimlik doğrulaması başarısız (${h.responseCode ?? 535})`
  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS"].includes(h.code ?? ""))
    return "SMTP sunucusuna bağlanılamadı"
  if (h.responseCode) return `SMTP sunucusu reddetti (${h.responseCode})`
  return "E-posta gönderilemedi"
}

/** Bağlantı hatası ve 4xx geçici; kimlik ve 5xx (alıcı yok vb.) kalıcı */
function smtpGeciciMi(e: unknown): boolean {
  const h = e as SmtpHatasi
  if (h.code === "EAUTH") return false
  if (h.responseCode) return h.responseCode >= 400 && h.responseCode < 500
  return true
}
