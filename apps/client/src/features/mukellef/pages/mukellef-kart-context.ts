import { useOutletContext } from "react-router"

import type { Mukellef } from "@prime/shared/types/domain"

export interface MukellefKartContext {
  mukellef: Mukellef
}

/** Sekme sayfaları mükellef verisine kart layout'undan erişir (tekrar fetch yok). */
export function useMukellefKart() {
  return useOutletContext<MukellefKartContext>()
}

export const MUKELLEF_SEKMELERI = [
  { to: "genel", label: "Genel" },
  { to: "sifreler", label: "Şifreler" },
  { to: "takvim", label: "Takvim" },
  { to: "arsiv", label: "Arşiv" },
  { to: "evrak-talepleri", label: "Evrak Talepleri" },
  { to: "gorevler", label: "Görevler" },
  { to: "e-belge", label: "e-Belge" },
  { to: "tebligat", label: "e-Tebligat" },
  { to: "bordro", label: "Bordro" },
  { to: "borc", label: "Borç ve levha" },
  { to: "tahsilat", label: "Tahsilat" },
  { to: "fis-aktarimi", label: "Fiş Aktarımı" },
] as const
