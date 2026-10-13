/**
 * Aylık ücret + açılış bakiyesi içe aktarımı — saf fonksiyonlar.
 *
 * Açılış bakiyesi, bakiye tarihine kadarki tüm borç/ödemelerin özetidir. Aylık ücret borçları
 * bu yüzden varsayılan olarak bakiye tarihinden sonraki aydan başlar; aynı ay iki kez sayılmaz.
 */
import { addMonths, format } from "date-fns"

import { hucreSayi } from "./mizan"
import {
  baslikNormal,
  donemHucresi,
  evetHayir,
  kimlikDegeri,
  kimlikNo,
  metin,
  sutunlariEslestir,
  tarihHucresi,
  veriSatirlari,
  type Hucre,
  type OkunanSatir,
  type SutunTanimi,
} from "./sutun-eslestir"
import { VARSAYILAN_KDV_ORANI } from "../tahsilat/kurallar"
import { KDV_ORANLARI } from "../tahsilat/sabitler"
import { fromYmd } from "../lib/tarih"
import type { AcilisKaydi } from "../types/api"
import type { Mukellef } from "../types/domain"

type Anahtar =
  | "kimlik"
  | "unvan"
  | "ucret"
  | "kdvOrani"
  | "stopaj"
  | "baslangic"
  | "bakiye"
  | "bakiyeTarihi"

export const BAKIYE_SUTUNLARI: SutunTanimi<Anahtar>[] = [
  {
    anahtar: "kimlik",
    baslik: "VKN/TCKN",
    esAdlar: ["VKN", "TCKN", "Vergi No", "Vergi Kimlik No", "TC Kimlik No"],
    ornek: "1234567890",
    aciklama: "Mükellef VKN/TCKN ile eşleştirilir; yoksa unvanla",
  },
  {
    anahtar: "unvan",
    baslik: "Unvan",
    esAdlar: ["Mükellef", "Mükellef Adı", "Firma", "Firma Adı", "Ad Soyad"],
    ornek: "Örnek Yazılım Ltd. Şti.",
  },
  {
    anahtar: "ucret",
    baslik: "Aylık ücret",
    esAdlar: [
      "Aylık Brüt Ücret",
      "Aylık Brüt",
      "Brüt Ücret",
      "Ücret",
      "Hizmet Bedeli",
      "Aylık Hizmet Bedeli",
    ],
    ornek: 5000,
    aciklama: "KDV hariç brüt tutar (TL)",
  },
  {
    anahtar: "kdvOrani",
    baslik: "KDV oranı",
    esAdlar: ["KDV", "KDV %"],
    ornek: 20,
    aciklama: "20, 10, 1 veya 0 (boşsa 20)",
  },
  {
    anahtar: "stopaj",
    baslik: "Stopaj",
    esAdlar: ["Stopaj Var", "Tevkifat", "Gelir Vergisi Stopajı"],
    ornek: "Evet",
    aciklama:
      "Mükellef %20 stopaj keser mi? Boşsa şirketlerde Evet, şahısta Hayır",
  },
  {
    anahtar: "baslangic",
    baslik: "Başlangıç dönemi",
    esAdlar: ["Başlangıç", "İlk Dönem", "Ücret Başlangıcı"],
    ornek: "2026-10",
    aciklama:
      "İlk otomatik borçlandırılacak ay. Boşsa bakiye tarihinden sonraki ay",
  },
  {
    anahtar: "bakiye",
    baslik: "Açılış bakiyesi",
    esAdlar: [
      "Bakiye",
      "Güncel Bakiye",
      "Borç Bakiyesi",
      "Kalan Borç",
      "Alacak",
    ],
    ornek: 12500,
    aciklama: "Mükellefin bugünkü borcu (TL). Avans için eksi yazın",
  },
  {
    anahtar: "bakiyeTarihi",
    baslik: "Bakiye tarihi",
    esAdlar: ["Tarih"],
    ornek: "30.09.2026",
    aciklama: "Boşsa bugün",
  },
]

export interface BakiyeOkumaBaglami {
  mukellefler: Mukellef[]
  /** yyyy-MM-dd */
  bugun: string
  uzerineYaz: boolean
}

export type OkunanBakiye = Omit<AcilisKaydi, "satir">

const kdvOraniCoz = (h: Hucre): number | null => {
  if (metin(h) === "") return VARSAYILAN_KDV_ORANI
  const n = hucreSayi(String(metin(h)).replace("%", ""))
  if (n === null) return null
  const oran = n > 0 && n < 1 ? Math.round(n * 100) : n
  return (KDV_ORANLARI as readonly number[]).includes(oran) ? oran : null
}

export function bakiyeleriOku(
  satirlar: Hucre[][],
  baglam: BakiyeOkumaBaglami
): OkunanSatir<OkunanBakiye>[] {
  const { indeks, baslikSatiri } = sutunlariEslestir(satirlar, BAKIYE_SUTUNLARI)
  if (indeks.kimlik === undefined && indeks.unvan === undefined)
    throw new Error("VKN/TCKN veya Unvan sütunu bulunamadı")
  if (indeks.ucret === undefined && indeks.bakiye === undefined)
    throw new Error("Aylık ücret veya Açılış bakiyesi sütunu bulunamadı")

  const kimlikle = new Map(
    baglam.mukellefler.map((m) => [m.vkn ?? m.tckn ?? "", m])
  )
  const unvanla = new Map(
    baglam.mukellefler.map((m) => [baslikNormal(m.unvan), m])
  )
  const dosyada = new Map<string, number>()

  return veriSatirlari(satirlar, baslikSatiri).map(({ satir, hucreler }) => {
    const h = (a: Anahtar) =>
      indeks[a] === undefined ? undefined : hucreler[indeks[a]]
    const t = (a: Anahtar) => metin(h(a))
    const kimlik = kimlikNo(h("kimlik"))
    const m =
      (kimlik && kimlikle.get(kimlikDegeri(kimlik))) ||
      (t("unvan") ? unvanla.get(baslikNormal(t("unvan"))) : undefined)
    const etiket = m?.unvan ?? (t("unvan") || t("kimlik") || "—")
    const hatalar: string[] = []
    const bilgiler: string[] = []
    const sonuc = (
      durum: OkunanSatir<OkunanBakiye>["durum"],
      veri?: OkunanBakiye
    ): OkunanSatir<OkunanBakiye> => ({
      satir,
      etiket,
      durum,
      mesajlar: durum === "hatali" ? hatalar : bilgiler,
      veri,
    })

    if (!m) {
      hatalar.push(
        t("kimlik") || t("unvan")
          ? "Mükellef bulunamadı; önce mükellefleri aktarın"
          : "VKN/TCKN ve unvan boş"
      )
      return sonuc("hatali")
    }
    const onceki = dosyada.get(m.id)
    if (onceki) {
      bilgiler.push(`Dosyada tekrar (satır ${onceki})`)
      return sonuc("atlanacak")
    }
    dosyada.set(m.id, satir)

    const bakiyeTarihi = t("bakiyeTarihi")
      ? tarihHucresi(h("bakiyeTarihi"))
      : baglam.bugun
    if (!bakiyeTarihi)
      hatalar.push(`Bakiye tarihi geçersiz: ${t("bakiyeTarihi")}`)

    const brut = t("ucret") ? hucreSayi(h("ucret")) : 0
    if (brut === null || brut < 0)
      hatalar.push(`Aylık ücret geçersiz: ${t("ucret")}`)
    const kdvOrani = kdvOraniCoz(h("kdvOrani"))
    if (brut && kdvOrani === null)
      hatalar.push(`KDV oranı 20, 10, 1 veya 0 olmalı: ${t("kdvOrani")}`)
    const baslangic = t("baslangic")
      ? donemHucresi(h("baslangic"))
      : bakiyeTarihi && format(addMonths(fromYmd(bakiyeTarihi), 1), "yyyy-MM")
    if (brut && !baslangic)
      hatalar.push(`Başlangıç dönemi geçersiz: ${t("baslangic")}`)

    const tutar = t("bakiye") ? hucreSayi(h("bakiye")) : 0
    if (tutar === null) hatalar.push(`Açılış bakiyesi geçersiz: ${t("bakiye")}`)
    if (hatalar.length) return sonuc("hatali")

    const veri: OkunanBakiye = { mukellefId: m.id }
    if (brut) {
      if (m.ucret && !baglam.uzerineYaz)
        bilgiler.push("Ücret zaten tanımlı, değiştirilmeyecek")
      else {
        veri.ucret = {
          aylikBrut: brut,
          kdvOrani: kdvOrani!,
          stopajVar: evetHayir(h("stopaj")) ?? m.tur !== "SAHIS",
          baslangicDonem: baslangic!,
        }
        if (m.ucret) bilgiler.push("Tanımlı ücret güncellenecek")
      }
    }
    if (tutar) veri.bakiye = { tutar, tarih: bakiyeTarihi! }
    if (!veri.ucret && !veri.bakiye) {
      if (!brut && !tutar) bilgiler.push("Ücret ve bakiye boş")
      return sonuc("atlanacak")
    }
    return sonuc("aktarilacak", veri)
  })
}
