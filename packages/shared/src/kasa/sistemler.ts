import type { Mukellef, Sistem } from "../types/domain"

export interface SistemTanimi {
  ad: string
  aciklama: string
  kullaniciAdiEtiketi: string
  sifreEtiketi: string
  /** Varsa ikinci gizli alan (GİB şifre, SGK işyeri şifresi) */
  ekSifreEtiketi?: string
}

export const SISTEMLER: Record<Sistem, SistemTanimi> = {
  GIB: {
    ad: "GİB",
    aciklama: "e-Beyanname / Dijital Vergi Dairesi",
    kullaniciAdiEtiketi: "Kullanıcı kodu",
    sifreEtiketi: "Parola",
    ekSifreEtiketi: "Şifre",
  },
  IVD: {
    ad: "İnteraktif VD",
    aciklama: "İnteraktif Vergi Dairesi",
    kullaniciAdiEtiketi: "TCKN / VKN",
    sifreEtiketi: "Şifre",
  },
  SGK: {
    ad: "SGK",
    aciklama: "SGK İşveren Sistemi",
    kullaniciAdiEtiketi: "Kullanıcı adı",
    sifreEtiketi: "Sistem şifresi",
    ekSifreEtiketi: "İşyeri şifresi",
  },
  EBILDIRGE: {
    ad: "e-Bildirge",
    aciklama: "SGK e-Bildirge",
    kullaniciAdiEtiketi: "Kullanıcı adı",
    sifreEtiketi: "Sistem şifresi",
    ekSifreEtiketi: "İşyeri şifresi",
  },
}

/** Kartlarda ve kasa tablosunda gösterim sırası */
export const SISTEM_SIRASI: Sistem[] = ["GIB", "IVD", "SGK", "EBILDIRGE"]

/** SGK sistemleri yalnızca SGK işyeri kaydı olan mükellefler için beklenir. */
export function sistemGerekliMi(
  mukellef: Pick<Mukellef, "sgkIsyeriVar">,
  sistem: Sistem
): boolean {
  if (sistem === "SGK" || sistem === "EBILDIRGE") return mukellef.sgkIsyeriVar
  return true
}
