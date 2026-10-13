import type { Faker } from "@faker-js/faker"
import { subDays } from "date-fns"

import { takvimOlayId, yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import { fromYmd } from "@prime/shared/lib/tarih"
import type { BeyanDurumu, Mukellef, TakvimDurumKaydi } from "@prime/shared/types/domain"

/**
 * Seed'lenen durum aralığı: referans tarihten 12 ay önce ile 2 ay sonrası.
 * Gösterge paneli son 6 ayın gecikenlerini gösterdiği için geriye doğru geniş tutulur.
 */
const SEED_ARALIGI = { baslangic: "2025-09-01", bitis: "2026-10-31" }
/** Seed referans günü (SEED_REF_DATE ile aynı gün) */
const REFERANS = "2026-09-01"

/**
 * Gerçekçi beyan durumları: geçmiş dönemlerin neredeyse tamamı onaylı, çok küçük bir kısmı
 * unutulmuş (→ gecikenler), yaklaşanların bir kısmı hazırlanmış.
 */
export function createTakvimDurumlari(
  faker: Faker,
  mukellefler: Mukellef[]
): TakvimDurumKaydi[] {
  const kayitlar: TakvimDurumKaydi[] = []

  for (const m of mukellefler) {
    if (!m.aktif) continue
    for (const y of yukumlulukleriHesapla(m, SEED_ARALIGI)) {
      const r = faker.number.float({ min: 0, max: 1 })
      let durum: BeyanDurumu | null
      if (y.sonTarih < REFERANS) {
        durum = r < 0.97 ? "ONAYLANDI" : r < 0.99 ? "HAZIRLANDI" : null
      } else {
        durum = r < 0.25 ? "HAZIRLANDI" : r < 0.3 ? "ONAYLANDI" : null
      }
      if (!durum) continue

      kayitlar.push({
        id: takvimOlayId(m.id, y.tip, y.donem),
        mukellefId: m.id,
        tip: y.tip,
        donem: y.donem,
        durum,
        guncelleyenId: m.sorumluPersonelId,
        guncellemeTarihi: subDays(
          fromYmd(y.sonTarih),
          faker.number.int({ min: 1, max: 6 })
        ).toISOString(),
      })
    }
  }
  return kayitlar
}
