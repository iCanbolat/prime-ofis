/**
 * `KanalAdapter`'ın geliştirme / test uygulaması. Gerçek sağlayıcıları taklit eder:
 * - Doğrulama: "hatali" içeren şifre / token reddedilir (demo/test için).
 * - Gönderim: kanal HATA durumundaysa kimlik doğrulama hatası; geçersiz e-posta / telefon,
 *   eşlenmemiş WhatsApp şablonu veya bağlanmamış Telegram sohbeti hata döner. Rastgelelik yoktur.
 */
import type {
  GonderimSonucu,
  KanalAdapter,
  KanalMesaji,
} from "@prime/shared/kanal/kanal-adapter"
import { epostaGecerli, telefonNormalize } from "@prime/shared/evrak-talebi/mesaj"
import { karma } from "@prime/mock-data/karma"
import type { KanalAyari } from "@prime/shared/types/domain"

/** Senkron gönderim (mock backend outbox'ı tek yazmada doldurabilsin diye) */
export function mockGonder(
  ayar: KanalAyari,
  mesaj: KanalMesaji
): GonderimSonucu {
  if (ayar.durum === "HATA")
    return {
      basarili: false,
      hataMesaji: ayar.hataMesaji ?? "Kanal bağlantısı hatalı",
    }
  if (ayar.tip === "EPOSTA" && !epostaGecerli(mesaj.adres))
    return { basarili: false, hataMesaji: "Geçersiz e-posta adresi" }
  if (ayar.tip === "TELEGRAM" && !mesaj.adres)
    return { basarili: false, hataMesaji: "Telegram sohbeti bağlanmamış" }
  if (ayar.tip === "WHATSAPP") {
    if (!telefonNormalize(mesaj.adres))
      return { basarili: false, hataMesaji: "Geçersiz cep telefonu numarası" }
    if (!mesaj.whatsappSablon || !ayar.sablonlar[mesaj.whatsappSablon])
      return {
        basarili: false,
        hataMesaji: "Bu mesaj türü için onaylı WhatsApp şablonu eşlenmemiş",
      }
  }
  return {
    basarili: true,
    saglayiciId: `${ayar.tip.toLowerCase()}-${karma(`${mesaj.adres}:${mesaj.metin}`).toString(16)}`,
  }
}

export const mockKanalAdapter: KanalAdapter = {
  async dogrula(ayar, gizli) {
    if (/hatali/i.test(gizli))
      return {
        gecerli: false,
        hataMesaji:
          ayar.tip === "EPOSTA"
            ? "SMTP kimlik doğrulaması başarısız (535)"
            : ayar.tip === "TELEGRAM"
              ? "Bot token geçersiz (401 Unauthorized)"
              : "Meta erişim anahtarı geçersiz veya süresi dolmuş (OAuthException 190)",
      }
    return { gecerli: true }
  },

  async gonder(ayar, mesaj) {
    return mockGonder(ayar, mesaj)
  },
}
