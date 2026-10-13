/**
 * Şifre listesi içe aktarımı — saf fonksiyonlar. Bürolar şifreleri genelde mükellef başına tek
 * satırda, sistemleri yan yana sütunlarda tutar ("geniş" biçim); her dolu sistem bir kayda dönüşür.
 * Şifreler burada düz metindir; sunucuya gitmeden önce sayfada kasa anahtarıyla şifrelenir.
 */
import {
  baslikNormal,
  kimlikDegeri,
  kimlikNo,
  metin,
  sutunlariEslestir,
  veriSatirlari,
  type Hucre,
  type OkunanSatir,
  type SutunTanimi,
} from "./sutun-eslestir"
import { SISTEMLER, SISTEM_SIRASI } from "../kasa/sistemler"
import type { CredentialSecret, Mukellef, Sistem } from "../types/domain"

type Alan = "kullanici" | "sifre" | "ekSifre"
type Anahtar = "kimlik" | "unvan" | "not" | `${Sistem}_${Alan}`

/** Sütun başlıklarında sistem adının yazılış biçimleri */
const SISTEM_ONEKLERI: Record<Sistem, string[]> = {
  GIB: ["GİB", "GIB", "e-Beyanname", "Dijital VD"],
  IVD: ["İVD", "IVD", "İnteraktif VD", "İnteraktif Vergi Dairesi"],
  SGK: ["SGK", "SGK İşveren"],
  EBILDIRGE: ["e-Bildirge", "eBildirge", "E Bildirge"],
}

/** Alan başlıkları: şablondaki (SISTEMLER etiketleri) + yaygın yazılışlar */
function alanAdlari(sistem: Sistem, alan: Alan): string[] {
  const t = SISTEMLER[sistem]
  if (alan === "kullanici")
    return [
      t.kullaniciAdiEtiketi,
      "Kullanıcı Adı",
      "Kullanıcı Kodu",
      "Kullanıcı",
      "Kodu",
    ]
  if (alan === "sifre")
    return sistem === "GIB"
      ? ["Parola", "Parolası"]
      : [t.sifreEtiketi, "Şifre", "Şifresi", "Sistem Şifresi"]
  return sistem === "GIB"
    ? ["Şifre", "Şifresi"]
    : [t.ekSifreEtiketi ?? "", "İşyeri Şifresi"]
}

function sistemSutunlari(): SutunTanimi<Anahtar>[] {
  return SISTEM_SIRASI.flatMap((sistem) => {
    const t = SISTEMLER[sistem]
    const alanlar: Alan[] = t.ekSifreEtiketi
      ? ["kullanici", "sifre", "ekSifre"]
      : ["kullanici", "sifre"]
    return alanlar.map((alan) => {
      const adlar = alanAdlari(sistem, alan).filter(Boolean)
      return {
        anahtar: `${sistem}_${alan}` as const,
        baslik: `${t.ad} ${adlar[0]!.toLocaleLowerCase("tr-TR")}`,
        esAdlar: SISTEM_ONEKLERI[sistem].flatMap((o) =>
          adlar.map((a) => `${o} ${a}`)
        ),
        ornek:
          alan === "kullanici"
            ? sistem === "IVD"
              ? "1234567890"
              : "12345678"
            : "••••••",
        aciklama:
          alan === "kullanici" && sistem === "IVD"
            ? "Boşsa mükellefin VKN/TCKN'si kullanılır"
            : undefined,
      }
    })
  })
}

export const SIFRE_SUTUNLARI: SutunTanimi<Anahtar>[] = [
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
  ...sistemSutunlari(),
  {
    anahtar: "not",
    baslik: "Not",
    esAdlar: ["Açıklama", "Notlar"],
    aciklama: "Tüm sistemlere yazılır; şifrelenmez, hassas bilgi yazmayın",
  },
]

export interface OkunanSifre {
  mukellefId: string
  sistem: Sistem
  kullaniciAdi: string
  secret: CredentialSecret
  not?: string
}

export interface SifreOkumaBaglami {
  mukellefler: Mukellef[]
  /** Kayıtlı "mukellefId:sistem" anahtarları */
  mevcut: Set<string>
  uzerineYaz: boolean
}

export function sifreleriOku(
  satirlar: Hucre[][],
  baglam: SifreOkumaBaglami
): OkunanSatir<OkunanSifre>[] {
  const { indeks, baslikSatiri } = sutunlariEslestir(satirlar, SIFRE_SUTUNLARI)
  if (indeks.kimlik === undefined && indeks.unvan === undefined)
    throw new Error("VKN/TCKN veya Unvan sütunu bulunamadı")
  if (!SISTEM_SIRASI.some((s) => indeks[`${s}_sifre`] !== undefined))
    throw new Error("Hiçbir sistemin şifre sütunu bulunamadı")

  const kimlikle = new Map(
    baglam.mukellefler.map((m) => [m.vkn ?? m.tckn ?? "", m])
  )
  const unvanla = new Map(
    baglam.mukellefler.map((m) => [baslikNormal(m.unvan), m])
  )
  const dosyada = new Set<string>()

  return veriSatirlari(satirlar, baslikSatiri).flatMap(
    ({ satir, hucreler }) => {
      const t = (a: Anahtar) =>
        indeks[a] === undefined ? "" : metin(hucreler[indeks[a]])
      const kimlik = kimlikNo(t("kimlik"))
      const mukellef =
        (kimlik && kimlikle.get(kimlikDegeri(kimlik))) ||
        (t("unvan") ? unvanla.get(baslikNormal(t("unvan"))) : undefined)
      const ad = mukellef?.unvan ?? (t("unvan") || t("kimlik") || "—")

      if (!mukellef)
        return [
          {
            satir,
            etiket: ad,
            durum: "hatali" as const,
            mesajlar: [
              t("kimlik") || t("unvan")
                ? "Mükellef bulunamadı; önce mükellefleri aktarın"
                : "VKN/TCKN ve unvan boş",
            ],
          },
        ]

      const kayitlar: OkunanSatir<OkunanSifre>[] = []
      for (const sistem of SISTEM_SIRASI) {
        let kullaniciAdi = t(`${sistem}_kullanici`)
        const sifre = t(`${sistem}_sifre`)
        const ekSifre = t(`${sistem}_ekSifre`)
        if (!kullaniciAdi && !sifre && !ekSifre) continue
        const etiket = `${mukellef.unvan} · ${SISTEMLER[sistem].ad}`
        // İnteraktif VD girişi VKN/TCKN ile yapılır
        if (!kullaniciAdi && sistem === "IVD")
          kullaniciAdi = mukellef.vkn ?? mukellef.tckn ?? ""
        const eksik = [
          !kullaniciAdi && SISTEMLER[sistem].kullaniciAdiEtiketi,
          !sifre && SISTEMLER[sistem].sifreEtiketi,
        ].filter(Boolean)
        if (eksik.length) {
          kayitlar.push({
            satir,
            etiket,
            durum: "hatali",
            mesajlar: [`Eksik: ${eksik.join(", ")}`],
          })
          continue
        }
        const anahtar = `${mukellef.id}:${sistem}`
        const veri: OkunanSifre = {
          mukellefId: mukellef.id,
          sistem,
          kullaniciAdi,
          secret: ekSifre ? { sifre, ekSifre } : { sifre },
          not: t("not") || undefined,
        }
        if (dosyada.has(anahtar)) {
          kayitlar.push({
            satir,
            etiket,
            durum: "atlanacak",
            mesajlar: ["Dosyada tekrar"],
          })
          continue
        }
        dosyada.add(anahtar)
        const kayitli = baglam.mevcut.has(anahtar)
        kayitlar.push(
          kayitli && !baglam.uzerineYaz
            ? {
                satir,
                etiket,
                durum: "atlanacak",
                mesajlar: ["Kasada kayıtlı"],
              }
            : {
                satir,
                etiket,
                durum: "aktarilacak",
                mesajlar: kayitli ? ["Kasadaki kayıt güncellenecek"] : [],
                veri,
              }
        )
      }
      if (kayitlar.length === 0)
        kayitlar.push({
          satir,
          etiket: ad,
          durum: "atlanacak",
          mesajlar: ["Şifre sütunları boş"],
        })
      return kayitlar
    }
  )
}
