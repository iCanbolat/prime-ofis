/**
 * Görev kuralları — saf fonksiyonlar. Mock sunucu ve arayüz ortak kullanır.
 */
import { addMonths, subMonths } from "date-fns"

import {
  KURALLAR,
  YUKUMLULUK_TANIMLARI,
  type Periyot,
} from "../takvim/kurallar"
import {
  donemEtiketi,
  takvimOlayId,
  yukumlulukleriHesapla,
} from "../takvim/motor"
import { fromYmd, toYmd } from "../lib/tarih"
import type { DonemPlanSatiri } from "../types/api"
import type {
  Gorev,
  GorevChecklistMaddesi,
  Mukellef,
  Personel,
  YukumlulukTip,
} from "../types/domain"

export function checklistIlerleme(checklist: GorevChecklistMaddesi[]) {
  const toplam = checklist.length
  const tamam = checklist.filter((m) => m.tamam).length
  return {
    tamam,
    toplam,
    yuzde: toplam === 0 ? 0 : Math.round((tamam / toplam) * 100),
  }
}

export function gecikmisMi(
  g: Pick<Gorev, "sonTarih" | "durum">,
  bugunYmd: string
): boolean {
  return g.durum !== "TAMAM" && g.sonTarih < bugunYmd
}

/** Yönetici her görevi, personel yalnızca kendisine atanmış görevi "Tamam"a taşıyabilir. */
export function tamamaTasiyabilirMi(
  user: Pick<Personel, "id" | "rol"> | null | undefined,
  g: Pick<Gorev, "atananId">
): boolean {
  if (!user) return false
  return user.rol === "YONETICI" || g.atananId === user.id
}

/** "2026-08" → 1 Ağustos 2026, "2026-Q2" → 1 Nisan 2026, "2025" → 1 Ocak 2025 */
export function donemBaslangici(donem: string): Date | null {
  const ay = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(donem)
  if (ay) return new Date(Number(ay[1]), Number(ay[2]) - 1, 1)
  const ceyrek = /^(\d{4})-Q([1-4])$/.exec(donem)
  if (ceyrek) return new Date(Number(ceyrek[1]), (Number(ceyrek[2]) - 1) * 3, 1)
  if (/^\d{4}$/.test(donem)) return new Date(Number(donem), 0, 1)
  return null
}

export function otomatikGorevBasligi(tip: YukumlulukTip, donem: string) {
  return `${YUKUMLULUK_TANIMLARI[tip].ad} — ${donemEtiketi(donem)}`
}

/**
 * Seçili tip + dönem için, bu yükümlülüğe tabi aktif mükellefleri ve son günlerini döner.
 * `mevcutAnahtarlar`: otomatikAnahtar → görev id (zaten oluşturulmuş görevler).
 */
export function donemGorevleriniPlanla(
  mukellefler: Mukellef[],
  tip: YukumlulukTip,
  donem: string,
  mevcutAnahtarlar: ReadonlyMap<string, string>
): DonemPlanSatiri[] {
  const baslangic = donemBaslangici(donem)
  if (!baslangic) return []
  // En uzun gecikme: yıllık kurumlar (izleyen yılın Nisan sonu)
  const aralik = {
    baslangic: toYmd(baslangic),
    bitis: toYmd(addMonths(baslangic, 17)),
  }

  const satirlar: DonemPlanSatiri[] = []
  for (const m of mukellefler) {
    if (!m.aktif) continue
    const y = yukumlulukleriHesapla(m, aralik).find(
      (x) => x.tip === tip && x.donem === donem
    )
    if (!y) continue
    satirlar.push({
      mukellefId: m.id,
      unvan: m.unvan,
      tur: m.tur,
      atananId: m.sorumluPersonelId,
      sonTarih: y.sonTarih,
      mevcutGorevId: mevcutAnahtarlar.get(takvimOlayId(m.id, tip, donem)),
    })
  }
  return satirlar.sort((a, b) => a.unvan.localeCompare(b.unvan, "tr-TR"))
}

/**
 * Yorumdaki `@Ad` (ardından soyad gelebilir) bahsetmelerini personel id'lerine çözer.
 * Aynı kişi bir kez döner.
 */
export function bahsedilenleriCoz(
  metin: string,
  personel: Pick<Personel, "id" | "ad" | "soyad">[]
): string[] {
  const kucuk = metin.toLocaleLowerCase("tr-TR")
  const sonuc: string[] = []
  for (const p of personel) {
    const ad = `@${p.ad}`.toLocaleLowerCase("tr-TR")
    let i = kucuk.indexOf(ad)
    while (i !== -1) {
      const sonraki = kucuk[i + ad.length]
      // "@Ali" "@Alican" ile eşleşmesin
      if (sonraki === undefined || !/[\p{L}\p{N}]/u.test(sonraki)) {
        sonuc.push(p.id)
        break
      }
      i = kucuk.indexOf(ad, i + 1)
    }
  }
  return sonuc
}

/** Yükümlülük tipinin olası dönem periyotları (KDV: aylık + 3 aylık) */
export function tipPeriyotlari(tip: YukumlulukTip): Periyot[] {
  return [
    ...new Set(KURALLAR.filter((k) => k.tip === tip).map((k) => k.periyot)),
  ]
}

export interface DonemSecenegi {
  value: string
  label: string
}

/**
 * Seçilebilir dönemler (yeniden eskiye): son 6 ay + gelecek ay, son 4 çeyrek, son 2 yıl.
 * Varsayılan olarak önerilen dönem ilk sıradadır (beyanı bu ay verilen: geçen ay).
 */
export function donemSecenekleri(
  bugunYmd: string,
  periyotlar: Periyot[] = ["AYLIK", "UC_AYLIK", "YILLIK"]
): DonemSecenegi[] {
  const bugunTarih = fromYmd(bugunYmd)
  const sonuc: string[] = []
  if (periyotlar.includes("AYLIK")) {
    // Geçen ay (önerilen), daha eski 5 ay, sonra içinde bulunulan ay
    for (const geri of [1, 2, 3, 4, 5, 6, 0]) {
      const d = subMonths(bugunTarih, geri)
      sonuc.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      )
    }
  }
  if (periyotlar.includes("UC_AYLIK")) {
    for (let i = 1; i <= 4; i++) {
      const d = subMonths(bugunTarih, i * 3)
      sonuc.push(`${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`)
    }
  }
  if (periyotlar.includes("YILLIK")) {
    const yil = bugunTarih.getFullYear()
    sonuc.push(String(yil - 1), String(yil - 2))
  }
  return sonuc.map((value) => ({ value, label: donemEtiketi(value) }))
}
