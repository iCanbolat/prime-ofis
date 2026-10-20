/**
 * `LucaPortalAdapter`'ın geliştirme / test uygulaması (api `LUCA_PORTAL=mock` + client MSW).
 * Luca web portalını taklit eder:
 * - Giriş: "hatali" içeren kullanıcı adı veya şifre reddedilir. Kullanıcı adında "dogrulama"
 *   geçerse her girişte doğrulama ekranı çıkar. Görselde kod açıkça yazılıdır (mock, kamu
 *   mock'uyla aynı görsel); personel bu kodu girer. Yanlış kod yeni görsel döndürür.
 * - Firmalar: büronun mükelleflerinden türetilenler (`L-<mukellefId>`) + uygulamada henüz
 *   mükellefi olmayan sabit firmalar (`LUCA_EK_FIRMALAR`, "Luca'dan mükellef oluştur" için).
 *   Ek firmadan mükellef açılınca aynı VKN'li mükellef ayrıca listelenmez.
 * - Fatura, berat ve kontör verisini çağıran verir (`MockLucaVeri`): api veritabanından, client
 *   MSW durumundan okur. Artımlı değişiklikler `entegrator.ts`'teki deterministik üretimden.
 *   XML, kalemleri UBL `InvoiceLine` olarak içerir.
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import {
  LucaOturumDustu,
  type LucaPortalAdapter,
  type LucaPortalFirma,
  type LucaPortalKimlik,
  type LucaPortalOturum,
} from "@prime/shared/e-belge/luca-portal"
import { ublBirimKodu } from "@prime/shared/e-belge/ubl-kalemler"
import { generateTckn, generateVkn } from "@prime/shared/lib/tax-id"
import type { EBelge, EDefterBerat, Mukellef } from "@prime/shared/types/domain"

import {
  mockBeratGuncellemeleri,
  mockFaturaGuncellemeleri,
  mockFaturaKalemleri,
  mockFirmaServisleri,
} from "./entegrator"
import { karma } from "./karma"
import { dogrulamaGorseli, mockDogrulamaKodu } from "./kamu/mock-adapter"
import { placeholderIcerik } from "./placeholder"

export const LUCA_GIRIS_HATASI =
  "Luca girişi başarısız: kullanıcı adı veya şifre hatalı"
const FIRMA_ONEKI = "L-"

export const lucaFirmaId = (mukellefId: string) => `${FIRMA_ONEKI}${mukellefId}`

export type MockLucaMukellef = Pick<
  Mukellef,
  | "id"
  | "unvan"
  | "vkn"
  | "tckn"
  | "eposta"
  | "tur"
  | "eDefterMukellefi"
  | "vergiDairesi"
  | "il"
  | "ilce"
  | "adres"
  | "telefon"
>

/** Mock portalın okuduğu veri; çağıran (api / MSW) kendi durumundan verir */
export interface MockLucaVeri {
  mukellefler(): Promise<MockLucaMukellef[]>
  /** Firmaya eşli mükellef (bağlantı kaydından); yoksa `L-` önekinden çözülür */
  firmaMukellefi(firmaId: string): Promise<string | undefined>
  /** Mükellefin mevcut faturaları */
  faturalar(mukellefId: string): Promise<EBelge[]>
  fatura(ettn: string): Promise<EBelge | undefined>
  beratlar(mukellefId: string): Promise<EDefterBerat[]>
  kontorKalan(): Promise<number>
  simdi(): Date
}

const UNVANLAR: [string, LucaPortalFirma["tur"]][] = [
  ["Ege Gıda Pazarlama Ltd. Şti.", "LTD"],
  ["Başkent Medikal Cihazlar A.Ş.", "AS"],
  ["Doğan Tekstil San. ve Tic. Ltd. Şti.", "LTD"],
  ["Kuzey Enerji Teknolojileri A.Ş.", "AS"],
  ["Selin Arslan", "SAHIS"],
  ["Murat Kaplan", "SAHIS"],
]
const IL_ILCE: [string, string, string][] = [
  ["İzmir", "Bornova", "Bornova"],
  ["Ankara", "Çankaya", "Kavaklıdere"],
  ["Bursa", "Osmangazi", "Osmangazi"],
  ["İstanbul", "Kadıköy", "Kadıköy"],
  ["Antalya", "Muratpaşa", "Muratpaşa"],
  ["Eskişehir", "Tepebaşı", "Tepebaşı"],
]

/** Uygulamada henüz mükellefi olmayan Luca firmaları (deterministik) */
export const LUCA_EK_FIRMALAR: LucaPortalFirma[] = UNVANLAR.map(
  ([unvan, tur], i) => {
    const f = new Faker({ locale: [tr, en, base] })
    f.seed(karma(`luca-ek:${i}`))
    const rastgele = () => f.number.float()
    const [il, ilce, vd] = IL_ILCE[i]!
    const sahis = tur === "SAHIS"
    return {
      firmaId: `LE-${String(i + 1).padStart(3, "0")}`,
      unvan,
      vknTckn: sahis ? generateTckn(rastgele) : generateVkn(rastgele),
      tur,
      vergiDairesi: vd,
      il,
      ilce,
      adres: `${f.location.street()} No: ${f.number.int({ min: 1, max: 120 })}`,
      telefon: `05${f.string.numeric(9)}`,
      eposta: `muhasebe@firma${i + 1}.com.tr`,
      eFatura: !sahis,
      eArsiv: true,
      eDefter: !sahis,
      ...(sahis ? {} : { postaKutusu: `urn:mail:defaultpk@firma${i + 1}.com.tr` }),
    }
  }
)

const xmlKacis = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** Kalemli minimal UBL-TR XML (data URL) */
export function mockUblXml(
  f: Pick<
    EBelge,
    "ettn" | "belgeNo" | "faturaTipi" | "matrah" | "kdv" | "paraBirimi"
  >
): string {
  const pb = f.paraBirimi
  const satirlar = mockFaturaKalemleri(f)
    .map(
      (k) =>
        `<cac:InvoiceLine><cbc:ID>${k.sira}</cbc:ID>` +
        `<cbc:InvoicedQuantity unitCode="${ublBirimKodu(k.birim)}">${k.miktar}</cbc:InvoicedQuantity>` +
        `<cbc:LineExtensionAmount currencyID="${pb}">${k.tutar.toFixed(2)}</cbc:LineExtensionAmount>` +
        `<cac:TaxTotal><cac:TaxSubtotal><cbc:Percent>${k.kdvOrani}</cbc:Percent>` +
        `<cac:TaxCategory><cac:TaxScheme><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>` +
        `</cac:TaxSubtotal></cac:TaxTotal>` +
        `<cac:Item><cbc:Name>${xmlKacis(k.ad)}</cbc:Name></cac:Item>` +
        `<cac:Price><cbc:PriceAmount currencyID="${pb}">${k.birimFiyat.toFixed(2)}</cbc:PriceAmount></cac:Price>` +
        `</cac:InvoiceLine>`
    )
    .join("")
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<cbc:ID>${xmlKacis(f.belgeNo)}</cbc:ID><cbc:UUID>${f.ettn}</cbc:UUID>${satirlar}</Invoice>`
  const bayt = new TextEncoder().encode(xml)
  return `data:application/xml;base64,${btoa(String.fromCharCode(...bayt))}`
}

export interface MockLucaPortal extends LucaPortalAdapter {
  /** Test yardımcısı: açık oturumları düşürür (Luca oturum süresinin dolması) */
  oturumlariDusur(): void
}

export function mockLucaPortal(veri: MockLucaVeri): MockLucaPortal {
  const oturumlar = new Set<string>()

  const yeniDogrulama = (k: LucaPortalKimlik) => {
    const oturumId = `dg-LUCA-${k.kullanici}-${crypto.randomUUID().slice(0, 8)}`
    return {
      oturumId,
      gorselDataUrl: dogrulamaGorseli(mockDogrulamaKodu(oturumId)),
    }
  }

  const gecerli = (o: LucaPortalOturum) => {
    if (!oturumlar.has(o.oturumId)) throw new LucaOturumDustu()
  }

  const mukellefi = async (firmaId: string) => {
    const id =
      (await veri.firmaMukellefi(firmaId)) ??
      (firmaId.startsWith(FIRMA_ONEKI) ? firmaId.slice(FIRMA_ONEKI.length) : undefined)
    if (!id) throw new Error("Luca firması bulunamadı")
    return id
  }

  return {
    async giris(k, dogrulama) {
      if ([k.kullanici, k.sifre].some((s) => /hatali/i.test(s)))
        return { durum: "HATA", hataMesaji: LUCA_GIRIS_HATASI }
      if (dogrulama) {
        if (dogrulama.kod.trim() !== mockDogrulamaKodu(dogrulama.oturumId))
          return { durum: "DOGRULAMA", ...yeniDogrulama(k) }
      } else if (/dogrulama/i.test(k.kullanici)) {
        return { durum: "DOGRULAMA", ...yeniDogrulama(k) }
      }
      const oturumId = `LUCA:${crypto.randomUUID()}`
      oturumlar.add(oturumId)
      return { durum: "TAMAM", oturum: { oturumId } }
    },

    async dogrulamaYenile(k) {
      return yeniDogrulama(k)
    },

    async firmalar(o) {
      gecerli(o)
      const ekKimlikler = new Set(LUCA_EK_FIRMALAR.map((f) => f.vknTckn))
      const turetilen = (await veri.mukellefler())
        .filter((m) => !ekKimlikler.has(m.vkn ?? m.tckn))
        .map((m): LucaPortalFirma => {
          const d = mockFirmaServisleri(m.id, m)
          const kimlik = m.vkn ?? m.tckn
          return {
            firmaId: lucaFirmaId(m.id),
            unvan: m.unvan,
            ...(kimlik ? { vknTckn: kimlik } : {}),
            tur: m.tur,
            vergiDairesi: m.vergiDairesi,
            il: m.il,
            ilce: m.ilce,
            adres: m.adres,
            telefon: m.telefon,
            eposta: m.eposta,
            eFatura: d.eFatura,
            eArsiv: d.eArsiv,
            eDefter: d.eDefter,
            ...(d.postaKutusu ? { postaKutusu: d.postaKutusu } : {}),
          }
        })
      return [...turetilen, ...structuredClone(LUCA_EK_FIRMALAR)]
    },

    async faturalar(o, firmaId, s) {
      gecerli(o)
      const mukellefId = await mukellefi(firmaId)
      const liste = mockFaturaGuncellemeleri(
        mukellefId,
        await veri.faturalar(mukellefId),
        s,
        veri.simdi()
      )
      // Portal listesi düzenleme tarihine göre süzülür; giden faturaların durum güncellemesi
      // (GİB'de işlenen) tarih aralığına bakılmadan gelir
      return liste.filter(
        (f) =>
          s.yon === "GIDEN" ||
          (f.duzenlemeTarihi >= s.baslangic && f.duzenlemeTarihi <= s.bitis)
      )
    },

    async faturaIcerik(o, _firmaId, ettn, format) {
      gecerli(o)
      const f = await veri.fatura(ettn)
      if (!f) throw new Error("Fatura Luca'da bulunamadı")
      if (format === "XML") return mockUblXml(f)
      return placeholderIcerik({
        ad: `${f.belgeNo}.pdf`,
        mimeType: "application/pdf",
      })
    },

    async beratlar(o, firmaId, yil) {
      gecerli(o)
      const beratlar = await veri.beratlar(await mukellefi(firmaId))
      return mockBeratGuncellemeleri(
        beratlar.filter((b) => b.donem.startsWith(`${yil}-`)),
        veri.simdi().toISOString()
      )
    },

    async kontorBakiyesi(o) {
      gecerli(o)
      return { kalan: await veri.kontorKalan() }
    },

    oturumlariDusur() {
      oturumlar.clear()
    },
  }
}
