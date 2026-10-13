/**
 * Bordro çapraz kontrolleri — saf fonksiyonlar; mock handler ve (ileride) backend aynı hesabı
 * kullanır. Çıktı `MizanKontrol` şeklindedir; mizan kontrol arayüzü bileşenleri yeniden kullanılır.
 *
 * Bilinçli sınırlar:
 *  - Yalnızca "net > brüt" gibi saçma veri HATA üretir; diğer sapmalar UYARI'dır.
 *  - Vergi/prim oranı hesaplanmaz (oranlar, tavanlar, istisnalar ve teşvikler her yıl değişir).
 *  - Veri yoksa (tahakkuk, mizan) ilgili kontrol hiç eklenmez.
 *
 * Not: kontroller gerçek bordro ve tahakkuklarla kalibre edilmelidir. Asgari ücret istisnası ve
 * 5510 prim teşvikleri tahakkuku bordro yükümlülüğünün altında bırakabilir.
 */
import { formatTRY } from "../lib/format"
import type { BordroOzeti, MizanHesap, MizanKontrol } from "../types/domain"

/** Tutarlar bu kadar TL farkla eşit sayılır (mizan kontrolleriyle aynı) */
export const BORDRO_TOLERANS = 1

export interface BordroKontrolBaglami {
  /** Mükellef kartındaki çalışan sayısı */
  mukellefCalisanSayisi?: number
  /** Dönemin MUHSGK tahakkukundaki ödenecek toplam; tahakkuk yoksa tanımsız */
  muhsgkTahakkuk?: number
  /** Dönemin mizanı (ana hesap düzeyi); mizan yoksa tanımsız */
  mizanHesaplari?: MizanHesap[]
}

/** Bordrodan doğan vergi + prim yükümlülüğü (tahakkukla karşılaştırılır) */
export function bordroYukumlulugu(o: BordroOzeti): number {
  return (
    Math.round(
      (o.sgkIsciPayi +
        o.sgkIsverenPayi +
        o.issizlikToplam +
        o.gelirVergisi +
        o.damgaVergisi) *
        100
    ) / 100
  )
}

/** Toplam SGK + işsizlik primi (361 hesabıyla karşılaştırılır) */
export function bordroPrimToplami(o: BordroOzeti): number {
  return (
    Math.round((o.sgkIsciPayi + o.sgkIsverenPayi + o.issizlikToplam) * 100) /
    100
  )
}

/** Alacak bakiyesi (alacak − borç); borç bakiyesinde negatif */
function alacakBakiyesi(hesaplar: MizanHesap[], kod: string): number {
  const h = hesaplar.find((x) => x.kod === kod)
  return h ? h.alacak - h.borc : 0
}

export function bordroKontrolleri(
  ozet: BordroOzeti,
  baglam: BordroKontrolBaglami = {}
): MizanKontrol[] {
  const kontroller: MizanKontrol[] = []

  const tutarli =
    ozet.brutToplam > 0 &&
    ozet.netToplam >= 0 &&
    ozet.netToplam <= ozet.brutToplam
  kontroller.push({
    kod: "NET_BRUT",
    durum: tutarli ? "GECTI" : "HATA",
    baslik: "Net ücret brütü aşmıyor",
    aciklama: tutarli
      ? undefined
      : `Net toplam (${formatTRY(ozet.netToplam)}) brüt toplamdan (${formatTRY(ozet.brutToplam)}) büyük ya da brüt sıfır.`,
  })

  if (baglam.mukellefCalisanSayisi !== undefined) {
    const esit = ozet.calisanSayisi === baglam.mukellefCalisanSayisi
    kontroller.push({
      kod: "CALISAN",
      durum: esit ? "GECTI" : "UYARI",
      baslik: "Çalışan sayısı mükellef kartıyla uyumlu",
      aciklama: esit
        ? undefined
        : `Bordroda ${ozet.calisanSayisi}, mükellef kartında ${baglam.mukellefCalisanSayisi} çalışan var.`,
    })
  }

  if (baglam.muhsgkTahakkuk !== undefined) {
    const yukumluluk = bordroYukumlulugu(ozet)
    const fark = baglam.muhsgkTahakkuk - yukumluluk
    kontroller.push(
      fark < -BORDRO_TOLERANS
        ? {
            kod: "MUHSGK_TAHAKKUK",
            durum: "UYARI",
            baslik: "MUHSGK tahakkuku bordro yükümlülüğünden düşük",
            aciklama: `Tahakkuk ${formatTRY(baglam.muhsgkTahakkuk)}, bordro yükümlülüğü ${formatTRY(yukumluluk)}. Teşvik veya asgari ücret istisnası olabilir; değilse beyanname eksik girilmiş olabilir.`,
          }
        : {
            kod: "MUHSGK_TAHAKKUK",
            durum: "GECTI",
            baslik: "MUHSGK tahakkuku bordroyla uyumlu",
            aciklama:
              fark > BORDRO_TOLERANS
                ? `Tahakkuk bordro yükümlülüğünden ${formatTRY(fark)} fazla; kira veya serbest meslek stopajı gibi diğer kesintiler olabilir.`
                : undefined,
          }
    )
  }

  if (baglam.mizanHesaplari) {
    const prim = bordroPrimToplami(ozet)
    const b361 = alacakBakiyesi(baglam.mizanHesaplari, "361")
    const uyumlu361 = Math.abs(b361 - prim) <= BORDRO_TOLERANS
    kontroller.push({
      kod: "MIZAN_361",
      durum: uyumlu361 ? "GECTI" : "UYARI",
      baslik: "361 Ödenecek SGK primleri bordroyla uyumlu",
      aciklama: uyumlu361
        ? undefined
        : `Mizanda 361 alacak bakiyesi ${formatTRY(b361)}, bordro prim toplamı ${formatTRY(prim)}. Prim tahakkuku kaydedilmemiş ya da önceki ay primi ödenmemiş olabilir.`,
    })

    const b335 = alacakBakiyesi(baglam.mizanHesaplari, "335")
    const makul335 = b335 <= ozet.netToplam + BORDRO_TOLERANS
    kontroller.push({
      kod: "MIZAN_335",
      durum: makul335 ? "GECTI" : "UYARI",
      baslik: "335 Personele borçlar net ücreti aşmıyor",
      aciklama: makul335
        ? undefined
        : `Mizanda 335 alacak bakiyesi ${formatTRY(b335)}, dönem net ücreti ${formatTRY(ozet.netToplam)}. Önceki dönem ücretleri ödenmemiş ya da ödeme kaydı eksik olabilir.`,
    })
  }

  return kontroller
}
