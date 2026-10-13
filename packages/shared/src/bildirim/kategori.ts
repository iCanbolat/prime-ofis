/** Bildirim türü → kategori (arayüz ikonu / rengi ve kişisel kanal tercihleri bu kategoriyle eşlenir). */
import type { BildirimTur } from "../types/domain"

export type BildirimKategori =
  | "gorev"
  | "anilma"
  | "evrak"
  | "ebelge"
  | "arsiv"
  | "mukellef"
  | "tahsilat"
  | "tebligat"
  | "borc"
  | "uyari"
  | "sistem"

const OZEL: Partial<Record<BildirimTur, BildirimKategori>> = {
  GOREV_ANILDI: "anilma",
  GOREV_GECIKTI: "uyari",
  BELGE_GECERLILIK: "uyari",
  EFATURA_YANIT_SURESI: "uyari",
  BEYAN_YAKLASIYOR: "uyari",
  BORDRO_GIRDI_BEKLIYOR: "uyari",
  ISE_HAREKETI_SURE: "uyari",
  EFATURA_REDDEDILDI: "uyari",
  ENTEGRATOR_BAGLANTI_KALDIRILDI: "uyari",
  SIFRE_SILINDI: "uyari",
  SABLON_GUNCELLENDI: "sistem",
  BEYAN_DURUMU_GUNCELLENDI: "gorev",
  BORC_TESPIT_EDILDI: "uyari",
}

/** Tür önekinden kategori türetilir; istisnalar `OZEL` tablosunda. */
export function turKategorisi(tur: BildirimTur): BildirimKategori {
  const ozel = OZEL[tur]
  if (ozel) return ozel
  if (tur.startsWith("GOREV_") || tur.startsWith("DONEM_")) return "gorev"
  if (tur.startsWith("EVRAK_") || tur.startsWith("TALEP_")) return "evrak"
  if (
    tur.startsWith("EBELGE_") ||
    tur.startsWith("EFATURA_") ||
    tur.startsWith("ENTEGRATOR_")
  )
    return "ebelge"
  if (tur.startsWith("ARSIV_")) return "arsiv"
  if (tur.startsWith("MUKELLEF_")) return "mukellef"
  if (tur.startsWith("TEBLIGAT_")) return "tebligat"
  if (
    tur.startsWith("BORC") ||
    tur.startsWith("SGK_") ||
    tur.startsWith("KAMU_") ||
    tur === "VERGI_LEVHASI_ALINDI"
  )
    return "borc"
  if (
    tur.startsWith("TAHSILAT_") ||
    tur.startsWith("ODEME_") ||
    tur.startsWith("KESINTI_") ||
    tur === "UCRET_GUNCELLENDI"
  )
    return "tahsilat"
  return "sistem"
}
