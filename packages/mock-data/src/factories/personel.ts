import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"
import type { Buro, Personel, PersonelKimlik } from "@prime/shared/types/domain"

/** Büro ve personel sabit tutulur: login ekranı ve testler bu kimliklere dayanır. */
export const BURO: Buro = {
  id: "b_1",
  ad: "Prime Mali Müşavirlik",
  vkn: "7310512345",
  vergiDairesi: "Kadıköy",
  telefon: "02163456789",
  eposta: "info@primemusavirlik.com.tr",
  adres: "Caferağa Mah. Moda Cad. No:12/3 Kadıköy / İstanbul",
  mesajSablonlari: VARSAYILAN_SABLONLAR,
}

export const PERSONEL: Personel[] = [
  {
    id: "p_1",
    ad: "Ayşe",
    soyad: "Yılmaz",
    eposta: "ayse.yilmaz@primemusavirlik.com.tr",
    telefon: "05321112233",
    rol: "YONETICI",
    renk: "blue",
    aktif: true,
  },
  {
    id: "p_2",
    ad: "Mehmet",
    soyad: "Kaya",
    eposta: "mehmet.kaya@primemusavirlik.com.tr",
    telefon: "05334445566",
    rol: "PERSONEL",
    renk: "emerald",
    aktif: true,
  },
  {
    id: "p_3",
    ad: "Zeynep",
    soyad: "Demir",
    eposta: "zeynep.demir@primemusavirlik.com.tr",
    telefon: "05357778899",
    rol: "PERSONEL",
    renk: "amber",
    aktif: true,
  },
  {
    id: "p_4",
    ad: "Emre",
    soyad: "Şahin",
    eposta: "emre.sahin@primemusavirlik.com.tr",
    telefon: "05421234567",
    rol: "PERSONEL",
    renk: "violet",
    aktif: true,
  },
]

export const createBuro = (): Buro => ({
  ...BURO,
  mesajSablonlari: { ...VARSAYILAN_SABLONLAR },
})
export const createPersonelList = (): Personel[] =>
  PERSONEL.map((p) => ({ ...p }))

/** Demo ortamında tüm seed kullanıcılarının giriş şifresi. */
export const DEMO_GIRIS_SIFRESI = "demo1234"

/**
 * `DEMO_GIRIS_SIFRESI`nin önceden hesaplanmış PBKDF2 özeti: seed senkron üretildiği için
 * Web Crypto (async) burada çağrılamaz.
 */
const DEMO_KIMLIK: Omit<PersonelKimlik, "id"> = {
  salt: "cHJpbWUtb2ZpczpzZWVkIQ==",
  hash: "0UqX70DtzoX67FvWcbPu1+8o1ESk89otHpKtZx+OObk=",
  iterations: 100_000,
}

export const createKimlikList = (): PersonelKimlik[] =>
  PERSONEL.map((p) => ({ id: p.id, ...DEMO_KIMLIK }))
