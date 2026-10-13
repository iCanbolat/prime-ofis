/**
 * Fiş aktarımı kuralları — saf fonksiyonlar; mock handler, arayüz ve (ileride) backend aynı
 * hesabı kullanır. Okumadan çift taraflı mahsup fişi taslağı üretir, fişi doğrular ve Luca
 * "Excel Veri Aktarımı" satırlarını hazırlar.
 */
import { format, isValid, parse } from "date-fns"

import {
  DUSUK_GUVEN,
  MAKS_FIS_DOSYA,
  MAKS_FIS_SATIR,
} from "./sabitler"
import type {
  EBelge,
  EkstreOkumasi,
  FisBelgeTuru,
  FisHesapAyari,
  FisOkumasi,
  FisSatiri,
  HesapEslemesi,
  LucaSablonAyari,
  LucaSutunAlan,
  MuhasebeFisi,
} from "../types/domain"

/** Kuruş hassasiyetine yuvarlar (kayan nokta hatalarını temizler) */
export function kurus(tutar: number): number {
  return Math.round((tutar + Number.EPSILON) * 100) / 100
}

/**
 * Kullanıcının yazdığı tutar: "1.250,50" / "1250,5" / "1250.5" → 1250.5.
 * Boş → 0, sayı değilse NaN.
 */
export function tutarOku(metin: string): number {
  const temiz = metin.trim().replace(/\s/g, "")
  if (!temiz) return 0
  const normal = temiz.includes(",")
    ? temiz.replace(/\./g, "").replace(",", ".")
    : temiz
  const n = Number(normal)
  return Number.isFinite(n) ? kurus(n) : Number.NaN
}

export interface FisTaslagi {
  tarih: string
  aciklama: string
  evrakNo?: string
  evrakTarihi?: string
  belgeTuru?: FisBelgeTuru
  satirlar: FisSatiri[]
  uyarilar: string[]
  parca?: string
}

const buyukHarf = (s: string) => s.toLocaleUpperCase("tr-TR")

const kelimeler = (s: string) =>
  ` ${buyukHarf(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `

/** Metinde anahtarı tam kelime olarak geçen ilk eşlemenin hesabı (VKN de bir "kelime"dir) */
export function eslemeBul(
  metin: string,
  eslemeler: HesapEslemesi[]
): string | undefined {
  const aranan = kelimeler(metin)
  return eslemeler.find(
    (e) => e.anahtar.trim() && aranan.includes(kelimeler(e.anahtar))
  )?.hesapKodu
}

/** Her harekette geçen, karşı tarafı ayırt etmeyen bankacılık kelimeleri */
const EKSTRE_GENEL_KELIMELER = new Set([
  "EFT",
  "FAST",
  "HAVALE",
  "GELEN",
  "GİDEN",
  "GIDEN",
  "POS",
  "ÖDEME",
  "ÖDEMESİ",
  "TRANSFER",
  "VİRMAN",
  "İŞLEM",
  "HESAPTAN",
  "HESABA",
  "KREDİ",
  "KARTI",
])

/**
 * Ekstre açıklamasından öğrenilecek anahtar: genel bankacılık kelimeleri, rakam ve noktalama
 * atıldıktan sonra kalan ilk iki kelime.
 * "EFT GİDEN - ABC GIDA LTD 12345" → "ABC GIDA"; "SGK PRİM ÖDEMESİ" → "SGK PRİM"
 */
export function ekstreAnahtari(aciklama: string): string {
  return buyukHarf(aciklama)
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 2 && !EKSTRE_GENEL_KELIMELER.has(k))
    .slice(0, 2)
    .join(" ")
}

/**
 * Fiş / fatura için mahsup fişi: her KDV oranında matrah gider hesabına ve KDV 191'e borç,
 * toplam ödeme türüne göre kasa / banka / satıcıya alacak. Satıcı VKN'si için öğrenilmiş
 * eşleme varsa gider hesabı odur (ör. akaryakıt → 760).
 */
export function fisTaslagi(okuma: FisOkumasi, ayar: FisHesapAyari): FisTaslagi {
  const uyarilar: string[] = []
  const anahtar = okuma.saticiVkn
  const gider = (anahtar && eslemeBul(anahtar, ayar.eslemeler)) || ayar.gider
  const satirlar: FisSatiri[] = []

  for (const k of okuma.kdvKirilimi) {
    satirlar.push({
      hesapKodu: gider,
      aciklama: `${okuma.saticiUnvan} matrah %${k.oran}`,
      borc: kurus(k.matrah),
      alacak: 0,
      eslemeAnahtari: anahtar,
    })
    if (k.kdv > 0) {
      const kdvHesabi = ayar.kdv[String(k.oran)] ?? ""
      if (!kdvHesabi) uyarilar.push(`%${k.oran} KDV için hesap tanımlı değil`)
      satirlar.push({
        hesapKodu: kdvHesabi,
        aciklama: `${okuma.saticiUnvan} KDV %${k.oran}`,
        borc: kurus(k.kdv),
        alacak: 0,
      })
    }
  }

  const karsi =
    okuma.odeme === "NAKIT"
      ? ayar.kasa
      : okuma.odeme === "KART"
        ? ayar.banka
        : ayar.satici
  satirlar.push({
    hesapKodu: karsi,
    aciklama: okuma.saticiUnvan,
    borc: 0,
    alacak: kurus(okuma.toplam),
  })

  const kirilimToplami = kurus(
    okuma.kdvKirilimi.reduce((t, k) => t + k.matrah + k.kdv, 0)
  )
  if (kirilimToplami !== kurus(okuma.toplam))
    uyarilar.push(
      `Belge toplamı (${okuma.toplam.toFixed(2)}) KDV kırılımıyla (${kirilimToplami.toFixed(2)}) tutmuyor`
    )
  if (okuma.guven < DUSUK_GUVEN)
    uyarilar.push("Okuma güveni düşük; tutarları belgeyle karşılaştırın")

  return {
    tarih: okuma.belgeTarihi,
    aciklama: `${okuma.saticiUnvan} ${okuma.belgeNo}`.trim(),
    evrakNo: okuma.belgeNo || undefined,
    evrakTarihi: okuma.belgeTarihi,
    satirlar,
    uyarilar,
  }
}

/**
 * Ekstre için mahsup fişi: her hareket banka hesabı ile karşı hesap arasında çift satır.
 * Karşı hesap öğrenilmiş eşlemelerden bulunur; bulunamazsa boş kalır (onay öncesi doldurulur).
 * Luca'nın 400 satır sınırı için gerekirse birden fazla fişe bölünür.
 */
export function ekstreTaslaklari(
  okuma: EkstreOkumasi,
  ayar: FisHesapAyari
): FisTaslagi[] {
  const hareketBasina = 2
  const parcaBoyu = Math.floor(MAKS_FIS_SATIR / hareketBasina)
  const parcalar: EkstreOkumasi["hareketler"][] = []
  for (let i = 0; i < okuma.hareketler.length; i += parcaBoyu)
    parcalar.push(okuma.hareketler.slice(i, i + parcaBoyu))
  if (parcalar.length === 0) parcalar.push([])

  const baslik = `${okuma.banka} ekstresi ${okuma.donemBas} – ${okuma.donemSon}`
  return parcalar.map((hareketler, i) => {
    const satirlar: FisSatiri[] = []
    let eslesmeyen = 0
    for (const h of hareketler) {
      const tutar = kurus(Math.abs(h.tutar))
      const anahtar = ekstreAnahtari(h.aciklama)
      const karsi = eslemeBul(h.aciklama, ayar.eslemeler) ?? ""
      if (!karsi) eslesmeyen++
      const banka: FisSatiri = {
        hesapKodu: ayar.banka,
        aciklama: h.aciklama,
        borc: h.tutar > 0 ? tutar : 0,
        alacak: h.tutar > 0 ? 0 : tutar,
      }
      const karsiSatir: FisSatiri = {
        hesapKodu: karsi,
        aciklama: h.aciklama,
        borc: h.tutar > 0 ? 0 : tutar,
        alacak: h.tutar > 0 ? tutar : 0,
        eslemeAnahtari: anahtar || undefined,
      }
      satirlar.push(banka, karsiSatir)
    }
    const son = hareketler.at(-1)?.tarih ?? okuma.donemSon
    return {
      tarih: son,
      aciklama: baslik,
      evrakTarihi: okuma.donemSon,
      satirlar,
      uyarilar:
        eslesmeyen > 0
          ? [`${eslesmeyen} hareketin karşı hesabı belirlenemedi`]
          : [],
      parca: parcalar.length > 1 ? `${i + 1}/${parcalar.length}` : undefined,
    }
  })
}

export function fisToplamlari(satirlar: Pick<FisSatiri, "borc" | "alacak">[]) {
  const borc = kurus(satirlar.reduce((t, s) => t + (s.borc || 0), 0))
  const alacak = kurus(satirlar.reduce((t, s) => t + (s.alacak || 0), 0))
  return { borc, alacak, fark: kurus(borc - alacak) }
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Onayı engelleyen hatalar; boşsa fiş Luca'ya aktarılabilir */
export function fisHatalari(
  fis: Pick<MuhasebeFisi, "tarih" | "satirlar">
): string[] {
  const hatalar: string[] = []
  if (
    !YMD_RE.test(fis.tarih) ||
    !isValid(parse(fis.tarih, "yyyy-MM-dd", new Date(0)))
  )
    hatalar.push("Fiş tarihi geçersiz")
  if (fis.satirlar.length < 2) hatalar.push("Fişte en az iki satır olmalı")
  if (fis.satirlar.length > MAKS_FIS_SATIR)
    hatalar.push(`Fiş ${MAKS_FIS_SATIR} satırı aşamaz`)
  const hesapsiz = fis.satirlar.filter((s) => !s.hesapKodu.trim()).length
  if (hesapsiz) hatalar.push(`${hesapsiz} satırda hesap kodu yok`)
  const hatali = fis.satirlar.filter(
    (s) =>
      s.borc < 0 ||
      s.alacak < 0 ||
      (s.borc > 0 && s.alacak > 0) ||
      (!s.borc && !s.alacak)
  ).length
  if (hatali)
    hatalar.push(`${hatali} satırda tutar yalnızca borç ya da alacakta olmalı`)
  const { fark } = fisToplamlari(fis.satirlar)
  if (fark !== 0) hatalar.push("Borç ve alacak toplamları eşit değil")
  return hatalar
}

/**
 * Aynı belge daha önce okunduysa ya da e-fatura olarak Luca'ya zaten düştüyse uyarı.
 * e-Fatura / e-Arşiv faturalar entegratörden gelir; fotoğrafını ayrıca kaydetmek mükerrer olur.
 */
export function mukerrerUyarilari(
  okuma: Pick<FisOkumasi, "belgeNo" | "saticiVkn">,
  digerleri: Pick<FisOkumasi, "belgeNo" | "saticiVkn">[],
  ebelgeler: Pick<EBelge, "yon" | "belgeNo" | "karsiTaraf">[]
): string[] {
  if (!okuma.belgeNo) return []
  const uyarilar: string[] = []
  const ayni = (vkn?: string, no?: string) =>
    no === okuma.belgeNo && (!okuma.saticiVkn || vkn === okuma.saticiVkn)
  if (digerleri.some((d) => ayni(d.saticiVkn, d.belgeNo)))
    uyarilar.push("Bu belge daha önce okunmuş; mükerrer olabilir")
  if (
    ebelgeler.some(
      (e) => e.yon === "GELEN" && ayni(e.karsiTaraf.vknTckn, e.belgeNo)
    )
  )
    uyarilar.push(
      "Bu fatura e-Fatura olarak entegratörde mevcut; Luca'ya zaten düşmüş olabilir"
    )
  return uyarilar
}

/**
 * Luca belge türü: okunan belge mükellefin gelen e-Fatura / e-Arşiv faturalarından biriyse
 * EF / EA, değilse (kağıt fiş, ekstre) MF.
 */
export function belgeTuruBul(
  okuma: Pick<FisOkumasi, "belgeNo" | "saticiVkn">,
  ebelgeler: Pick<EBelge, "yon" | "tur" | "belgeNo" | "karsiTaraf">[]
): FisBelgeTuru {
  if (!okuma.belgeNo) return "MF"
  const e = ebelgeler.find(
    (e) =>
      e.yon === "GELEN" &&
      e.belgeNo === okuma.belgeNo &&
      (!okuma.saticiVkn || e.karsiTaraf.vknTckn === okuma.saticiVkn)
  )
  if (!e) return "MF"
  return e.tur === "E_ARSIV" ? "EA" : "EF"
}

/**
 * Personel bir satırın hesabını değiştirdiyse, satırın eşleme anahtarı için yeni hesabı öğrenir.
 * Aynı anahtar varsa günceller; anahtarsız satırlar ve boş hesaplar yok sayılır.
 */
export function eslemeleriOgren(
  onceki: FisSatiri[],
  yeni: FisSatiri[],
  eslemeler: HesapEslemesi[]
): HesapEslemesi[] {
  const sonuc = [...eslemeler]
  yeni.forEach((s, i) => {
    const anahtar = s.eslemeAnahtari
    const hesap = s.hesapKodu.trim()
    if (!anahtar || !hesap || onceki[i]?.hesapKodu === hesap) return
    const mevcut = sonuc.findIndex((e) => e.anahtar === anahtar)
    if (mevcut >= 0) sonuc[mevcut] = { anahtar, hesapKodu: hesap }
    else sonuc.push({ anahtar, hesapKodu: hesap })
  })
  return sonuc
}

/** Onaylı fişleri tarih sırasıyla Luca'nın dosya başına sınırına göre paketler */
export function aktarimPaketleri<T extends Pick<MuhasebeFisi, "tarih">>(
  fisler: T[]
): T[][] {
  const sirali = [...fisler].sort((a, b) => a.tarih.localeCompare(b.tarih))
  const paketler: T[][] = []
  for (let i = 0; i < sirali.length; i += MAKS_FIS_DOSYA)
    paketler.push(sirali.slice(i, i + MAKS_FIS_DOSYA))
  return paketler
}

function tarihYaz(ymd: string | undefined, bicim: string): string {
  if (!ymd) return ""
  const tarih = parse(ymd, "yyyy-MM-dd", new Date())
  return isValid(tarih) ? format(tarih, bicim) : ymd
}

/**
 * Luca Excel satırları (ilk satır başlıklar). Her fiş sırayla numaralanır; aynı Fiş No ve
 * Fiş Tarihi taşıyan satırları Luca tek fiş olarak alır.
 */
export function lucaSatirlari(
  fisler: Pick<
    MuhasebeFisi,
    "tarih" | "aciklama" | "evrakNo" | "evrakTarihi" | "belgeTuru" | "satirlar"
  >[],
  sablon: LucaSablonAyari
): (string | number)[][] {
  const satirlar: (string | number)[][] = [sablon.sutunlar.map((s) => s.baslik)]
  fisler.forEach((fis, i) => {
    const fisNo = sablon.baslangicFisNo + i
    for (const s of fis.satirlar) {
      const deger: Record<LucaSutunAlan, string | number> = {
        FIS_NO: fisNo,
        FIS_TARIHI: tarihYaz(fis.tarih, sablon.tarihFormati),
        FIS_ACIKLAMA: fis.aciklama,
        HESAP_KODU: s.hesapKodu,
        EVRAK_NO: fis.evrakNo ?? "",
        EVRAK_TARIHI: tarihYaz(fis.evrakTarihi, sablon.tarihFormati),
        DETAY_ACIKLAMA: s.aciklama,
        BORC: kurus(s.borc),
        ALACAK: kurus(s.alacak),
        // Döviz ve miktar okunmuyor; Luca boş alanı TL ve miktarsız kabul eder
        MIKTAR: "",
        BELGE_TURU: fis.belgeTuru ?? "MF",
        PARA_BIRIMI: "",
        KUR: "",
        DOVIZ_TUTAR: "",
      }
      satirlar.push(sablon.sutunlar.map((sutun) => deger[sutun.alan]))
    }
  })
  return satirlar
}

/** "Luca_ABC-Gida_2026-09_1.xlsx" */
export function lucaDosyaAdi(unvan: string, tarih: string, sira?: number) {
  const kisa = unvan
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
  return `Luca_${kisa}_${tarih}${sira ? `_${sira}` : ""}.xlsx`
}
