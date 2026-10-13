import { z } from "../lib/zod"

import {
  isValidMersis,
  isValidNace,
  isValidPhoneTR,
  isValidTckn,
  isValidVkn,
  normalizePhoneTR,
} from "../lib/validators"
import type { MukellefInput } from "../types/api"
import type { Mukellef } from "../types/domain"

const zorunlu = (alan: string) => `${alan} zorunludur`

export const mukellefFormSchema = z
  .object({
    tur: z.enum(["SAHIS", "LTD", "AS"]),
    unvan: z
      .string()
      .trim()
      .min(2, "Unvan en az 2 karakter olmalıdır")
      .max(200, "Unvan en fazla 200 karakter olabilir"),
    tckn: z.string().trim(),
    vkn: z.string().trim(),
    ticaretSicilNo: z.string().trim().max(20, "En fazla 20 karakter"),
    mersisNo: z.string().trim(),
    vergiDairesi: z.string().trim().min(2, zorunlu("Vergi dairesi")),

    telefon: z
      .string()
      .trim()
      .min(1, zorunlu("Telefon"))
      .refine(
        isValidPhoneTR,
        "Geçerli bir telefon numarası giriniz (ör. 0532 123 45 67)"
      ),
    eposta: z.union([
      z.literal(""),
      z.email("Geçerli bir e-posta adresi giriniz"),
    ]),
    tercihKanal: z.enum(["WHATSAPP", "EPOSTA"]),
    il: z.string().trim().min(2, zorunlu("İl")),
    ilce: z.string().trim().min(2, zorunlu("İlçe")),
    adres: z.string().trim().max(300, "En fazla 300 karakter"),

    naceKodu: z
      .string()
      .trim()
      .refine(isValidNace, "NACE kodu 00.00.00 biçiminde olmalıdır"),
    faaliyet: z.string().trim().min(2, zorunlu("Faaliyet konusu")),
    kdvMukellefi: z.boolean(),
    kdvPeriyodu: z.enum(["AYLIK", "UC_AYLIK"]),
    defterTuru: z.enum(["ISLETME", "BILANCO"]),
    sgkIsyeriVar: z.boolean(),
    calisanSayisi: z
      .number({ error: "Sayı giriniz" })
      .int("Tam sayı giriniz")
      .min(0, "Negatif olamaz")
      .max(100_000, "Değer çok büyük"),
    eDefterMukellefi: z.boolean(),

    sorumluPersonelId: z.string().min(1, "Sorumlu personel seçiniz"),
    etiketler: z.array(z.string()),
    aktif: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message })

    if (v.tur === "SAHIS") {
      if (!v.tckn) issue("tckn", zorunlu("TCKN"))
      else if (!isValidTckn(v.tckn))
        issue("tckn", "Geçersiz TCKN (11 hane, algoritma kontrolü)")
    } else {
      if (!v.vkn) issue("vkn", zorunlu("VKN"))
      else if (!isValidVkn(v.vkn))
        issue("vkn", "Geçersiz VKN (10 hane, algoritma kontrolü)")
      if (v.mersisNo && !isValidMersis(v.mersisNo)) {
        issue("mersisNo", "MERSİS numarası 16 haneli olmalıdır")
      }
    }

    if (
      v.kdvPeriyodu === "UC_AYLIK" &&
      (v.tur !== "SAHIS" || v.defterTuru !== "ISLETME")
    ) {
      issue(
        "kdvPeriyodu",
        "3 aylık KDV yalnızca işletme hesabı esasına tabi şahıslar içindir"
      )
    }
    if (v.tercihKanal === "EPOSTA" && !v.eposta) {
      issue("eposta", "E-posta tercih edildiyse adres zorunludur")
    }
    if (v.calisanSayisi > 0 && !v.sgkIsyeriVar) {
      issue(
        "sgkIsyeriVar",
        "Çalışanı olan mükellefin SGK işyeri kaydı olmalıdır"
      )
    }
  })

export type MukellefFormValues = z.infer<typeof mukellefFormSchema>

/** Sihirbaz adımları ve her adımda doğrulanan alanlar */
export const FORM_ADIMLARI = [
  {
    baslik: "Tür ve kimlik",
    alanlar: [
      "tur",
      "unvan",
      "tckn",
      "vkn",
      "ticaretSicilNo",
      "mersisNo",
      "vergiDairesi",
    ],
  },
  {
    baslik: "İletişim",
    alanlar: ["telefon", "eposta", "tercihKanal", "il", "ilce", "adres"],
  },
  {
    baslik: "Vergi yükümlülükleri",
    alanlar: [
      "naceKodu",
      "faaliyet",
      "kdvMukellefi",
      "kdvPeriyodu",
      "defterTuru",
      "sgkIsyeriVar",
      "calisanSayisi",
      "eDefterMukellefi",
    ],
  },
  {
    baslik: "Sorumlu ve etiketler",
    alanlar: ["sorumluPersonelId", "etiketler", "aktif"],
  },
] as const satisfies ReadonlyArray<{
  baslik: string
  alanlar: ReadonlyArray<keyof MukellefFormValues>
}>

export const BOS_MUKELLEF_FORMU: MukellefFormValues = {
  tur: "LTD",
  unvan: "",
  tckn: "",
  vkn: "",
  ticaretSicilNo: "",
  mersisNo: "",
  vergiDairesi: "",
  telefon: "",
  eposta: "",
  tercihKanal: "WHATSAPP",
  il: "İstanbul",
  ilce: "",
  adres: "",
  naceKodu: "",
  faaliyet: "",
  kdvMukellefi: true,
  kdvPeriyodu: "AYLIK",
  defterTuru: "BILANCO",
  sgkIsyeriVar: false,
  calisanSayisi: 0,
  eDefterMukellefi: false,
  sorumluPersonelId: "",
  etiketler: [],
  aktif: true,
}

export function mukellefToFormValues(m: Mukellef): MukellefFormValues {
  return {
    tur: m.tur,
    unvan: m.unvan,
    tckn: m.tckn ?? "",
    vkn: m.vkn ?? "",
    ticaretSicilNo: m.ticaretSicilNo ?? "",
    mersisNo: m.mersisNo ?? "",
    vergiDairesi: m.vergiDairesi,
    telefon: m.telefon,
    eposta: m.eposta,
    tercihKanal: m.tercihKanal ?? "WHATSAPP",
    il: m.il,
    ilce: m.ilce,
    adres: m.adres,
    naceKodu: m.naceKodu,
    faaliyet: m.faaliyet,
    kdvMukellefi: m.kdvMukellefi,
    kdvPeriyodu: m.kdvPeriyodu,
    defterTuru: m.defterTuru,
    sgkIsyeriVar: m.sgkIsyeriVar,
    calisanSayisi: m.calisanSayisi,
    eDefterMukellefi: m.eDefterMukellefi,
    sorumluPersonelId: m.sorumluPersonelId,
    etiketler: m.etiketler,
    aktif: m.aktif,
  }
}

/** Form değerlerini API girdisine çevirir: türe ait olmayan alanlar atılır, telefon normalize edilir. */
export function formValuesToInput(v: MukellefFormValues): MukellefInput {
  const isSahis = v.tur === "SAHIS"
  return {
    ...v,
    tckn: isSahis ? v.tckn : undefined,
    vkn: isSahis ? undefined : v.vkn,
    ticaretSicilNo: isSahis ? undefined : v.ticaretSicilNo || undefined,
    mersisNo: isSahis ? undefined : v.mersisNo || undefined,
    defterTuru: isSahis ? v.defterTuru : "BILANCO",
    telefon: normalizePhoneTR(v.telefon),
  }
}
