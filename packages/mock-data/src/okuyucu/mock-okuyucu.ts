/**
 * `BelgeOkuyucu`'nun geliştirme / test uygulaması. Gerçekte Claude belgeyi okur; burada gelen
 * evrak id'sinden tohumlanan faker ile deterministik bir fiş ya da ekstre üretilir:
 * - Fiş: tanınmış tedarikçilerden biri, 1–2 KDV oranı, tutarlı toplam, nakit / kart / veresiye.
 * - Ekstre: dönem içinde 6–18 hareket (SGK, vergi, kira, POS tahsilatı, EFT…).
 * - Dosya adında "bulanik" / "okunaksiz" geçerse okuma hatası (demo ve testler için).
 * Okumanın kendisi `OKUMA_SURESI_MS` sonra tamamlanır (handler'lar `okumalariTamamla` çağırır).
 */
import { Faker, base, en, tr } from "@faker-js/faker"
import { endOfMonth, format } from "date-fns"

import { OkumaHatasi, type OkumaSonucu } from "@prime/shared/fis-aktarimi/okuyucu"
import { kurus } from "@prime/shared/fis-aktarimi/kurallar"
import { fromYmd } from "@prime/shared/lib/tarih"
import { karma } from "../karma"
import type {
  EkstreHareketi,
  FisOdeme,
  KdvKirilimi,
  OkumaTur,
} from "@prime/shared/types/domain"

/** Mock okumanın sürdüğü süre: bu kadar sonra OKUNUYOR → OKUNDU / HATA */
export const OKUMA_SURESI_MS = 2500

const TEDARIKCILER = [
  { unvan: "Shell Petrol A.Ş.", vkn: "7620039536", oranlar: [20] },
  { unvan: "Migros Ticaret A.Ş.", vkn: "6220529513", oranlar: [1, 20] },
  { unvan: "Teknosa İç ve Dış Tic. A.Ş.", vkn: "8350004196", oranlar: [20] },
  { unvan: "Koçtaş Yapı Marketleri", vkn: "5760021867", oranlar: [20] },
  { unvan: "Office Kırtasiye Ltd. Şti.", vkn: "6431128790", oranlar: [20] },
  { unvan: "Lezzet Lokantası", vkn: "3920451187", oranlar: [10] },
  {
    unvan: "BİM Birleşik Mağazalar A.Ş.",
    vkn: "1750051846",
    oranlar: [1, 10, 20],
  },
]

const EKSTRE_KALIPLARI: {
  aciklama: string
  min: number
  max: number
  giris?: boolean
}[] = [
  { aciklama: "SGK PRİM ÖDEMESİ", min: 4_000, max: 30_000 },
  { aciklama: "GİB VERGİ ÖDEMESİ KDV", min: 1_500, max: 40_000 },
  { aciklama: "KİRA ÖDEMESİ {kisi}", min: 12_000, max: 45_000 },
  { aciklama: "ENERJİSA ELEKTRİK FATURA", min: 800, max: 6_000 },
  { aciklama: "TÜRK TELEKOM FATURA", min: 400, max: 2_500 },
  { aciklama: "POS TAHSİLAT {firma}", min: 2_000, max: 60_000, giris: true },
  { aciklama: "EFT GELEN - {firma}", min: 5_000, max: 150_000, giris: true },
  { aciklama: "EFT GİDEN - {firma}", min: 3_000, max: 90_000 },
  { aciklama: "HAVALE GİDEN - {firma}", min: 1_000, max: 25_000 },
  { aciklama: "HESAP İŞLETİM ÜCRETİ", min: 20, max: 150 },
]

const BANKALAR = [
  "Ziraat Bankası",
  "İş Bankası",
  "Garanti BBVA",
  "Yapı Kredi",
  "Akbank",
]

function tohumluFaker(anahtar: string) {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(karma(`okuma:${anahtar}`))
  return faker
}

function fisOku(faker: Faker, donem: string): OkumaSonucu {
  const t = faker.helpers.arrayElement(TEDARIKCILER)
  const oranlar = faker.helpers.arrayElements(t.oranlar, { min: 1, max: 2 })
  const kdvKirilimi: KdvKirilimi[] = oranlar
    .sort((a, b) => a - b)
    .map((oran) => {
      const matrah = kurus(faker.number.float({ min: 40, max: 4_500 }))
      return { oran, matrah, kdv: kurus((matrah * oran) / 100) }
    })
  const toplam = kurus(kdvKirilimi.reduce((s, k) => s + k.matrah + k.kdv, 0))
  const gun = faker.number.int({
    min: 1,
    max: endOfMonth(fromYmd(`${donem}-01`)).getDate(),
  })
  const odeme = faker.helpers.weightedArrayElement<FisOdeme>([
    { value: "KART", weight: 5 },
    { value: "NAKIT", weight: 3 },
    { value: "VERESIYE", weight: 2 },
  ])
  return {
    tur: "FIS",
    fis: {
      belgeTarihi: `${donem}-${String(gun).padStart(2, "0")}`,
      belgeNo: faker.helpers.replaceSymbols("??#######").toUpperCase(),
      saticiUnvan: t.unvan,
      saticiVkn: t.vkn,
      kdvKirilimi,
      toplam,
      odeme,
      guven: kurus(faker.number.float({ min: 0.6, max: 0.99 })),
    },
  }
}

function ekstreOku(faker: Faker, donem: string): OkumaSonucu {
  const son = endOfMonth(fromYmd(`${donem}-01`))
  const adet = faker.number.int({ min: 6, max: 18 })
  const hareketler: EkstreHareketi[] = Array.from({ length: adet }, () => {
    const k = faker.helpers.arrayElement(EKSTRE_KALIPLARI)
    const tutar = kurus(faker.number.float({ min: k.min, max: k.max }))
    const gun = faker.number.int({ min: 1, max: son.getDate() })
    return {
      tarih: `${donem}-${String(gun).padStart(2, "0")}`,
      aciklama: k.aciklama
        .replace("{firma}", faker.company.name().toLocaleUpperCase("tr-TR"))
        .replace("{kisi}", faker.person.lastName().toLocaleUpperCase("tr-TR")),
      tutar: k.giris ? tutar : -tutar,
    }
  }).sort((a, b) => a.tarih.localeCompare(b.tarih))
  return {
    tur: "EKSTRE",
    ekstre: {
      banka: faker.helpers.arrayElement(BANKALAR),
      iban: `TR${faker.string.numeric(24)}`,
      donemBas: `${donem}-01`,
      donemSon: format(son, "yyyy-MM-dd"),
      hareketler,
    },
  }
}

/**
 * Belgeyi "okur". `anahtar` (gelen evrak id'si) aynı kaldıkça sonuç aynıdır; `donem` belgenin
 * ait olduğu ay ("2026-08"), tarihler bu aya düşer.
 */
export function mockBelgeOku(
  anahtar: string,
  dosyaAdi: string,
  tur: OkumaTur,
  donem: string
): OkumaSonucu {
  const ad = dosyaAdi.toLocaleLowerCase("tr-TR")
  if (ad.includes("bulanik") || ad.includes("okunaksiz"))
    throw new OkumaHatasi(
      tur === "FIS"
        ? "Fiş okunamadı: görüntü bulanık ya da tutar alanı kesik"
        : "Ekstre okunamadı: hareket tablosu bulunamadı"
    )
  const faker = tohumluFaker(anahtar)
  return tur === "FIS" ? fisOku(faker, donem) : ekstreOku(faker, donem)
}
