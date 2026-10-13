import type {
  GonderimDurumu,
  GonderimKaynak,
  KanalDurumu,
  KanalTip,
  MukellefKanal,
  WhatsappSablon,
} from "../types/domain"

export const KANAL_ETIKET: Record<KanalTip, string> = {
  EPOSTA: "E-posta",
  TELEGRAM: "Telegram",
  WHATSAPP: "WhatsApp Business",
}

export const MUKELLEF_KANAL_ETIKET: Record<MukellefKanal, string> = {
  WHATSAPP: "WhatsApp",
  EPOSTA: "E-posta",
}

export const KANAL_DURUM_ETIKET: Record<KanalDurumu, string> = {
  BAGLI: "Bağlı",
  HATA: "Hatalı",
  YAPILANDIRILMADI: "Yapılandırılmadı",
}

export const GONDERIM_DURUM_ETIKET: Record<GonderimDurumu, string> = {
  KUYRUKTA: "Kuyrukta",
  GONDERILDI: "Gönderildi",
  HATA: "Hata",
  ELLE: "Elle paylaşıldı",
}

export const GONDERIM_KAYNAK_ETIKET: Record<GonderimKaynak, string> = {
  BILDIRIM: "Hatırlatma",
  TALEP: "Evrak talebi",
  TAHAKKUK: "Tahakkuk",
  BORC: "Borç hatırlatma",
  TEST: "Test",
}

export const WHATSAPP_SABLON_ETIKET: Record<WhatsappSablon, string> = {
  TALEP: "Evrak talebi",
  RED: "Reddedilen evrak",
  TAHAKKUK: "Tahakkuk gönderimi",
  BORC_HATIRLATMA: "Borç hatırlatma",
  PERSONEL_HATIRLATMA: "Personel hatırlatması",
}

export const E_POSTA_KONU: Record<string, string> = {
  TALEP: "Evrak talebi",
  RED: "Evrakınız tekrar gerekiyor",
  TAHAKKUK: "Beyanname tahakkuku",
  BORC_HATIRLATMA: "Hizmet bedeli hatırlatması",
}
