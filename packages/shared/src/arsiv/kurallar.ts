/**
 * Dijital arşiv kuralları — saf fonksiyonlar (UI ve mock sunucu ortak kullanır).
 */
import { differenceInCalendarDays } from "date-fns"

import { BORDRO_BELGE_SIRASI, BORDRO_DONEM_RE } from "../bordro/kurallar"
import { fromYmd } from "../lib/tarih"
import type { ArsivAgacMukellef, GecerlilikDurumu } from "../types/api"
import type {
  ArsivDosya,
  ArsivKategori,
  BordroBelgeTur,
  Mukellef,
  MukellefTur,
} from "../types/domain"

export const MAKS_DOSYA_BOYUTU = 10 * 1024 * 1024

/** Kabul edilen türler: MIME → uzantılar */
export const KABUL_EDILEN_TURLER: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
}

/**
 * İçe aktarılan tablo dosyaları (mizan): arşive yüklenebilir ama arşiv yükleme ekranında seçilemez.
 * `.xls` içerikten yalnızca genel OLE kabı olarak tanınır; CSV'nin imzası yoktur (metin).
 */
export const TABLO_DOSYA_TURLERI: Record<string, string[]> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
}

/** `<input accept>` değeri */
export const DOSYA_ACCEPT = Object.entries(KABUL_EDILEN_TURLER)
  .flatMap(([mime, uzantilar]) => [mime, ...uzantilar])
  .join(",")

/** Dosyanın MIME türü; tarayıcı boş bırakırsa (ör. HEIC) uzantıdan çözülür. Desteklenmiyorsa null. */
export function dosyaMimeTuru(file: {
  name: string
  type: string
}): string | null {
  if (file.type && file.type in KABUL_EDILEN_TURLER) return file.type
  // Uzantılar ASCII: tr-TR küçültme "HEIC" → "heıc" yapardı
  const uzanti = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (!uzanti) return null
  const eslesen = Object.entries(KABUL_EDILEN_TURLER).find(([, u]) =>
    u.includes(uzanti)
  )
  return eslesen?.[0] ?? null
}

/** Yükleme öncesi doğrulama. Geçerliyse null, değilse hata mesajı. */
export function dosyaDogrula(file: {
  name: string
  type: string
  size: number
}): string | null {
  if (!dosyaMimeTuru(file))
    return "Desteklenmeyen dosya türü. PDF, JPG, PNG veya HEIC yükleyin."
  if (file.size > MAKS_DOSYA_BOYUTU) return "Dosya 10 MB sınırını aşıyor."
  if (file.size === 0) return "Dosya boş."
  return null
}

/** Geçerlilik tarihi takip edilen kategoriler */
export const GECERLILIK_GEREKEN: ArsivKategori[] = [
  "IMZA_SIRKULERI",
  "FAALIYET_BELGESI",
  "KIRA_SOZLESMESI",
  "BORCU_YOKTUR",
]

/** Kaç gün kala "yakında doluyor" sayılır */
export const YAKINDA_ESIGI_GUN = 30

export function kalanGun(gecerlilikTarihi: string, bugunYmd: string): number {
  return differenceInCalendarDays(fromYmd(gecerlilikTarihi), fromYmd(bugunYmd))
}

export function gecerlilikDurumu(
  gecerlilikTarihi: string,
  bugunYmd: string
): GecerlilikDurumu {
  const kalan = kalanGun(gecerlilikTarihi, bugunYmd)
  if (kalan < 0) return "DOLDU"
  if (kalan <= YAKINDA_ESIGI_GUN) return "YAKINDA"
  return "GECERLI"
}

/** Mükellef türüne göre arşivde bulunması beklenen kategoriler */
export const ZORUNLU_KATEGORILER: Record<MukellefTur, ArsivKategori[]> = {
  SAHIS: ["VERGI_LEVHASI", "KIMLIK"],
  LTD: ["IMZA_SIRKULERI", "TICARET_SICIL_GAZETESI", "VERGI_LEVHASI"],
  AS: ["IMZA_SIRKULERI", "TICARET_SICIL_GAZETESI", "VERGI_LEVHASI"],
}

/** Kategori sırası (ağaç ve seçimlerde) */
export const KATEGORI_SIRASI: ArsivKategori[] = [
  "IMZA_SIRKULERI",
  "TICARET_SICIL_GAZETESI",
  "VERGI_LEVHASI",
  "FAALIYET_BELGESI",
  "KIRA_SOZLESMESI",
  "KIMLIK",
  "FATURA",
  "BANKA_EKSTRESI",
  "TAHAKKUK",
  "MIZAN",
  "TEBLIGAT",
  "BORDRO",
  "SGK_BELGESI",
  "BORCU_YOKTUR",
  "DIGER",
]

/** Çöp kutusundakiler hariç, mükellefin eksik zorunlu kategorileri */
export function eksikZorunlu(
  mukellef: Pick<Mukellef, "id" | "tur">,
  dosyalar: Pick<ArsivDosya, "mukellefId" | "kategori" | "silindi">[]
): ArsivKategori[] {
  const mevcut = new Set(
    dosyalar
      .filter((d) => d.mukellefId === mukellef.id && !d.silindi)
      .map((d) => d.kategori)
  )
  return ZORUNLU_KATEGORILER[mukellef.tur].filter((k) => !mevcut.has(k))
}

/** Mükellef → kategori sayıları (çöp kutusu hariç) */
export function agacOlustur(
  mukellefler: Pick<Mukellef, "id" | "tur" | "unvan">[],
  dosyalar: Pick<ArsivDosya, "mukellefId" | "kategori" | "silindi">[]
): ArsivAgacMukellef[] {
  const aktif = dosyalar.filter((d) => !d.silindi)
  return mukellefler
    .map((m) => {
      const kategoriler: ArsivAgacMukellef["kategoriler"] = {}
      let toplam = 0
      for (const d of aktif) {
        if (d.mukellefId !== m.id) continue
        kategoriler[d.kategori] = (kategoriler[d.kategori] ?? 0) + 1
        toplam++
      }
      return {
        mukellefId: m.id,
        unvan: m.unvan,
        tur: m.tur,
        toplam,
        kategoriler,
        eksikZorunlu: eksikZorunlu(m, dosyalar),
      }
    })
    .sort((a, b) => a.unvan.localeCompare(b.unvan, "tr-TR"))
}

export function formatBoyut(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`
}

export function gorselMi(mimeType: string) {
  return mimeType.startsWith("image/")
}

/** Arşiv kaydının dönem / bordro belge alanlarını doğrular; geçerliyse undefined */
export function donemAlanlariHatasi(
  donem: unknown,
  bordroBelge: unknown
): string | undefined {
  if (
    donem !== undefined &&
    (typeof donem !== "string" || !BORDRO_DONEM_RE.test(donem))
  )
    return "Geçersiz dönem"
  if (
    bordroBelge !== undefined &&
    !BORDRO_BELGE_SIRASI.includes(bordroBelge as BordroBelgeTur)
  )
    return "Geçersiz belge türü"
}
