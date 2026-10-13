/**
 * `KamuSorguAdapter`'ın geliştirme / test uygulaması. GİB İnteraktif VD ve SGK İşveren Sistemi'ni
 * taklit eder:
 * - Giriş: "hatali" içeren kullanıcı kodu veya şifre reddedilir. Kullanıcı kodunda "dogrulama"
 *   geçerse her girişte, aksi halde günde ~%3 olasılıkla doğrulama ekranı çıkar. Görselde kod
 *   açıkça yazılıdır (mock); personel bu kodu girer. Yanlış kod yeni görsel döndürür.
 * - Borçlar kimlikten deterministiktir (GİB'de mükelleflerin ~%15'i, SGK'da ~%12'si borçlu); vadeler
 *   bugüne göreli üretilir.
 * - Borcu yoktur talebi ilk sonuç sorgusunda sonuçlanır: borcu varsa BORCU_VAR, yoksa HAZIR.
 */
import { Faker, base, en, tr } from "@faker-js/faker"
import { format, subMonths } from "date-fns"

import type {
  KamuKimlik,
  KamuOturum,
  KamuSorguAdapter,
} from "@prime/shared/borc/kamu-adapter"
import { toYmd } from "@prime/shared/lib/tarih"
import { karma } from "../karma"
import { placeholderIcerik } from "../placeholder"
import type { BorcKalemi, KamuKurum, YukumlulukTip } from "@prime/shared/types/domain"

const kimlikKodu = (k: KamuKimlik) =>
  k.kurum === "GIB" ? k.kullaniciKodu : `${k.kullaniciAdi}-${k.isyeriKodu}`

const sifreler = (k: KamuKimlik) =>
  k.kurum === "GIB" ? [k.sifre] : [k.sistemSifre, k.isyeriSifre]

const oturumKodu = (o: KamuOturum) => o.oturumId.slice(o.kurum.length + 1)

/** Doğrulama oturumunun (mock) kodu: görselde yazan 5 haneli sayı */
export function mockDogrulamaKodu(oturumId: string): string {
  return String(10000 + (karma(oturumId) % 90000))
}

function dogrulamaGorseli(kod: string): string {
  const harfler = kod
    .split("")
    .map(
      (c, i) =>
        `<text x="${28 + i * 34}" y="${48 + (i % 2 ? -6 : 6)}" transform="rotate(${i % 2 ? 8 : -8} ${40 + i * 34} 44)" font-family="monospace" font-size="34" font-weight="700" fill="#2d3320">${c}</text>`
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80" viewBox="0 0 220 80"><rect width="220" height="80" rx="10" fill="#eef0e6"/><path d="M8 60 Q60 20 110 52 T212 30" stroke="#a9ae94" stroke-width="2" fill="none"/><path d="M8 24 Q70 64 130 30 T212 58" stroke="#c9ccb8" stroke-width="2" fill="none"/>${harfler}<text x="110" y="74" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#6b705c">Örnek doğrulama görseli (mock)</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const GIB_KALEMLERI: [string, YukumlulukTip | undefined][] = [
  ["Katma Değer Vergisi", "KDV"],
  ["Muhtasar ve Prim Hizmet Beyannamesi", "MUHTASAR_SGK"],
  ["Geçici vergi", "GECICI_VERGI"],
  ["Damga vergisi", undefined],
  ["Usulsüzlük cezası", undefined],
]

function faker(tohum: string) {
  const f = new Faker({ locale: [tr, en, base] })
  f.seed(karma(tohum))
  return f
}

/** Kimlik kodundan deterministik borç kalemleri (seed de aynı üretimi kullanır) */
export function mockBorclar(
  kurum: KamuKurum,
  kod: string,
  simdi: Date
): BorcKalemi[] {
  const f = faker(`borc:${kurum}:${kod}`)
  if (f.number.float() >= (kurum === "GIB" ? 0.15 : 0.12)) return []
  const adet = f.number.int({ min: 1, max: 3 })
  const kalemler: BorcKalemi[] = []
  for (let i = 0; i < adet; i++) {
    // Dönem: son 1–4 ay; vade: dönemi izleyen ayın 26 / 28'i
    const donemTarihi = subMonths(simdi, f.number.int({ min: 1, max: 4 }))
    const [tur, yukumlulukTip] =
      kurum === "GIB"
        ? f.helpers.arrayElement(GIB_KALEMLERI)
        : (["SGK primi", undefined] as const)
    // Geçici vergi çeyreklik dönemdir (takvim / tahakkuk biçimi "2026-Q2")
    const donem =
      yukumlulukTip === "GECICI_VERGI"
        ? `${donemTarihi.getFullYear()}-Q${Math.floor(donemTarihi.getMonth() / 3) + 1}`
        : format(donemTarihi, "yyyy-MM")
    const vade = new Date(
      donemTarihi.getFullYear(),
      donemTarihi.getMonth() + 1,
      yukumlulukTip === "KDV" ? 28 : 26
    )
    const asil = f.number.float({ min: 800, max: 85000, fractionDigits: 2 })
    const gecikmeGun = Math.max(
      0,
      Math.round((simdi.getTime() - vade.getTime()) / 86_400_000)
    )
    kalemler.push({
      tur,
      yukumlulukTip,
      donem,
      vade: toYmd(vade),
      asil,
      // Aylık ~%4,5 gecikme zammı (yaklaşık; mock)
      gecikme: Math.round(asil * 0.0015 * gecikmeGun * 100) / 100,
    })
  }
  return kalemler
}

export function mockKamuAdapter(
  simdi: () => Date = () => new Date()
): KamuSorguAdapter {
  let sayac = 0
  const yeniDogrulama = (k: KamuKimlik) => {
    const oturumId = `dg-${k.kurum}-${kimlikKodu(k)}-${crypto.randomUUID().slice(0, 8)}`
    return {
      oturumId,
      gorselDataUrl: dogrulamaGorseli(mockDogrulamaKodu(oturumId)),
    }
  }

  return {
    async giris(k, dogrulama) {
      const kod = kimlikKodu(k)
      if ([kod, ...sifreler(k)].some((s) => /hatali/i.test(s)))
        return {
          durum: "HATA",
          hataMesaji:
            k.kurum === "GIB"
              ? "GİB girişi başarısız: kullanıcı kodu veya şifre hatalı"
              : "SGK girişi başarısız: kullanıcı adı, işyeri kodu veya şifre hatalı",
        }
      if (dogrulama) {
        if (dogrulama.kod.trim() !== mockDogrulamaKodu(dogrulama.oturumId))
          return { durum: "DOGRULAMA", ...yeniDogrulama(k) }
      } else if (
        /dogrulama/i.test(kod) ||
        faker(`dogrulama:${k.kurum}:${kod}:${toYmd(simdi())}`).number.float() <
          0.03
      ) {
        return { durum: "DOGRULAMA", ...yeniDogrulama(k) }
      }
      return {
        durum: "TAMAM",
        oturum: { kurum: k.kurum, oturumId: `${k.kurum}:${kod}` },
      }
    },

    async dogrulamaYenile(k) {
      return yeniDogrulama(k)
    },

    async vergiLevhasi(o, yil) {
      if (o.kurum !== "GIB") return null
      const f = faker(`levha:${oturumKodu(o)}:${yil}`)
      return {
        yil,
        vergiTuru: f.helpers.arrayElement([
          "Kurumlar Vergisi",
          "Gelir Vergisi",
        ]),
        matrah: f.number.float({
          min: 50_000,
          max: 4_000_000,
          fractionDigits: 2,
        }),
        onayKodu: f.string.alphanumeric({ length: 12, casing: "upper" }),
        pdfDataUrl: placeholderIcerik({
          ad: `Vergi levhasi ${yil}`,
          mimeType: "application/pdf",
        }),
      }
    },

    async borclar(o) {
      return mockBorclar(o.kurum, oturumKodu(o), simdi())
    },

    async borcuYokturTalep(o) {
      return {
        talepNo: `${o.kurum}-${format(simdi(), "yyyyMMdd")}-${String(karma(`${o.oturumId}:${simdi().getTime()}:${sayac++}`) % 1_000_000).padStart(6, "0")}`,
      }
    },

    async borcuYokturSonuc(o) {
      const borc = mockBorclar(o.kurum, oturumKodu(o), simdi())
      const bugunYmd = toYmd(simdi())
      const vadesiGecmis = borc.filter((k) => k.vade < bugunYmd)
      if (vadesiGecmis.length)
        return {
          durum: "BORCU_VAR",
          aciklama: `${vadesiGecmis.length} kalem vadesi geçmiş borç var; yazı verilmedi`,
        }
      return {
        durum: "HAZIR",
        pdfDataUrl: placeholderIcerik({
          ad: `${o.kurum} borcu yoktur yazisi`,
          mimeType: "application/pdf",
        }),
      }
    },
  }
}
