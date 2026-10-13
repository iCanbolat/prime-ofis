/**
 * `BordroOkuyucu`'nun geliştirme / test uygulaması. Gerçekte Claude belgeyi okur; burada dosya
 * adından tohumlanan faker ile tutarlı bir dönem özeti üretilir. Dosya adında "bulanik" /
 * "okunaksiz" geçerse okuma hatası, "dusukguven" geçerse düşük güven döner (demo ve testler için).
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import {
  BordroOkuyucuHatasi,
  type BordroOkumaSonucu,
} from "@prime/shared/bordro/okuyucu"
import { ornekBordroOzeti } from "@prime/mock-data/factories/bordro"
import { karma } from "@prime/mock-data/karma"

export function mockBordroOku(dosyaAdi: string): BordroOkumaSonucu {
  const ad = dosyaAdi.toLocaleLowerCase("tr-TR")
  if (ad.includes("bulanik") || ad.includes("okunaksiz"))
    throw new BordroOkuyucuHatasi(
      "Bordro okunamadı: görüntü bulanık ya da toplam satırı bulunamadı"
    )
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(karma(`bordro:${dosyaAdi}`))
  return {
    ozet: ornekBordroOzeti(faker, faker.number.int({ min: 2, max: 40 })),
    guven: ad.includes("dusukguven")
      ? 0.55
      : faker.number.float({ min: 0.88, max: 0.99, fractionDigits: 2 }),
  }
}
