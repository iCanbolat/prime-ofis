/**
 * Mükellef listesi içe aktarımı — saf fonksiyonlar. Zorunlu: unvan, VKN/TCKN, vergi dairesi.
 * Diğer alanlar boş olabilir (eski programların çıktıları eksik olur); dolu ama geçersiz
 * alan satırı engellemez, boşaltılır ve uyarı olarak gösterilir.
 */
import {
  baslikNormal,
  evetHayir,
  kimlikDegeri,
  kimlikNo,
  metin,
  sutunlariEslestir,
  veriSatirlari,
  type Hucre,
  type OkunanSatir,
  type SutunTanimi,
} from "./sutun-eslestir"
import { isValidNace, isValidPhoneTR, normalizePhoneTR } from "../lib/validators"
import type { MukellefInput } from "../types/api"
import type { MukellefTur, Personel } from "../types/domain"

export const MUKELLEF_SUTUNLARI = [
  {
    anahtar: "unvan",
    baslik: "Unvan",
    esAdlar: [
      "Unvanı",
      "Ad Soyad",
      "Adı Soyadı",
      "Adı Soyadı / Unvanı",
      "Mükellef",
      "Mükellef Adı",
      "Mükellef Unvanı",
      "Firma",
      "Firma Adı",
      "Müşteri",
      "Müşteri Adı",
    ],
    zorunlu: true,
    ornek: "Örnek Yazılım Ltd. Şti.",
  },
  {
    anahtar: "kimlik",
    baslik: "VKN/TCKN",
    esAdlar: [
      "VKN",
      "TCKN",
      "TC Kimlik No",
      "TC No",
      "Vergi No",
      "Vergi Numarası",
      "Vergi Kimlik No",
      "Vergi Kimlik Numarası",
      "VKN TC",
    ],
    zorunlu: true,
    ornek: "1234567890",
    aciklama: "Şirketler için 10 haneli VKN, şahıslar için 11 haneli TCKN",
  },
  {
    anahtar: "vergiDairesi",
    baslik: "Vergi dairesi",
    esAdlar: ["VD", "V.D.", "Vergi Dairesi Adı"],
    zorunlu: true,
    ornek: "Kadıköy",
  },
  {
    anahtar: "tur",
    baslik: "Tür",
    esAdlar: ["Mükellef Türü", "Şirket Türü", "Tipi", "Türü"],
    ornek: "Ltd",
    aciklama: "Şahıs / Ltd / A.Ş. Boşsa TCKN → Şahıs, VKN → Ltd",
  },
  {
    anahtar: "telefon",
    baslik: "Telefon",
    esAdlar: ["Tel", "Cep Telefonu", "GSM", "Cep"],
    ornek: "0532 123 45 67",
  },
  {
    anahtar: "eposta",
    baslik: "E-posta",
    esAdlar: ["Eposta", "E-mail", "Email", "Mail"],
    ornek: "info@ornek.com.tr",
  },
  { anahtar: "il", baslik: "İl", esAdlar: ["Şehir"], ornek: "İstanbul" },
  { anahtar: "ilce", baslik: "İlçe", ornek: "Kadıköy" },
  { anahtar: "adres", baslik: "Adres", ornek: "Moda Cad. No: 1" },
  {
    anahtar: "nace",
    baslik: "NACE kodu",
    esAdlar: ["NACE", "Faaliyet Kodu"],
    ornek: "62.01.01",
  },
  {
    anahtar: "faaliyet",
    baslik: "Faaliyet",
    esAdlar: ["Faaliyet Konusu", "Sektör"],
    ornek: "Yazılım geliştirme",
  },
  {
    anahtar: "kdvMukellefi",
    baslik: "KDV mükellefi",
    esAdlar: ["KDV"],
    ornek: "Evet",
    aciklama: "Evet / Hayır (boşsa Evet)",
  },
  {
    anahtar: "kdvPeriyodu",
    baslik: "KDV periyodu",
    ornek: "Aylık",
    aciklama: "Aylık / 3 aylık (boşsa Aylık)",
  },
  {
    anahtar: "defterTuru",
    baslik: "Defter türü",
    esAdlar: ["Defter"],
    ornek: "Bilanço",
    aciklama: "İşletme / Bilanço (şirketlerde her zaman Bilanço)",
  },
  {
    anahtar: "sgkIsyeri",
    baslik: "SGK işyeri",
    esAdlar: ["SGK", "SGK İşyeri Var"],
    ornek: "Evet",
  },
  {
    anahtar: "calisanSayisi",
    baslik: "Çalışan sayısı",
    esAdlar: ["Personel Sayısı", "İşçi Sayısı"],
    ornek: 4,
  },
  {
    anahtar: "eDefter",
    baslik: "e-Defter",
    esAdlar: ["e-Defter Mükellefi"],
    ornek: "Hayır",
  },
  {
    anahtar: "sorumlu",
    baslik: "Sorumlu",
    esAdlar: ["Sorumlu Personel", "Personel"],
    ornek: "Ayşe Yılmaz",
    aciklama:
      "Personelin adı soyadı veya e-postası; boşsa sayfada seçilen kişi",
  },
  {
    anahtar: "etiketler",
    baslik: "Etiketler",
    esAdlar: ["Etiket", "Grup"],
    ornek: "e-ticaret, öncelikli",
    aciklama: "Virgülle ayrılmış",
  },
  {
    anahtar: "ticaretSicilNo",
    baslik: "Ticaret sicil no",
    esAdlar: ["Sicil No"],
  },
  { anahtar: "mersisNo", baslik: "MERSİS no", esAdlar: ["MERSİS"] },
] as const satisfies readonly SutunTanimi[]

type Anahtar = (typeof MUKELLEF_SUTUNLARI)[number]["anahtar"]

export interface MukellefOkumaBaglami {
  /** Kayıtlı mükelleflerin VKN/TCKN → unvan */
  mevcut: Map<string, string>
  personel: Personel[]
  varsayilanSorumluId: string
}

function turCoz(h: Hucre): MukellefTur | undefined {
  const s = baslikNormal(h)
  if (!s) return undefined
  if (/^(SAHIS|GERCEK|GERCEK KISI|SAHIS FIRMASI)$/.test(s)) return "SAHIS"
  if (/^(LTD|LIMITED|LTD STI|LIMITED SIRKETI)$/.test(s)) return "LTD"
  if (/^(A S|AS|ANONIM|ANONIM SIRKET|ANONIM SIRKETI)$/.test(s)) return "AS"
  return undefined
}

const EPOSTA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function mukellefleriOku(
  satirlar: Hucre[][],
  baglam: MukellefOkumaBaglami
): OkunanSatir<MukellefInput>[] {
  const { indeks, baslikSatiri } = sutunlariEslestir<Anahtar>(satirlar, [
    ...MUKELLEF_SUTUNLARI,
  ])
  const personelAd = new Map(
    baglam.personel.flatMap((p) => [
      [baslikNormal(`${p.ad} ${p.soyad}`), p.id] as const,
      [p.eposta.toLocaleLowerCase("tr-TR"), p.id] as const,
    ])
  )
  const dosyada = new Map<string, number>()

  return veriSatirlari(satirlar, baslikSatiri).map(({ satir, hucreler }) => {
    const h = (a: Anahtar) =>
      indeks[a] === undefined ? undefined : hucreler[indeks[a]]
    const t = (a: Anahtar) => metin(h(a))
    const unvan = t("unvan")
    const hatalar: string[] = []
    const uyarilar: string[] = []
    const sonuc = (
      durum: OkunanSatir<MukellefInput>["durum"],
      veri?: MukellefInput
    ): OkunanSatir<MukellefInput> => ({
      satir,
      etiket: unvan || "—",
      durum,
      mesajlar: durum === "hatali" ? hatalar : uyarilar,
      veri,
    })

    if (unvan.length < 2) hatalar.push("Unvan boş")
    const kimlik = kimlikNo(h("kimlik"))
    if (!kimlik)
      hatalar.push(
        t("kimlik") ? `Geçersiz VKN/TCKN: ${t("kimlik")}` : "VKN/TCKN boş"
      )
    const vergiDairesi = t("vergiDairesi")
    if (vergiDairesi.length < 2) hatalar.push("Vergi dairesi boş")

    let tur = turCoz(h("tur"))
    if (t("tur") && !tur) uyarilar.push(`Tür tanınmadı: ${t("tur")}`)
    if (kimlik) {
      if (!tur) tur = "tckn" in kimlik ? "SAHIS" : "LTD"
      if (tur === "SAHIS" && "vkn" in kimlik)
        hatalar.push("Şahıs mükellef için 11 haneli TCKN gerekir")
      if (tur !== "SAHIS" && "tckn" in kimlik)
        hatalar.push("Şirket için 10 haneli VKN gerekir")
    }
    if (hatalar.length || !kimlik || !tur) return sonuc("hatali")

    const no = kimlikDegeri(kimlik)
    const kayitli = baglam.mevcut.get(no)
    if (kayitli) {
      uyarilar.push(`Zaten kayıtlı: ${kayitli}`)
      return sonuc("atlanacak")
    }
    const onceki = dosyada.get(no)
    if (onceki) {
      uyarilar.push(`Dosyada tekrar (satır ${onceki})`)
      return sonuc("atlanacak")
    }
    dosyada.set(no, satir)

    // Dolu ama geçersiz isteğe bağlı alanlar boşaltılır
    let telefon = t("telefon")
    if (telefon) {
      if (isValidPhoneTR(telefon)) telefon = normalizePhoneTR(telefon)
      else {
        uyarilar.push(`Telefon geçersiz, boş bırakıldı: ${telefon}`)
        telefon = ""
      }
    }
    let eposta = t("eposta")
    if (eposta && !EPOSTA_RE.test(eposta)) {
      uyarilar.push(`E-posta geçersiz, boş bırakıldı: ${eposta}`)
      eposta = ""
    }
    let naceKodu = t("nace")
    if (naceKodu && !isValidNace(naceKodu)) {
      uyarilar.push(`NACE kodu geçersiz, boş bırakıldı: ${naceKodu}`)
      naceKodu = ""
    }
    let sorumluPersonelId = baglam.varsayilanSorumluId
    const sorumlu = t("sorumlu")
    if (sorumlu) {
      const id =
        personelAd.get(baslikNormal(sorumlu)) ??
        personelAd.get(sorumlu.toLocaleLowerCase("tr-TR"))
      if (id) sorumluPersonelId = id
      else uyarilar.push(`Sorumlu bulunamadı: ${sorumlu}`)
    }
    const calisan = Number(metin(h("calisanSayisi")).replace(/\D/g, "")) || 0
    const sahis = tur === "SAHIS"
    const mersis = t("mersisNo").replace(/\D/g, "")

    return sonuc("aktarilacak", {
      tur,
      unvan,
      ...("vkn" in kimlik ? { vkn: kimlik.vkn } : { tckn: kimlik.tckn }),
      ticaretSicilNo: sahis ? undefined : t("ticaretSicilNo") || undefined,
      mersisNo: !sahis && mersis.length === 16 ? mersis : undefined,
      vergiDairesi,
      naceKodu,
      faaliyet: t("faaliyet"),
      telefon,
      eposta,
      il: t("il"),
      ilce: t("ilce"),
      adres: t("adres"),
      sorumluPersonelId,
      kdvMukellefi: evetHayir(h("kdvMukellefi")) ?? true,
      kdvPeriyodu: /^(3|UC)/.test(baslikNormal(h("kdvPeriyodu")))
        ? "UC_AYLIK"
        : "AYLIK",
      defterTuru:
        sahis && baslikNormal(h("defterTuru")).startsWith("ISLETME")
          ? "ISLETME"
          : sahis && !t("defterTuru")
            ? "ISLETME"
            : "BILANCO",
      sgkIsyeriVar: evetHayir(h("sgkIsyeri")) ?? calisan > 0,
      calisanSayisi: calisan,
      eDefterMukellefi: evetHayir(h("eDefter")) ?? false,
      aktif: true,
      etiketler: t("etiketler")
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean),
    })
  })
}
