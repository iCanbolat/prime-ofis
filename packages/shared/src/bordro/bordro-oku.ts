/**
 * Bordro özeti ayrıştırıcısı — saf fonksiyon.
 *
 * Girdi, muhasebe paketinin (Luca, Zirve, Logo, Mikro…) bordro dökümünden okunan Excel/CSV
 * satırlarıdır (`ice-aktarim/dosya-oku.ts`). Sütunlar başlık adlarıyla bulunur; sıra sabit
 * varsayılmaz. Çalışan bazlı satırlar toplanır ya da dosyada "TOPLAM" satırı varsa o alınır.
 *
 * KVKK: ad, TCKN gibi çalışan bazlı alanlar yalnızca çalışan sayısı için sayılır; hiçbiri
 * çıktıda yer almaz. Sunucuya yalnızca dönem toplamları (`BordroOzeti`) gönderilir.
 */
import { hucreSayi } from "../ice-aktarim/mizan"
import {
  SutunHatasi,
  baslikNormal,
  sutunlariEslestir,
  veriSatirlari,
  type Hucre,
  type SutunTanimi,
} from "../ice-aktarim/sutun-eslestir"
import type { BordroOzeti } from "../types/domain"

type Alan =
  | "brut"
  | "net"
  | "sgkIsci"
  | "sgkIsveren"
  | "issizlik"
  | "issizlikIsci"
  | "issizlikIsveren"
  | "gelirVergisi"
  | "damgaVergisi"
  | "ad"

const SUTUNLAR: SutunTanimi<Alan>[] = [
  {
    anahtar: "ad",
    baslik: "Ad Soyad",
    esAdlar: ["Adı Soyadı", "Personel", "Çalışan", "Personel Adı", "TCKN"],
  },
  {
    anahtar: "brut",
    baslik: "Brüt Ücret",
    esAdlar: ["Brüt", "Brüt Maaş", "Toplam Brüt", "Brüt Kazanç", "Brüt Tutar"],
    zorunlu: true,
  },
  {
    anahtar: "net",
    baslik: "Net Ücret",
    esAdlar: ["Net", "Net Maaş", "Ödenecek Net", "Net Ödenen", "Net Tutar"],
    zorunlu: true,
  },
  {
    anahtar: "sgkIsci",
    baslik: "SGK İşçi Payı",
    esAdlar: [
      "SGK İşçi Primi",
      "SSK İşçi Payı",
      "İşçi SGK Primi",
      "SGK Primi İşçi",
      "Sigorta Primi İşçi",
    ],
  },
  {
    anahtar: "sgkIsveren",
    baslik: "SGK İşveren Payı",
    esAdlar: [
      "SGK İşveren Primi",
      "SSK İşveren Payı",
      "İşveren SGK Primi",
      "SGK Primi İşveren",
      "Sigorta Primi İşveren",
    ],
  },
  {
    anahtar: "issizlik",
    baslik: "İşsizlik Sigortası",
    esAdlar: ["İşsizlik Primi", "İşsizlik", "İşsizlik Toplam"],
  },
  {
    anahtar: "issizlikIsci",
    baslik: "İşsizlik İşçi",
    esAdlar: ["İşsizlik Sigortası İşçi", "İşsizlik Primi İşçi"],
  },
  {
    anahtar: "issizlikIsveren",
    baslik: "İşsizlik İşveren",
    esAdlar: ["İşsizlik Sigortası İşveren", "İşsizlik Primi İşveren"],
  },
  {
    anahtar: "gelirVergisi",
    baslik: "Gelir Vergisi",
    esAdlar: ["G.V.", "Gelir Vergisi Kesintisi", "Kesilen Gelir Vergisi", "GV"],
  },
  {
    anahtar: "damgaVergisi",
    baslik: "Damga Vergisi",
    esAdlar: ["D.V.", "Damga V.", "Damga Vergisi Kesintisi", "DV"],
  },
]

export class BordroOkumaHatasi extends Error {}

export interface BordroOkuma {
  ozet: BordroOzeti
  /** Toplanan çalışan satırı sayısı (TOPLAM satırı hariç) */
  satirSayisi: number
  /** Toplamlar dosyadaki TOPLAM satırından alındıysa true */
  toplamSatirindan: boolean
  /** Dosyada bulunamayan isteğe bağlı sütunlar (ilgili toplam 0 alınır) */
  eksikSutunlar: string[]
}

const para = (n: number) => Math.round(n * 100) / 100
const TOPLAM_RE = /^(GENEL )?TOPLAM/

/**
 * Satırlardan dönem özeti üretir. Brüt ve net sütunları zorunludur; diğerleri yoksa 0 sayılır ve
 * `eksikSutunlar` ile bildirilir (kullanıcı önizlemede düzeltir).
 */
export function bordroOzetiOku(satirlar: Hucre[][]): BordroOkuma {
  let eslesme
  try {
    eslesme = sutunlariEslestir(satirlar, SUTUNLAR)
  } catch (e) {
    if (e instanceof SutunHatasi)
      throw new BordroOkumaHatasi(
        `${e.message}. Bordro dökümünde "Brüt Ücret" ve "Net Ücret" sütunları olmalı.`
      )
    throw e
  }
  const { indeks, baslikSatiri } = eslesme
  const sayi = (hucreler: Hucre[], alan: Alan) =>
    indeks[alan] === undefined ? 0 : (hucreSayi(hucreler[indeks[alan]!]) ?? 0)

  const toplamlar = {
    brut: 0,
    net: 0,
    sgkIsci: 0,
    sgkIsveren: 0,
    issizlik: 0,
    gelirVergisi: 0,
    damgaVergisi: 0,
  }
  let toplamSatiri: typeof toplamlar | undefined
  let satirSayisi = 0

  const oku = (hucreler: Hucre[]) => ({
    brut: sayi(hucreler, "brut"),
    net: sayi(hucreler, "net"),
    sgkIsci: sayi(hucreler, "sgkIsci"),
    sgkIsveren: sayi(hucreler, "sgkIsveren"),
    // Tek sütun ya da işçi + işveren ayrı sütun
    issizlik:
      indeks.issizlik !== undefined
        ? sayi(hucreler, "issizlik")
        : sayi(hucreler, "issizlikIsci") + sayi(hucreler, "issizlikIsveren"),
    gelirVergisi: sayi(hucreler, "gelirVergisi"),
    damgaVergisi: sayi(hucreler, "damgaVergisi"),
  })

  for (const { hucreler } of veriSatirlari(satirlar, baslikSatiri)) {
    const ilk = hucreler
      .slice(0, 3)
      .map(baslikNormal)
      .find((h) => h !== "")
    if (ilk && TOPLAM_RE.test(ilk)) {
      toplamSatiri = oku(hucreler)
      continue
    }
    const satir = oku(hucreler)
    // Brüt ve net'i olmayan satır (ara başlık, boş) çalışan sayılmaz
    if (satir.brut === 0 && satir.net === 0) continue
    satirSayisi++
    for (const k of Object.keys(toplamlar) as (keyof typeof toplamlar)[])
      toplamlar[k] += satir[k]
  }

  if (satirSayisi === 0)
    throw new BordroOkumaHatasi("Dosyada çalışan satırı bulunamadı")

  const t = toplamSatiri ?? toplamlar
  const eksik: string[] = (
    [
      ["sgkIsci", "SGK İşçi Payı"],
      ["sgkIsveren", "SGK İşveren Payı"],
      ["gelirVergisi", "Gelir Vergisi"],
      ["damgaVergisi", "Damga Vergisi"],
    ] as const
  )
    .filter(([a]) => indeks[a] === undefined)
    .map(([, ad]) => ad)
  if (
    indeks.issizlik === undefined &&
    indeks.issizlikIsci === undefined &&
    indeks.issizlikIsveren === undefined
  )
    eksik.push("İşsizlik Sigortası")

  return {
    ozet: {
      calisanSayisi: satirSayisi,
      brutToplam: para(t.brut),
      netToplam: para(t.net),
      sgkIsciPayi: para(t.sgkIsci),
      sgkIsverenPayi: para(t.sgkIsveren),
      issizlikToplam: para(t.issizlik),
      gelirVergisi: para(t.gelirVergisi),
      damgaVergisi: para(t.damgaVergisi),
    },
    satirSayisi,
    toplamSatirindan: toplamSatiri !== undefined,
    eksikSutunlar: eksik,
  }
}
