import { Faker, base, en, tr } from "@faker-js/faker"
import { addDays } from "date-fns"

import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { karma } from "../karma"
import type {
  Mukellef,
  Tebligat,
  TebligatDurum,
  TebligatErisim,
  TebligatTarama,
  TebligatTur,
} from "@prime/shared/types/domain"

const KONU: Record<TebligatTur, string[]> = {
  ODEME_EMRI: ["Ödeme Emri", "KDV borcu ödeme emri"],
  VERGI_CEZA_IHBARNAMESI: [
    "Vergi/Ceza İhbarnamesi",
    "Usulsüzlük cezası ihbarnamesi",
  ],
  IZAHA_DAVET: ["İzaha Davet Yazısı", "Sahte belge riski izaha davet"],
  BILGI_ISTEME: ["Bilgi İsteme Yazısı", "Ba-Bs mutabakat bilgi isteme"],
  INCELEME: ["Defter ve Belgelerin İbrazı"],
  DIGER: ["Bilgilendirme Yazısı", "Mükellefiyet bilgilendirmesi"],
}

/** Sabit örnekler: süre ekranında her durum görünsün (bugün ≈ 2026-09-23) */
const SABITLER: {
  tur: TebligatTur
  ulasma: string
  durum: TebligatDurum
  sgk?: boolean
}[] = [
  // Son günü yaklaşan (acil)
  { tur: "ODEME_EMRI", ulasma: "2026-09-05", durum: "YENI" },
  { tur: "IZAHA_DAVET", ulasma: "2026-09-06", durum: "INCELENDI" },
  // Süresi geçmiş, hâlâ açık
  { tur: "ODEME_EMRI", ulasma: "2026-08-03", durum: "INCELENDI" },
  // Yeni düşenler
  { tur: "VERGI_CEZA_IHBARNAMESI", ulasma: "2026-09-21", durum: "YENI" },
  { tur: "BILGI_ISTEME", ulasma: "2026-09-18", durum: "YENI", sgk: true },
  { tur: "ODEME_EMRI", ulasma: "2026-09-19", durum: "YENI" },
  { tur: "DIGER", ulasma: "2026-09-12", durum: "YENI" },
]

export interface TebligatSeed {
  tebligat: Tebligat[]
  tebligatErisim: TebligatErisim[]
  tebligatTarama: TebligatTarama[]
}

/** Seed'deki son gece taraması (yerel 03:00); uygulama açılınca kaçırılan geceler taranır */
const SON_TARAMA = new Date(2026, 8, 22, 3, 0).toISOString()

/**
 * Aktif mükelleflerin çoğunda erişim tanımlı; birkaçında giriş hatalı, kalanında tanımsız.
 * Ayrı tohumlu faker: ortak faker sırası (sonraki kanal verisi) bozulmasın.
 */
function createErisimler(
  mukellefler: Mukellef[],
  personelIds: string[]
): TebligatErisim[] {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(karma("tebligat-erisim"))
  return mukellefler
    .filter((m) => m.aktif)
    .flatMap((m, i): TebligatErisim[] => {
      const r = faker.number.float()
      if (r > 0.85) return []
      const hatali = i % 11 === 3
      return [
        {
          id: `te_${String(i + 1).padStart(3, "0")}`,
          mukellefId: m.id,
          kullaniciKodu: (m.tckn ?? m.vkn)!,
          sifreIpucu: faker.string.alphanumeric(4),
          durum: hatali ? "HATA" : "AKTIF",
          hataMesaji: hatali
            ? "GİB şifresinin süresi dolmuş; İVD'den yenileyip buraya girin"
            : undefined,
          sonTarama: hatali
            ? new Date(2026, 8, 15, 3, 0).toISOString()
            : SON_TARAMA,
          tanimlayanId: faker.helpers.arrayElement(personelIds),
          tanimlamaTarihi: "2026-06-01T09:00:00.000Z",
        },
      ]
    })
}

/** Son 90 günde ~25 tebligat; eskiler çoğunlukla işlem görmüş, yenileri açık */
export function createTebligatVerisi(
  faker: Faker,
  mukellefler: Mukellef[],
  personelIds: string[]
): TebligatSeed {
  const aktifler = mukellefler.filter((m) => m.aktif)
  let sira = 0
  const tebligat: Tebligat[] = []
  const ekle = (
    tur: TebligatTur,
    ulasmaYmd: string,
    durum: TebligatDurum,
    { sgk = false } = {}
  ) => {
    sira++
    const m = faker.helpers.arrayElement(aktifler)
    const ulasma = fromYmd(ulasmaYmd)
    ulasma.setHours(faker.number.int({ min: 8, max: 18 }), 15)
    tebligat.push({
      id: `tb_${String(sira).padStart(3, "0")}`,
      mukellefId: m.id,
      vkn: (m.vkn ?? m.tckn)!,
      kurum: sgk ? "SGK" : "GIB",
      tur,
      konu: faker.helpers.arrayElement(KONU[tur]),
      belgeNo: `${ulasmaYmd.slice(0, 4)}-${faker.string.numeric(8)}`,
      ulasmaTarihi: ulasma.toISOString(),
      durum,
      atananId: durum === "YENI" ? undefined : m.sorumluPersonelId,
      not:
        durum === "ISLEM_YAPILDI"
          ? faker.helpers.arrayElement([
              "Ödeme yapıldı, dekont arşivde.",
              "İzah dilekçesi verildi.",
              "Uzlaşma talebinde bulunuldu.",
            ])
          : undefined,
      // SGK tebligatları GİB kutusunda değildir; elle girilir
      kaynak: sgk ? "ELLE" : "GIB",
      gibBelgeId: sgk ? undefined : `gib-seed-${sira}`,
      olusturmaTarihi: ulasma.toISOString(),
    })
  }

  for (const s of SABITLER) ekle(s.tur, s.ulasma, s.durum, { sgk: s.sgk })

  const turler: TebligatTur[] = [
    "ODEME_EMRI",
    "ODEME_EMRI",
    "VERGI_CEZA_IHBARNAMESI",
    "IZAHA_DAVET",
    "BILGI_ISTEME",
    "INCELEME",
    "DIGER",
  ]
  for (let i = 0; i < 18; i++) {
    const gun = faker.number.int({ min: 20, max: 90 })
    const ulasma = addDays(fromYmd("2026-09-22"), -gun)
    ekle(
      faker.helpers.arrayElement(turler),
      toYmd(ulasma),
      faker.helpers.weightedArrayElement([
        { value: "ISLEM_YAPILDI" as const, weight: 6 },
        { value: "KAPANDI" as const, weight: 3 },
      ]),
      { sgk: faker.number.float() < 0.15 }
    )
  }

  tebligat.sort((a, b) => b.ulasmaTarihi.localeCompare(a.ulasmaTarihi))
  const tebligatErisim = createErisimler(mukellefler, personelIds)
  return {
    tebligat,
    tebligatErisim,
    tebligatTarama: [
      {
        id: "tt_001",
        baslangic: SON_TARAMA,
        bitis: new Date(2026, 8, 22, 3, 6).toISOString(),
        taranan: tebligatErisim.length,
        hatali: tebligatErisim.filter((e) => e.durum === "HATA").length,
        dogrulama: 0,
        yeni: 0,
      },
    ],
  }
}
