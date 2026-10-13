/**
 * `GibTebligatAdapter`'ın geliştirme / test uygulaması. GİB e-Tebligat kutusunu taklit eder:
 * - Giriş: "hatali" içeren kullanıcı kodu veya şifre reddedilir (demo/test için); ayrıca her
 *   tarama ~%1,5 olasılıkla "şifre süresi doldu" hatası verir.
 * - Artımlı okuma: her taramada mükellef başına 0–2 yeni belge "düşer" (kullanıcı kodu ve son
 *   tarama anından deterministik). Belgeler `sonrasi` ile `simdi()` arasında ulaşmış görünür.
 */
import { Faker, base, en, tr } from "@faker-js/faker"
import { format, subHours } from "date-fns"

import type {
  GibTebligatAdapter,
  GibTebligatBelgesi,
} from "@prime/shared/tebligat/gib-adapter"
import { karma } from "@prime/mock-data/karma"

const BELGE_TURLERI = [
  ["Ödeme Emri", ["KDV borcu ödeme emri", "Muhtasar borcu ödeme emri"]],
  [
    "Vergi/Ceza İhbarnamesi",
    ["Usulsüzlük cezası ihbarnamesi", "Vergi ziyaı cezası ihbarnamesi"],
  ],
  ["İzaha Davet Yazısı", ["Sahte belge riski izaha davet"]],
  ["Bilgi İsteme Yazısı", ["Ba-Bs mutabakat bilgi isteme"]],
  ["Defter ve Belgelerin İbrazı", ["2025 yılı defter ve belgelerin ibrazı"]],
  ["Bilgilendirme Yazısı", ["Mükellefiyet bilgilendirmesi"]],
] as const

export function mockGibAdapter(
  simdi: () => Date = () => new Date()
): GibTebligatAdapter {
  return {
    async girisDogrula(k) {
      if (/hatali/i.test(k.sifre) || /hatali/i.test(k.kullaniciKodu))
        return {
          gecerli: false,
          hataMesaji: "GİB girişi başarısız: kullanıcı kodu veya şifre hatalı",
        }
      return { gecerli: true }
    },

    async yeniBelgeler(k, sonrasi) {
      const giris = await this.girisDogrula(k)
      if (!giris.gecerli)
        return { gecerli: false, hataMesaji: giris.hataMesaji! }

      const faker = new Faker({ locale: [tr, en, base] })
      faker.seed(karma(`gib:${k.kullaniciKodu}:${sonrasi ?? ""}`))
      if (faker.number.float() < 0.015)
        return {
          gecerli: false,
          hataMesaji:
            "GİB şifresinin süresi dolmuş; İVD'den yenileyip buraya girin",
        }

      const adet = faker.helpers.weightedArrayElement([
        { value: 0, weight: 44 },
        { value: 1, weight: 5 },
        { value: 2, weight: 1 },
      ])
      const bitis = simdi()
      const baslangic = sonrasi ? new Date(sonrasi) : subHours(bitis, 24)
      const belgeler: GibTebligatBelgesi[] = []
      for (let i = 0; i < adet; i++) {
        const ulasma = faker.date.between({ from: baslangic, to: bitis })
        const [belgeTuru, konular] = faker.helpers.arrayElement(BELGE_TURLERI)
        belgeler.push({
          belgeId: `gib-${k.kullaniciKodu}-${ulasma.getTime()}`,
          kurum: "GIB",
          belgeTuru,
          konu: faker.helpers.arrayElement(konular),
          belgeNo: `${format(ulasma, "yyyy")}-${faker.string.numeric(8)}`,
          ulasmaTarihi: ulasma.toISOString(),
        })
      }
      belgeler.sort((a, b) => a.ulasmaTarihi.localeCompare(b.ulasmaTarihi))
      return { gecerli: true, belgeler }
    },
  }
}
