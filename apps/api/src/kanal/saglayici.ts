import { epostaGecerli, telefonNormalize } from "@prime/shared/evrak-talebi/mesaj"
import type {
  GonderimSonucu,
  KanalAdapter,
  KanalDogrulamaSonucu,
  KanalMesaji,
} from "@prime/shared/kanal/kanal-adapter"
import type { KanalAyari } from "@prime/shared/types/domain"
import { karma } from "@prime/mock-data/karma"

/** Sunucuda gönderilen mesaj: e-posta eki arşivden okunmuş hâliyle gelir */
export interface SunucuMesaji extends KanalMesaji {
  ekler?: { ad: string; mimeType: string; icerik: Buffer }[]
}

/** `gecici`: ağ / hız sınırı / sağlayıcı 5xx — kuyruk yeniden dener; değilse kalıcı hata */
export interface SaglayiciSonucu extends GonderimSonucu {
  gecici?: boolean
}

/**
 * Kanal sağlayıcısı (`KanalAdapter` sözleşmesi). `KANAL_ADAPTER=mock` geliştirme ve testte
 * deterministik taklit; `gercek` SMTP (nodemailer) ve Meta WhatsApp Cloud API.
 */
export abstract class KanalSaglayici implements KanalAdapter {
  abstract dogrula(ayar: KanalAyari, gizli: string): Promise<KanalDogrulamaSonucu>
  abstract gonder(
    ayar: KanalAyari,
    mesaj: SunucuMesaji,
    gizli?: string
  ): Promise<SaglayiciSonucu>
}

/** Mock adaptörle birebir (`apps/client/src/mocks/kanal/mock-adapter.ts`); hatalar kalıcıdır */
export class MockKanalSaglayici extends KanalSaglayici {
  async dogrula(ayar: KanalAyari, gizli: string): Promise<KanalDogrulamaSonucu> {
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
  }

  async gonder(ayar: KanalAyari, mesaj: SunucuMesaji): Promise<SaglayiciSonucu> {
    if (ayar.durum === "HATA")
      return { basarili: false, hataMesaji: ayar.hataMesaji ?? "Kanal bağlantısı hatalı" }
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
}
