import {
  YUKUMLULUK_SIRASI,
  YUKUMLULUK_TANIMLARI,
} from "../takvim/kurallar"
import type {
  BeyanDurumu,
  GorevDurum,
  GorevOncelik,
  GorevTip,
} from "../types/domain"

export const GOREV_DURUM_SIRASI: GorevDurum[] = [
  "YAPILACAK",
  "DEVAM",
  "KONTROL",
  "TAMAM",
]

export const GOREV_DURUM_ETIKET: Record<GorevDurum, string> = {
  YAPILACAK: "Yapılacak",
  DEVAM: "Devam",
  KONTROL: "Kontrol",
  TAMAM: "Tamam",
}

export const GOREV_ONCELIK_SIRASI: GorevOncelik[] = [
  "YUKSEK",
  "NORMAL",
  "DUSUK",
]

export const GOREV_ONCELIK_ETIKET: Record<GorevOncelik, string> = {
  YUKSEK: "Yüksek",
  NORMAL: "Normal",
  DUSUK: "Düşük",
}

export const GOREV_TIP_SIRASI: GorevTip[] = [...YUKUMLULUK_SIRASI, "DIGER"]

export const GOREV_TIP_ETIKET: Record<GorevTip, string> = {
  ...(Object.fromEntries(
    YUKUMLULUK_SIRASI.map((t) => [t, YUKUMLULUK_TANIMLARI[t].kisaAd])
  ) as Record<Exclude<GorevTip, "DIGER">, string>),
  DIGER: "Diğer",
}

export const GOREV_TIP_RENK: Record<GorevTip, string> = {
  ...(Object.fromEntries(
    YUKUMLULUK_SIRASI.map((t) => [t, YUKUMLULUK_TANIMLARI[t].renk])
  ) as Record<Exclude<GorevTip, "DIGER">, string>),
  DIGER: "bg-muted text-muted-foreground",
}

/** Görev tipine göre varsayılan kontrol listesi */
export const CHECKLIST_SABLONLARI: Record<GorevTip, string[]> = {
  KDV: [
    "Faturalar alındı",
    "Beyanname hazırlandı",
    "Müşteri onayı",
    "Tahakkuk gönderildi",
  ],
  MUHTASAR_SGK: [
    "Puantaj ve bordro alındı",
    "Bordro hazırlandı",
    "Beyanname hazırlandı",
    "Tahakkuk gönderildi",
  ],
  GECICI_VERGI: [
    "Mizan kontrol edildi",
    "Geçici vergi hesaplandı",
    "Müşteri onayı",
    "Tahakkuk gönderildi",
  ],
  KURUMLAR: [
    "Yıl sonu kapanış kayıtları",
    "Bilanço ve gelir tablosu",
    "Beyanname hazırlandı",
    "Müşteri onayı",
    "Tahakkuk gönderildi",
  ],
  GELIR: [
    "Gelir belgeleri toplandı",
    "İndirimler kontrol edildi",
    "Beyanname hazırlandı",
    "Tahakkuk gönderildi",
  ],
  BA_BS: ["Faturalar eşleştirildi", "Formlar hazırlandı", "Gönderildi"],
  E_DEFTER_BERAT: [
    "Kayıtlar kontrol edildi",
    "Defter oluşturuldu",
    "Berat yüklendi",
  ],
  DIGER: [],
}

/** Görev bu sütunlara geçince takvimdeki beyan durumu ileri taşınır (tek yönlü senkron). */
export const TAKVIM_SENKRON: Partial<Record<GorevDurum, BeyanDurumu>> = {
  KONTROL: "HAZIRLANDI",
  TAMAM: "ONAYLANDI",
}

/** Kanban panosu görünür alanı doldurur; sütunlar kendi içinde kayar (en az 26rem) */
export const KANBAN_YUKSEKLIGI = "h-[max(26rem,calc(100svh-15rem))]"

/** Liste görünümünde sayfa başına görev (istemci taraflı sayfalama) */
export const GOREV_SAYFA_BOYUTU = 25
