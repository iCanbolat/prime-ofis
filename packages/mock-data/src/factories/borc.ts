import { Faker, base, en, tr } from "@faker-js/faker"

import {
  beklenenLevhaYili,
  borcuYokturGecerlilik,
} from "@prime/shared/borc/kurallar"
import { karma } from "../karma"
import { mockBorclar } from "../kamu/mock-adapter"
import type {
  ArsivDosya,
  BorcSorgusu,
  BorcuYokturTalebi,
  KamuDogrulama,
  KamuTarama,
  Mukellef,
  SgkErisim,
  TebligatErisim,
  VergiLevhasi,
} from "@prime/shared/types/domain"

export interface BorcSeed {
  sgkErisim: SgkErisim[]
  vergiLevhasi: VergiLevhasi[]
  borcSorgusu: BorcSorgusu[]
  borcuYoktur: BorcuYokturTalebi[]
  kamuDogrulama: KamuDogrulama[]
  kamuTarama: KamuTarama[]
  arsiv: ArsivDosya[]
}

/** Seed'deki son gece sorgusu (yerel 03:00); e-Tebligat taramasıyla aynı gece */
const SON_TARAMA = new Date(2026, 8, 22, 3, 0)
const SISTEM = "sistem"

/** Doğrulama görseli seed'de saklanmaz (süresi dolmuş sayılır, personel "yeni görsel" ister) */
const BOS_GORSEL =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='80'/%3E"

/**
 * GİB erişimi (e-Tebligat İVD) olan mükelleflerin son borç sorgusu ve çoğunun bu yılki levhası;
 * SGK işyeri olanların çoğunda SGK erişimi ve prim borcu sorgusu; bir doğrulama bekleyen GİB
 * girişi, bir hatalı SGK erişimi ve birkaç borcu yoktur talebi. Borç kalemleri mock adaptörle
 * aynı üretimden gelir (gece sorgusu aynı sonucu verir). Ayrı tohumlu faker: ortak faker sırası
 * bozulmasın.
 */
export function createBorcVerisi(
  mukellefler: Mukellef[],
  tebligatErisim: TebligatErisim[],
  personelIds: string[]
): BorcSeed {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(karma("borc-levha"))
  const tarama = SON_TARAMA.toISOString()
  const tarih = tarama.slice(0, 10)
  const levhaYili = beklenenLevhaYili("2026-09-22")
  const gibErisim = new Map(tebligatErisim.map((e) => [e.mukellefId, e]))
  const aktif = mukellefler.filter((m) => m.aktif)

  const seed: BorcSeed = {
    sgkErisim: [],
    vergiLevhasi: [],
    borcSorgusu: [],
    borcuYoktur: [],
    kamuDogrulama: [],
    kamuTarama: [],
    arsiv: [],
  }
  let dogrulamaAcildi = false
  let sorgulanan = 0
  let hatali = 0

  for (const [i, m] of aktif.entries()) {
    const g = gibErisim.get(m.id)
    if (g) {
      sorgulanan++
      if (g.durum === "HATA") hatali++
      else if (!dogrulamaAcildi && i > 2) {
        // Gece doğrulama ekranına takılan bir mükellef: bu sabah borcu sorgulanamadı
        dogrulamaAcildi = true
        seed.kamuDogrulama.push({
          id: "kd_001",
          mukellefId: m.id,
          kurum: "GIB",
          oturumId: `dg-GIB-${g.kullaniciKodu}-seed`,
          gorselDataUrl: BOS_GORSEL,
          sonGecerlilik: new Date(
            SON_TARAMA.getTime() + 5 * 60_000
          ).toISOString(),
          bekleyenAdimlar: ["BORC", "VERGI_LEVHASI"],
          olusturmaTarihi: tarama,
        })
      } else {
        seed.borcSorgusu.push({
          id: `${m.id}:GIB`,
          mukellefId: m.id,
          kurum: "GIB",
          kalemler: mockBorclar("GIB", g.kullaniciKodu, SON_TARAMA),
          sorguTarihi: tarama,
          sorgulayanId: SISTEM,
        })
        if (faker.datatype.boolean(0.75)) {
          const arsivId = `d_vl_${String(i + 1).padStart(3, "0")}`
          seed.arsiv.push({
            id: arsivId,
            mukellefId: m.id,
            kategori: "VERGI_LEVHASI",
            ad: `Vergi levhası ${levhaYili}.pdf`,
            mimeType: "application/pdf",
            boyut: 1800,
            yukleyenId: SISTEM,
            yuklemeTarihi: tarama,
            silindi: false,
          })
          seed.vergiLevhasi.push({
            id: `vl_${String(i + 1).padStart(3, "0")}`,
            mukellefId: m.id,
            yil: levhaYili,
            vergiTuru: m.tur === "SAHIS" ? "Gelir Vergisi" : "Kurumlar Vergisi",
            matrah: faker.number.float({
              min: 80_000,
              max: 3_500_000,
              fractionDigits: 2,
            }),
            onayKodu: faker.string.alphanumeric({
              length: 12,
              casing: "upper",
            }),
            sorguTarihi: tarama,
            arsivDosyaId: arsivId,
          })
        }
      }
    }

    if (!m.sgkIsyeriVar || faker.datatype.boolean(0.25)) continue
    const hataliSgk = seed.sgkErisim.length === 2
    const e: SgkErisim = {
      id: `se_${String(i + 1).padStart(3, "0")}`,
      mukellefId: m.id,
      kullaniciAdi: (m.tckn ?? m.vkn)!,
      isyeriKodu: String(faker.number.int({ min: 1, max: 9 })),
      sistemSifreIpucu: faker.string.alphanumeric(4),
      isyeriSifreIpucu: faker.string.alphanumeric(4),
      durum: hataliSgk ? "HATA" : "AKTIF",
      hataMesaji: hataliSgk
        ? "SGK girişi başarısız: işyeri şifresi değişmiş olabilir"
        : undefined,
      sonSorgu: hataliSgk ? undefined : tarama,
      tanimlayanId: m.sorumluPersonelId,
      tanimlamaTarihi: "2026-08-15T09:00:00.000Z",
    }
    seed.sgkErisim.push(e)
    sorgulanan++
    if (hataliSgk) {
      hatali++
      continue
    }
    seed.borcSorgusu.push({
      id: `${m.id}:SGK`,
      mukellefId: m.id,
      kurum: "SGK",
      kalemler: mockBorclar(
        "SGK",
        `${e.kullaniciAdi}-${e.isyeriKodu}`,
        SON_TARAMA
      ),
      sorguTarihi: tarama,
      sorgulayanId: SISTEM,
    })
  }

  // Borcu yoktur talepleri: biri hazır (arşivde), biri hazırlanıyor, borçlu biri reddedildi
  const borcsuz = seed.borcSorgusu.filter(
    (s) => s.kurum === "GIB" && s.kalemler.length === 0
  )
  const borclu = seed.borcSorgusu.find(
    (s) => s.kurum === "GIB" && s.kalemler.some((k) => k.vade < tarih)
  )
  const talepEden = personelIds[0]!
  if (borcsuz[0]) {
    seed.arsiv.push({
      id: "d_by_001",
      mukellefId: borcsuz[0].mukellefId,
      kategori: "BORCU_YOKTUR",
      ad: "GİB borcu yoktur yazısı 2026-09-18.pdf",
      mimeType: "application/pdf",
      boyut: 1800,
      yukleyenId: talepEden,
      yuklemeTarihi: "2026-09-18T10:30:00.000Z",
      gecerlilikTarihi: borcuYokturGecerlilik("2026-09-18"),
      silindi: false,
    })
    seed.borcuYoktur.push({
      id: "by_001",
      mukellefId: borcsuz[0].mukellefId,
      kurum: "GIB",
      talepNo: "GIB-20260918-104233",
      durum: "HAZIR",
      talepEdenId: talepEden,
      talepTarihi: "2026-09-18T09:40:00.000Z",
      sonucTarihi: "2026-09-18T10:30:00.000Z",
      gecerlilikTarihi: borcuYokturGecerlilik("2026-09-18"),
      arsivDosyaId: "d_by_001",
    })
  }
  if (borcsuz[1])
    seed.borcuYoktur.push({
      id: "by_002",
      mukellefId: borcsuz[1].mukellefId,
      kurum: "GIB",
      talepNo: "GIB-20260921-220117",
      durum: "TALEP_EDILDI",
      talepEdenId: talepEden,
      talepTarihi: "2026-09-21T15:10:00.000Z",
    })
  if (borclu)
    seed.borcuYoktur.push({
      id: "by_003",
      mukellefId: borclu.mukellefId,
      kurum: "GIB",
      talepNo: "GIB-20260915-551902",
      durum: "BORCU_VAR",
      talepEdenId: talepEden,
      talepTarihi: "2026-09-15T08:20:00.000Z",
      sonucTarihi: "2026-09-15T11:00:00.000Z",
      aciklama: "Vadesi geçmiş borç var; yazı verilmedi",
    })

  seed.kamuTarama.push({
    id: "kt_001",
    baslangic: tarama,
    bitis: new Date(SON_TARAMA.getTime() + 6 * 60_000).toISOString(),
    sorgulanan,
    hatali,
    dogrulama: seed.kamuDogrulama.length,
    levha: seed.vergiLevhasi.length,
  })
  return seed
}
