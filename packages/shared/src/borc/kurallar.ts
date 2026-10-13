/**
 * Borç ve levha sorgularının saf kuralları (istemci ve mock sunucu ortak kullanır).
 */
import { addDays } from "date-fns"

import { fromYmd, toYmd } from "../lib/tarih"
import type {
  BorcKalemiView,
  BorcToplami,
  BorcuYokturGorunum,
} from "../types/api"
import type {
  BorcKalemi,
  BorcuYokturTalebi,
  Tahakkuk,
  VergiLevhasi,
} from "../types/domain"
import {
  BORCU_YOKTUR_GECERLILIK_GUN,
  LEVHA_YAYIN_GUNU,
} from "./sabitler"

const kurus = (n: number) => Math.round(n * 100) / 100

export const kalemToplami = (k: BorcKalemi) => kurus(k.asil + k.gecikme)

/** Vade günü geçmişse (vade günü dahil değil) */
export const vadesiGectiMi = (k: BorcKalemi, bugunYmd: string) =>
  k.vade < bugunYmd

export function borcToplami(
  kalemler: BorcKalemi[],
  bugunYmd: string
): BorcToplami {
  let toplam = 0
  let vadesiGecmis = 0
  let enEskiVade: string | undefined
  for (const k of kalemler) {
    const t = kalemToplami(k)
    toplam += t
    if (vadesiGectiMi(k, bugunYmd)) vadesiGecmis += t
    if (!enEskiVade || k.vade < enEskiVade) enEskiVade = k.vade
  }
  return {
    toplam: kurus(toplam),
    vadesiGecmis: kurus(vadesiGecmis),
    kalemSayisi: kalemler.length,
    enEskiVade,
  }
}

/**
 * Borç kalemini aynı mükellefin içe aktarılmış tahakkukuyla (tip + dönem) eşleştirir: tahakkuk
 * varsa beyan verilmiş ama ödenmemiştir; yoksa borcun tahakkuku büroya gelmemiştir.
 */
export function kalemleriGoster(
  kalemler: BorcKalemi[],
  tahakkuklar: Pick<Tahakkuk, "id" | "tip" | "donem">[],
  bugunYmd: string
): BorcKalemiView[] {
  return kalemler
    .map((k) => ({
      ...k,
      toplam: kalemToplami(k),
      vadesiGecti: vadesiGectiMi(k, bugunYmd),
      tahakkukId: k.yukumlulukTip
        ? tahakkuklar.find(
            (t) => t.tip === k.yukumlulukTip && t.donem === k.donem
          )?.id
        : undefined,
    }))
    .sort((a, b) => a.vade.localeCompare(b.vade))
}

/**
 * Bugün GİB'de bulunması beklenen en yeni levhanın yılı. Levha, yıllık gelir / kurumlar
 * beyanından sonra oluşur; yayın günü (`LEVHA_YAYIN_GUNU`) geçtiyse geçen yılın, geçmediyse
 * iki yıl öncesinin levhası beklenir. **Tarih mevzuata göre doğrulanmalı.**
 */
export function beklenenLevhaYili(bugunYmd: string): number {
  const yil = Number(bugunYmd.slice(0, 4))
  return bugunYmd.slice(5) > LEVHA_YAYIN_GUNU ? yil - 1 : yil - 2
}

export function levhaGuncelMi(
  levhalar: Pick<VergiLevhasi, "yil">[],
  bugunYmd: string
): boolean {
  const beklenen = beklenenLevhaYili(bugunYmd)
  return levhalar.some((l) => l.yil >= beklenen)
}

export function borcuYokturGecerlilik(sonucYmd: string): string {
  return toYmd(addDays(fromYmd(sonucYmd), BORCU_YOKTUR_GECERLILIK_GUN))
}

export function borcuYokturGorunum(
  t: Pick<BorcuYokturTalebi, "durum" | "gecerlilikTarihi">,
  bugunYmd: string
): BorcuYokturGorunum {
  if (
    t.durum === "HAZIR" &&
    t.gecerlilikTarihi &&
    t.gecerlilikTarihi < bugunYmd
  )
    return "SURESI_DOLDU"
  return t.durum
}

/** Henüz sonuçlanmamış talep (aynı kurumda ikinci talep açılamaz) */
export const borcuYokturAcikMi = (t: Pick<BorcuYokturTalebi, "durum">) =>
  t.durum === "DOGRULAMA_BEKLIYOR" || t.durum === "TALEP_EDILDI"
