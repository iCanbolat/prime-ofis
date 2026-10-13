/**
 * Dış gönderim kanalları sözleşmesi — **backend** tarafından uygulanır.
 *
 * - E-posta: büronun SMTP hesabı (TLS / STARTTLS).
 * - Telegram: büronun botu (Bot API `sendMessage`). Personel `/start <kod>` ile botla kendi sohbetini
 *   eşler; mükelleflere Telegram'dan gönderim yapılmaz.
 * - WhatsApp Business: Meta WhatsApp Cloud API. İşletme tarafından başlatılan her mesaj (24 saatlik
 *   müşteri penceresi dışında) Meta'da onaylı bir şablonla gider; serbest metin gönderilemez.
 *   Büro, her mesaj türünü (`WhatsappSablon`) onaylı şablon adına eşler; parametreler sırayla doldurulur.
 *
 * Frontend kanallara doğrudan erişmez; `/api/kanallar`, `/api/gonderim/*` uçlarını bilir. Gönderimler
 * `Gonderim` kayıtlarıyla (outbox) izlenir; backend kuyruğu işler, idempotent gönderir ve yeniden dener.
 * Geliştirmede MSW handler'ları `mocks/kanal/mock-adapter.ts` uygulamasını kullanır.
 *
 * Kurallar:
 * - SMTP şifresi, bot token'ı ve Meta erişim anahtarı yalnızca backend'de (KMS ile şifreli) tutulur.
 * - Meta webhook'ları (teslim / okundu / hata) imza (X-Hub-Signature-256) doğrulanarak işlenir.
 */
import type { KanalAyari, WhatsappSablon } from "../types/domain"

export interface KanalMesaji {
  /** E-posta adresi, Telegram chat id veya 90XXXXXXXXXX telefon */
  adres: string
  konu: string
  metin: string
  /** Yalnızca WhatsApp: onaylı şablonun türü ve sıralı parametreleri */
  whatsappSablon?: WhatsappSablon
  parametreler?: string[]
  /** E-posta eki (arşiv dosyası) */
  ekArsivDosyaId?: string
}

export interface GonderimSonucu {
  basarili: boolean
  hataMesaji?: string
  /** Sağlayıcının mesaj kimliği (Meta wamid, SMTP Message-ID) */
  saglayiciId?: string
}

export interface KanalDogrulamaSonucu {
  gecerli: boolean
  hataMesaji?: string
}

export interface KanalAdapter {
  /** Kimlik bilgilerini dener (SMTP AUTH, getMe, Graph API phone number) */
  dogrula(ayar: KanalAyari, gizli: string): Promise<KanalDogrulamaSonucu>
  gonder(ayar: KanalAyari, mesaj: KanalMesaji): Promise<GonderimSonucu>
}
