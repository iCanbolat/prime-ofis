/**
 * Luca firmasından mükellef kaydı. Mükellefler Excel ile değil, büronun Luca hesabındaki
 * firmalardan oluşturulur (`POST /luca-hesap/firmalar/aktar`). Luca'nın vermediği alanlar
 * (NACE, faaliyet, KDV periyodu, SGK) varsayılanla açılır ve mükellef kartından tamamlanır.
 * Saf: api ve mock aynı sonucu üretir.
 */
import type { LucaPortalFirma } from "./luca-portal"
import type { MukellefInput } from "../types/api"
import type { MukellefTur } from "../types/domain"

const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")

/** Firma kartında tür yoksa: 11 hane TCKN → şahıs, unvanda "A.Ş." → anonim, aksi halde limited */
export function lucaFirmaTuru(
  f: Pick<LucaPortalFirma, "tur" | "unvan" | "vknTckn">
): MukellefTur {
  if (f.tur) return f.tur
  if (f.vknTckn?.length === 11) return "SAHIS"
  return /\ba\.?\s?ş\.?(\s|$)|anonim/.test(kucuk(f.unvan)) ? "AS" : "LTD"
}

/** Mükellef API girdisi (sunucu doğrulamasından geçer: kimlik, çakışma, sorumlu) */
export function lucaFirmasindanMukellef(
  f: LucaPortalFirma,
  sorumluPersonelId: string
): MukellefInput {
  const tur = lucaFirmaTuru(f)
  const kimlik = f.vknTckn?.trim()
  return {
    tur,
    unvan: f.unvan.trim(),
    ...(tur === "SAHIS" ? { tckn: kimlik } : { vkn: kimlik }),
    vergiDairesi: f.vergiDairesi?.trim() ?? "",
    naceKodu: "",
    faaliyet: "",
    telefon: f.telefon?.trim() ?? "",
    eposta: f.eposta?.trim() ?? "",
    il: f.il?.trim() ?? "",
    ilce: f.ilce?.trim() ?? "",
    adres: f.adres?.trim() ?? "",
    sorumluPersonelId,
    kdvMukellefi: true,
    kdvPeriyodu: "AYLIK",
    defterTuru: tur === "SAHIS" ? "ISLETME" : "BILANCO",
    sgkIsyeriVar: false,
    calisanSayisi: 0,
    eDefterMukellefi: f.eDefter,
    aktif: true,
    etiketler: [],
  }
}
