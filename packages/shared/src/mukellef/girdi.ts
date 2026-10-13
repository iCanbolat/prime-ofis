/**
 * Mükellef API girdisi: sunucu doğrulaması (api ve mock ortak). İstemci formu
 * (`schemas.ts → mukellefFormSchema`) daha ayrıntılı kontrol yapar; burada gerçek bir backend'in
 * reddedeceği durumlar ve gövdenin yapısı denetlenir. Mesajlar mock API ile aynıdır.
 */
import { z } from "../lib/zod"

import { isValidTckn, isValidVkn } from "../lib/tax-id"
import type { MukellefInput } from "../types/api"
import type { MukellefTur } from "../types/domain"

export const MUKELLEF_TURLERI = [
  "SAHIS",
  "LTD",
  "AS",
] as const satisfies readonly MukellefTur[]

const metin = z.string({ error: "Geçersiz metin alanı" }).trim().default("")
const istegeBagli = z
  .string({ error: "Geçersiz metin alanı" })
  .trim()
  .nullish()
  .transform((v) => v || undefined)
const mantiksal = z.boolean({ error: "Geçersiz evet/hayır alanı" })

export const mukellefGirdiSemasi = z.object({
  tur: z.enum(MUKELLEF_TURLERI, { error: "Geçersiz mükellef türü" }),
  unvan: z
    .string({ error: "Unvan zorunludur" })
    .trim()
    .min(1, "Unvan zorunludur"),
  sorumluPersonelId: z
    .string({ error: "Sorumlu personel bulunamadı" })
    .min(1, "Sorumlu personel bulunamadı"),
  vkn: istegeBagli,
  tckn: istegeBagli,
  ticaretSicilNo: istegeBagli,
  mersisNo: istegeBagli,
  vergiDairesi: metin,
  naceKodu: metin,
  faaliyet: metin,
  telefon: metin,
  eposta: metin,
  il: metin,
  ilce: metin,
  adres: metin,
  kdvMukellefi: mantiksal,
  kdvPeriyodu: z.enum(["AYLIK", "UC_AYLIK"], {
    error: "Geçersiz KDV periyodu",
  }),
  defterTuru: z.enum(["ISLETME", "BILANCO"], {
    error: "Geçersiz defter türü",
  }),
  sgkIsyeriVar: mantiksal,
  calisanSayisi: z
    .number({ error: "Geçersiz çalışan sayısı" })
    .int("Geçersiz çalışan sayısı")
    .min(0, "Geçersiz çalışan sayısı"),
  eDefterMukellefi: mantiksal,
  aktif: mantiksal.default(true),
  etiketler: z
    .array(z.string().trim(), { error: "Geçersiz etiket listesi" })
    .default([])
    .transform((l) => [...new Set(l.filter(Boolean))]),
  /** Ücret yalnızca `PUT /mukellefler/:id/ucret` ile değişir; burada yok sayılır */
  ucret: z.unknown().optional(),
  /** Bilinmeyen değer tercih yok sayılır */
  tercihKanal: z.unknown().optional(),
})

/**
 * Türe ait olmayan kimlik alanlarını temizler (Şahıs'ta VKN, şirkette TCKN kalmasın);
 * formdan gelen `ucret` atılır.
 */
export function mukellefNormalize(
  girdi: z.output<typeof mukellefGirdiSemasi>
): Omit<MukellefInput, "ucret"> {
  const { ucret: _ucret, tercihKanal, ...input } = girdi
  const isSahis = input.tur === "SAHIS"
  return {
    ...input,
    vkn: isSahis ? undefined : input.vkn,
    tckn: isSahis ? input.tckn : undefined,
    ticaretSicilNo: isSahis ? undefined : input.ticaretSicilNo,
    mersisNo: isSahis ? undefined : input.mersisNo,
    defterTuru: isSahis ? input.defterTuru : "BILANCO",
    sgkIsyeriVar: input.calisanSayisi > 0 ? true : input.sgkIsyeriVar,
    tercihKanal:
      tercihKanal === "EPOSTA" || tercihKanal === "WHATSAPP"
        ? tercihKanal
        : undefined,
  }
}

/** Kimlik numarası hatası (çakışma kontrolü veri kaynağına bağlı olduğu için ayrı) */
export function mukellefKimlikHatasi(
  input: Pick<MukellefInput, "tur" | "vkn" | "tckn">
): string | null {
  if (input.tur === "SAHIS") {
    return input.tckn && isValidTckn(input.tckn)
      ? null
      : "Geçerli bir TCKN giriniz"
  }
  return input.vkn && isValidVkn(input.vkn) ? null : "Geçerli bir VKN giriniz"
}

/** Kayıtlı mükellefle çakışma mesajı (409) */
export const kimlikCakismaMesaji = (tur: MukellefTur, unvan: string) =>
  `Bu ${tur === "SAHIS" ? "TCKN" : "VKN"} ile kayıtlı mükellef var: ${unvan}`
