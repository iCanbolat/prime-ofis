import type { Faker } from "@faker-js/faker"
import { addDays, addMonths, format, subDays } from "date-fns"

import { hediyeKontor } from "@prime/shared/e-belge/kontor"
import { takvimOlayId, yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import { generateTckn, generateVkn } from "@prime/shared/lib/tax-id"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import type {
  EBelge,
  EBelgeFaturaTipi,
  EBelgeSenaryo,
  EBelgeTur,
  EBelgeYon,
  EDefterBerat,
  Mukellef,
  EntegratorBaglanti,
  KontorAlim,
  TakvimDurumKaydi,
} from "@prime/shared/types/domain"

/** Seed referans anı (SEED_REF_DATE) */
const REFERANS = "2026-09-01"
/** Faturalar bu aralıkta düzenlenir; son günler "bugüne" yakın olsun diye referansın ötesine uzanır. */
const FATURA_ARALIGI = { baslangic: "2026-06-01", bitis: "2026-09-22" }
/** Berat matrisi dönemleri (referansa göre son 12 ay) */
export const SEED_BERAT_DONEMLERI = { ilk: "2025-09", son: "2026-08" }

const KARSI_TARAF_EKLERI = ["Ltd. Şti.", "A.Ş.", "Tic. Ltd. Şti.", "San. A.Ş."]
const HATALI_BAGLANTI =
  "Firma Luca hesabında bulunamadı; Luca'da firma yetkisini kontrol edin"

/** Unvandan 3 harflik fatura seri öneki: "Çınar Yazılım" → "CNR" */
export function seriOneki(unvan: string): string {
  const harfler = unvan
    .toLocaleUpperCase("tr-TR")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/[İI]/g, "I")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/[^A-Z]/g, "")
  const sessiz = harfler.replace(/[AEIOU]/g, "")
  return (sessiz.length >= 3 ? sessiz : `${harfler}XXX`).slice(0, 3)
}

export function belgeNo(onek: string, yil: string, sira: number) {
  return `${onek}${yil}${String(sira).padStart(9, "0")}`
}

const KDV_ORANLARI = [20, 20, 20, 10, 1]

export interface FaturaSecenek {
  tur: EBelgeTur
  yon: EBelgeYon
  senaryo: EBelgeSenaryo
  /** yyyy-MM-dd */
  duzenlemeTarihi: string
  alinmaTarihi: string
  belgeNo: string
}

/** Tek bir fatura başlığı (id ve mükellef hariç). Tutarlar kuruş hassasiyetinde tutarlıdır. */
export function faturaUret(
  faker: Faker,
  s: FaturaSecenek
): Omit<EBelge, "id" | "mukellefId"> {
  const faturaTipi = faker.helpers.weightedArrayElement<EBelgeFaturaTipi>([
    { value: "SATIS", weight: 85 },
    { value: "IADE", weight: 5 },
    { value: "TEVKIFAT", weight: 7 },
    { value: "ISTISNA", weight: 3 },
  ])
  const matrah = faker.number.float({
    min: 250,
    max: faker.number.float() < 0.85 ? 40_000 : 350_000,
    fractionDigits: 2,
  })
  const oran = faker.helpers.arrayElement(KDV_ORANLARI)
  const hamKdv =
    faturaTipi === "ISTISNA"
      ? 0
      : faturaTipi === "TEVKIFAT"
        ? (matrah * 0.2 * 5) / 10
        : (matrah * oran) / 100
  const kdv = Math.round(hamKdv * 100) / 100
  const karsiSahis = s.tur === "E_ARSIV" && faker.number.float() < 0.5
  return {
    tur: s.tur,
    yon: s.yon,
    ettn: faker.string.uuid(),
    belgeNo: s.belgeNo,
    senaryo: s.senaryo,
    faturaTipi,
    karsiTaraf: karsiSahis
      ? {
          unvan: faker.person.fullName(),
          vknTckn: generateTckn(() => faker.number.float()),
        }
      : {
          unvan: `${faker.company.name().split(/[\s,-]/)[0]} ${faker.helpers.arrayElement(KARSI_TARAF_EKLERI)}`,
          vknTckn: generateVkn(() => faker.number.float()),
        },
    duzenlemeTarihi: s.duzenlemeTarihi,
    alinmaTarihi: s.alinmaTarihi,
    matrah,
    kdv,
    toplam: Math.round((matrah + kdv) * 100) / 100,
    paraBirimi:
      faker.number.float() < 0.94
        ? "TRY"
        : faker.helpers.arrayElement(["USD", "EUR"] as const),
    gibDurumu: "BASARILI",
  }
}

function baglantilar(faker: Faker, mukellefler: Mukellef[]) {
  const kayitlar: EntegratorBaglanti[] = []
  let hataliSayisi = 0
  for (const m of mukellefler) {
    if (!m.aktif) continue
    const sirket = m.tur !== "SAHIS"
    const r = faker.number.float()
    if (!sirket && r > 0.45) continue
    const hatali = sirket && hataliSayisi < 2 && r < 0.12
    if (hatali) hataliSayisi++
    const alan = m.eposta.split("@")[1] ?? "firma.com.tr"
    const eFatura = sirket || faker.number.float() < 0.5
    // Eski anahtar ipucu üretimi: seed sırası (sonraki faturalar) değişmesin diye tüketilir
    faker.string.alphanumeric({ length: 4, casing: "lower" })
    kayitlar.push({
      id: `n_${m.id}`,
      mukellefId: m.id,
      durum: hatali ? "HATA" : "BAGLI",
      eFatura,
      eArsiv: true,
      eDefter: m.eDefterMukellefi,
      postaKutusu: eFatura ? `urn:mail:defaultpk@${alan}` : undefined,
      lucaFirmaId: `L-${m.id}`,
      sonSenkron: hatali
        ? "2026-08-14T06:00:00.000Z"
        : "2026-09-22T06:00:00.000Z",
      hataMesaji: hatali ? HATALI_BAGLANTI : undefined,
      baglayanId: m.sorumluPersonelId,
      baglanmaTarihi: "2025-01-10T09:00:00.000Z",
    })
  }
  return kayitlar
}

function faturalar(
  faker: Faker,
  mukellefler: Mukellef[],
  baglantiListesi: EntegratorBaglanti[]
) {
  const byId = new Map(mukellefler.map((m) => [m.id, m]))
  const kayitlar: EBelge[] = []
  const bas = fromYmd(FATURA_ARALIGI.baslangic).getTime()
  const bit = fromYmd(FATURA_ARALIGI.bitis).getTime()
  const sinir = toYmd(subDays(fromYmd(FATURA_ARALIGI.bitis), 8))

  for (const b of baglantiListesi) {
    const m = byId.get(b.mukellefId)!
    const onek = seriOneki(m.unvan)
    const tarihler = Array.from(
      { length: faker.number.int({ min: 5, max: 10 }) },
      () => toYmd(new Date(faker.number.int({ min: bas, max: bit })))
    ).sort()
    let gidenSira = 0
    let arsivSira = 0

    for (const tarih of tarihler) {
      const tur: EBelgeTur =
        b.eFatura && faker.number.float() < 0.65 ? "E_FATURA" : "E_ARSIV"
      const yon: EBelgeYon =
        tur === "E_FATURA" && faker.number.float() < 0.5 ? "GELEN" : "GIDEN"
      const senaryo: EBelgeSenaryo =
        tur === "E_ARSIV"
          ? "EARSIV"
          : faker.number.float() < 0.55
            ? "TICARI"
            : "TEMEL"
      const saat = faker.number.int({ min: 8, max: 18 })
      const alinma = new Date(`${tarih}T${String(saat).padStart(2, "0")}:15:00`)
      const no =
        yon === "GELEN"
          ? belgeNo(
              faker.string.alpha({ length: 3, casing: "upper" }),
              tarih.slice(0, 4),
              faker.number.int({ min: 1, max: 9_000 })
            )
          : tur === "E_ARSIV"
            ? belgeNo(`A${onek.slice(0, 2)}`, tarih.slice(0, 4), ++arsivSira)
            : belgeNo(onek, tarih.slice(0, 4), ++gidenSira)

      const f = faturaUret(faker, {
        tur,
        yon,
        senaryo,
        duzenlemeTarihi: tarih,
        alinmaTarihi: alinma.toISOString(),
        belgeNo: no,
      })

      if (yon === "GIDEN") {
        const r = faker.number.float()
        f.gibDurumu =
          tarih >= "2026-09-20"
            ? "ISLENIYOR"
            : r < 0.03
              ? "HATA"
              : r < 0.045
                ? "IPTAL"
                : "BASARILI"
      }
      if (yon === "GELEN" && senaryo === "TICARI") {
        if (tarih > sinir) f.yanit = "BEKLIYOR"
        else {
          const r = faker.number.float()
          f.yanit = r < 0.85 ? "KABUL" : r < 0.95 ? "RED" : "BEKLIYOR"
          if (f.yanit !== "BEKLIYOR") {
            f.yanitlayanId = m.sorumluPersonelId
            f.yanitTarihi = addDays(
              alinma,
              faker.number.int({ min: 0, max: 5 })
            ).toISOString()
          }
          if (f.yanit === "RED") f.redNedeni = "Fiyat veya miktar hatalı"
        }
      }

      kayitlar.push({
        ...f,
        id: `f_${String(kayitlar.length + 1).padStart(4, "0")}`,
        mukellefId: m.id,
      })
    }

    // Son günlerde gelmiş, yanıt bekleyen ticari faturalar (bir kısmının süresi dolmak üzere)
    if (b.eFatura && faker.number.float() < 0.45) {
      const tarih = toYmd(
        addDays(fromYmd("2026-09-15"), faker.number.int({ min: 0, max: 7 }))
      )
      const f = faturaUret(faker, {
        tur: "E_FATURA",
        yon: "GELEN",
        senaryo: "TICARI",
        duzenlemeTarihi: tarih,
        alinmaTarihi: new Date(`${tarih}T10:30:00`).toISOString(),
        belgeNo: belgeNo(
          faker.string.alpha({ length: 3, casing: "upper" }),
          "2026",
          faker.number.int({ min: 1, max: 9_000 })
        ),
      })
      kayitlar.push({
        ...f,
        yanit: "BEKLIYOR",
        id: `f_${String(kayitlar.length + 1).padStart(4, "0")}`,
        mukellefId: m.id,
      })
    }
  }
  return kayitlar
}

/** "2025-09".."2026-08" */
export function donemListesi(ilk: string, son: string): string[] {
  const liste: string[] = []
  for (
    let d = fromYmd(`${ilk}-01`);
    format(d, "yyyy-MM") <= son;
    d = addMonths(d, 1)
  )
    liste.push(format(d, "yyyy-MM"))
  return liste
}

/**
 * Berat durumları takvimle tutarlıdır: takvimde onaylı → berat alındı, hazırlandı → defter
 * yüklendi / berat bekleniyor. Yüklenmemiş dönemler saklanmaz (varsayılan).
 */
function beratlar(
  faker: Faker,
  mukellefler: Mukellef[],
  baglantiListesi: EntegratorBaglanti[],
  takvim: TakvimDurumKaydi[]
) {
  const durumlar = new Map(takvim.map((t) => [t.id, t]))
  const bagli = new Set(
    baglantiListesi.filter((b) => b.eDefter).map((b) => b.mukellefId)
  )
  const donemler = new Set(
    donemListesi(SEED_BERAT_DONEMLERI.ilk, SEED_BERAT_DONEMLERI.son)
  )
  const kayitlar: EDefterBerat[] = []
  let hataVar = false

  for (const m of mukellefler) {
    if (!bagli.has(m.id)) continue
    for (const y of yukumlulukleriHesapla(m, {
      baslangic: "2025-12-01",
      bitis: "2027-01-31",
    })) {
      if (y.tip !== "E_DEFTER_BERAT" || !donemler.has(y.donem)) continue
      const kayit = durumlar.get(takvimOlayId(m.id, y.tip, y.donem))
      const yukleme = subDays(
        fromYmd(y.sonTarih),
        faker.number.int({ min: 5, max: 20 })
      )
      const id = `${m.id}:${y.donem}`
      if (kayit?.durum === "ONAYLANDI") {
        kayitlar.push({
          id,
          mukellefId: m.id,
          donem: y.donem,
          durum: "ONAYLANDI",
          yuklemeTarihi: yukleme.toISOString(),
          onayTarihi: kayit.guncellemeTarihi,
        })
      } else if (kayit?.durum === "HAZIRLANDI") {
        kayitlar.push({
          id,
          mukellefId: m.id,
          donem: y.donem,
          durum: "YUKLENDI",
          yuklemeTarihi: kayit.guncellemeTarihi,
        })
      } else if (!hataVar && y.sonTarih >= REFERANS) {
        hataVar = true
        kayitlar.push({
          id,
          mukellefId: m.id,
          donem: y.donem,
          durum: "HATA",
          yuklemeTarihi: `${REFERANS}T08:30:00.000Z`,
          hataMesaji:
            "Yevmiye defteri kapanış kaydı ile kebir bakiyeleri tutarsız",
        })
      }
    }
  }
  return kayitlar
}

export function createEBelgeVerisi(
  faker: Faker,
  mukellefler: Mukellef[],
  takvim: TakvimDurumKaydi[]
): {
  baglanti: EntegratorBaglanti[]
  ebelge: EBelge[]
  berat: EDefterBerat[]
  kontor: KontorAlim[]
} {
  // Bağlantısı sonradan hatalanan mükelleflerin de geçmiş faturaları / beratları vardır
  const baglanti = baglantilar(faker, mukellefler)
  return {
    baglanti,
    ebelge: faturalar(faker, mukellefler, baglanti),
    berat: beratlar(faker, mukellefler, baglanti, takvim),
    kontor: kontorAlimlari(),
  }
}

/** Faker kullanmaz (sonraki seed verisinin sırası değişmesin). Yönetici: p_1. */
function kontorAlimlari(): KontorAlim[] {
  return [
    {
      id: "u_001",
      tarih: "2026-05-28",
      paketAdet: 500,
      hediyeAdet: hediyeKontor(500),
      tutar: 900,
      not: "Başlangıç paketi",
      ekleyenId: "p_1",
    },
    {
      id: "u_002",
      tarih: "2026-08-14",
      paketAdet: 250,
      hediyeAdet: hediyeKontor(250),
      tutar: 480,
      ekleyenId: "p_1",
    },
  ]
}
