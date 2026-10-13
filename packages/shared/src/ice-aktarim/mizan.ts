/**
 * Mizan ayrıştırıcısı ve kontrol kuralları — saf fonksiyonlar.
 *
 * Girdi, Excel/CSV'nin ilk sayfasından okunan satırlardır (`dosya-oku.ts`). Luca, Zirve, ETA gibi
 * paketlerin mizan çıktıları başlık adlarıyla tanınır; sütun sırası sabit varsayılmaz.
 * Kontroller Tek Düzen Hesap Planı'na göre ana hesap (3 haneli) düzeyinde çalışır.
 */
import { formatTRY } from "../lib/format"
import { normalize } from "./tahakkuk"
import type { MizanHesap, MizanKontrol } from "../types/domain"

type Hucre = unknown

/** Hücre → sayı. "1.234,56", "1,234.56", "(1.234,56)", "1234.5", 1234.5 kabul edilir; boş → 0 */
export function hucreSayi(deger: Hucre): number | null {
  if (typeof deger === "number") return Number.isFinite(deger) ? deger : null
  if (deger === null || deger === undefined) return 0
  let s = String(deger).replace(/[\s₺]|TL/g, "")
  if (s === "" || s === "-") return 0
  const negatif = /^\(.*\)$/.test(s)
  if (negatif) s = s.slice(1, -1)
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s))
    s = s.replace(/\./g, "").replace(",", ".")
  else if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) s = s.replace(/,/g, "")
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negatif ? -n : n
}

interface Sutunlar {
  kod: number
  ad?: number
  borc: number
  alacak: number
}

const baslik = (h: Hucre) => normalize(String(h ?? "")).trim()

const KOD_RE = /^(HESAP )?KODU?$|^HESAP (KODU|NO|NUMARASI)$/
const AD_RE = /^HESAP ADI$|^ACIKLAMA$|^ADI?$/
const BORC_RE = /^(TOPLAM )?BORC( TOPLAMI)?$/
const ALACAK_RE = /^(TOPLAM )?ALACAK( TOPLAMI)?$/
const BAKIYE_BORC_RE = /^BORC BAKIYE(SI)?$/
const BAKIYE_ALACAK_RE = /^ALACAK BAKIYE(SI)?$/

function basliktanSutunlar(ust: string[], alt: string[]): Sutunlar | null {
  const bul = (re: RegExp, ...satirlar: string[][]) => {
    for (const b of satirlar) {
      const i = b.findIndex((h) => re.test(h))
      if (i >= 0) return i
    }
    return -1
  }
  const kod = bul(KOD_RE, ust, alt)
  if (kod < 0) return null
  const ad = bul(AD_RE, ust, alt)
  // Tutar sütunları bakiyeye tercih edilir; aynı satırda iki "BORÇ" varsa ilki tutardır
  const borc = [bul(BORC_RE, alt, ust), bul(BAKIYE_BORC_RE, alt, ust)].find(
    (i) => i >= 0
  )
  const alacak = [
    bul(ALACAK_RE, alt, ust),
    bul(BAKIYE_ALACAK_RE, alt, ust),
  ].find((i) => i >= 0)
  if (borc === undefined || alacak === undefined) return null
  return { kod, ad: ad >= 0 ? ad : undefined, borc, alacak }
}

/**
 * Başlık satırını bulur. İki satırlı başlıklar da tanınır ("Hesap Kodu | Tutar | Bakiye" üstte,
 * "Borç Alacak Borç Alacak" altta). Dönen `satir`, verinin başladığı satırdan bir öncesidir.
 */
function sutunlariBul(
  satirlar: Hucre[][]
): { sutunlar: Sutunlar; satir: number } | null {
  for (let i = 0; i < Math.min(satirlar.length, 25); i++) {
    const ust = (satirlar[i] ?? []).map(baslik)
    const tek = basliktanSutunlar(ust, [])
    if (tek) return { sutunlar: tek, satir: i }
    const alt = (satirlar[i + 1] ?? []).map(baslik)
    const cift = basliktanSutunlar(ust, alt)
    if (cift) return { sutunlar: cift, satir: i + 1 }
  }
  return null
}

interface HamSatir {
  anaKod: string
  /** 1: ana hesap (100), 2+: alt hesap (100.01, 100.01.001) */
  duzey: number
  ad: string
  borc: number
  alacak: number
}

function kodCoz(ham: Hucre): { anaKod: string; duzey: number } | null {
  const kod = String(ham ?? "").trim()
  if (!/^\d{3}/.test(kod)) return null
  const parcalar = kod.split(/[.\s-]+/).filter(Boolean)
  if (!parcalar.every((p) => /^\d+$/.test(p))) return null
  const duzey =
    parcalar.length > 1
      ? parcalar.length
      : kod.length === 3
        ? 1
        : 1 + Math.ceil((kod.length - 3) / 2)
  return { anaKod: kod.slice(0, 3), duzey }
}

export interface MizanOkuma {
  hesaplar: MizanHesap[]
  /** Başlıktan sonraki, hesap koduyla başlamayan (toplam, ara başlık) satırlar atlanır */
  atlanan: number
}

export class MizanOkumaHatasi extends Error {}

/**
 * Satırlardan ana hesap düzeyinde mizan üretir. Ana hesap satırı varsa o kullanılır; yoksa
 * (yalnızca alt hesap listelenmişse) en üst alt hesap düzeyi toplanır — alt düzeyler iki kez
 * sayılmaz.
 */
export function mizanOku(satirlar: Hucre[][]): MizanOkuma {
  const bulunan = sutunlariBul(satirlar)
  if (!bulunan)
    throw new MizanOkumaHatasi(
      'Başlık satırı bulunamadı. Mizanda "Hesap Kodu", "Borç" ve "Alacak" sütunları olmalı.'
    )
  const { sutunlar, satir } = bulunan

  const ham: HamSatir[] = []
  let atlanan = 0
  for (const s of satirlar.slice(satir + 1)) {
    const kod = kodCoz(s[sutunlar.kod])
    const borc = hucreSayi(s[sutunlar.borc])
    const alacak = hucreSayi(s[sutunlar.alacak])
    if (!kod || borc === null || alacak === null) {
      if (s.some((h) => String(h ?? "").trim() !== "")) atlanan++
      continue
    }
    ham.push({
      ...kod,
      ad: sutunlar.ad !== undefined ? String(s[sutunlar.ad] ?? "").trim() : "",
      borc,
      alacak,
    })
  }

  const gruplar = new Map<string, HamSatir[]>()
  for (const h of ham)
    gruplar.set(h.anaKod, [...(gruplar.get(h.anaKod) ?? []), h])
  const hesaplar: MizanHesap[] = []
  for (const [kod, satirlar] of gruplar) {
    const enUst = Math.min(...satirlar.map((s) => s.duzey))
    const secilen = satirlar.filter((s) => s.duzey === enUst)
    hesaplar.push({
      kod,
      ad: enUst === 1 ? secilen[0]!.ad : "",
      borc: yuvarla(secilen.reduce((t, s) => t + s.borc, 0)),
      alacak: yuvarla(secilen.reduce((t, s) => t + s.alacak, 0)),
    })
  }
  if (hesaplar.length === 0)
    throw new MizanOkumaHatasi("Mizanda hesap satırı bulunamadı")
  return {
    hesaplar: hesaplar.sort((a, b) => a.kod.localeCompare(b.kod)),
    atlanan,
  }
}

const yuvarla = (n: number) => Math.round(n * 100) / 100

/** Borç − alacak (pozitif: borç bakiyesi) */
export const bakiye = (h: Pick<MizanHesap, "borc" | "alacak">) =>
  yuvarla(h.borc - h.alacak)

export interface MizanOzeti {
  toplamBorc: number
  toplamAlacak: number
  /**
   * Dönem kârı (+) / zararı (−): 6xx gelir tablosu ve 7xx maliyet hesaplarının bakiyeleri.
   * Yansıtma yapılmışsa 7x0 ile 7x1 birbirini sıfırlar ve maliyet 6xx'te kalır; yapılmamışsa
   * maliyet 7x0'dadır — iki durumda da gider bir kez sayılır.
   */
  donemSonucu: number
}

export function mizanOzeti(hesaplar: MizanHesap[]): MizanOzeti {
  return {
    toplamBorc: yuvarla(hesaplar.reduce((t, h) => t + h.borc, 0)),
    toplamAlacak: yuvarla(hesaplar.reduce((t, h) => t + h.alacak, 0)),
    donemSonucu: yuvarla(
      hesaplar
        .filter((h) => h.kod.startsWith("6") || h.kod.startsWith("7"))
        .reduce((t, h) => t - bakiye(h), 0)
    ),
  }
}

const TL = (n: number) => formatTRY(Math.abs(n))
/** Kuruş yuvarlaması ve paket farklarını tolere etmek için (TL) */
const TOLERANS = 1

export interface KontrolBaglami {
  /** Aynı dönemin KDV + MUHSGK tahakkuklarının ödenecek toplamı (360 karşılaştırması için) */
  tahakkukToplami?: number
}

export function mizanKontrolleri(
  hesaplar: MizanHesap[],
  baglam: KontrolBaglami = {}
): MizanKontrol[] {
  const hesap = (kod: string) => hesaplar.find((h) => h.kod === kod)
  const sonuc: MizanKontrol[] = []

  const { toplamBorc, toplamAlacak } = mizanOzeti(hesaplar)
  const fark = yuvarla(toplamBorc - toplamAlacak)
  sonuc.push(
    Math.abs(fark) < 0.01
      ? {
          kod: "DENKLIK",
          durum: "GECTI",
          baslik: "Borç ve alacak toplamları denk",
        }
      : {
          kod: "DENKLIK",
          durum: "HATA",
          baslik: "Mizan denk değil",
          aciklama: `Borç ${TL(toplamBorc)}, alacak ${TL(toplamAlacak)}; fark ${TL(fark)}.`,
        }
  )

  const kasa = hesap("100")
  if (kasa)
    sonuc.push(
      bakiye(kasa) < 0
        ? {
            kod: "KASA",
            durum: "HATA",
            baslik: "Kasa alacak bakiyesi veriyor",
            aciklama: `100 Kasa ${TL(bakiye(kasa))} alacak bakiyeli; kasa eksiye düşemez, kayıtlar kontrol edilmeli.`,
          }
        : { kod: "KASA", durum: "GECTI", baslik: "Kasa bakiyesi uygun" }
    )

  const banka = hesap("102")
  if (banka && bakiye(banka) < 0)
    sonuc.push({
      kod: "BANKA",
      durum: "UYARI",
      baslik: "Bankalar alacak bakiyesi veriyor",
      aciklama: `102 Bankalar ${TL(bakiye(banka))} alacak bakiyeli. Kredili hesap kullanımı 300 grubunda izlenmeli.`,
    })

  const tersStok = hesaplar.filter(
    (h) => h.kod >= "150" && h.kod <= "157" && bakiye(h) < 0
  )
  if (tersStok.length)
    sonuc.push({
      kod: "STOK",
      durum: "HATA",
      baslik: "Stok hesabı ters bakiye veriyor",
      aciklama: `${tersStok.map((h) => h.kod).join(", ")} alacak bakiyeli; satılan malın maliyeti veya stok girişleri eksik olabilir.`,
    })

  const ortak = hesap("131")
  if (ortak && bakiye(ortak) > 0)
    sonuc.push({
      kod: "ORTAK",
      durum: "UYARI",
      baslik: "Ortaklardan alacak var",
      aciklama: `131 Ortaklardan Alacaklar ${TL(bakiye(ortak))} borç bakiyeli; örtülü kazanç riski için adat hesaplanmalı.`,
    })

  const indirilecek = hesap("191")
  const hesaplanan = hesap("391")
  if (
    indirilecek &&
    hesaplanan &&
    bakiye(indirilecek) > 0 &&
    bakiye(hesaplanan) < 0
  )
    sonuc.push({
      kod: "KDV_MAHSUP",
      durum: "UYARI",
      baslik: "KDV mahsup kaydı yapılmamış görünüyor",
      aciklama: `191 İndirilecek KDV (${TL(bakiye(indirilecek))}) ve 391 Hesaplanan KDV (${TL(bakiye(hesaplanan))}) birlikte bakiye veriyor.`,
    })

  const odenecek = hesap("360")
  if (baglam.tahakkukToplami !== undefined) {
    const mizanda = odenecek ? -bakiye(odenecek) : 0
    const tahakkuk = baglam.tahakkukToplami
    sonuc.push(
      Math.abs(mizanda - tahakkuk) <= TOLERANS
        ? {
            kod: "VERGI_360",
            durum: "GECTI",
            baslik: "360 hesabı tahakkuklarla uyumlu",
          }
        : {
            kod: "VERGI_360",
            durum: "UYARI",
            baslik: "360 hesabı tahakkuklarla tutmuyor",
            aciklama: `360 Ödenecek Vergi ve Fonlar ${TL(mizanda)}, dönemin KDV ve MUHSGK tahakkukları ${TL(tahakkuk)}.`,
          }
    )
  }

  return sonuc
}
