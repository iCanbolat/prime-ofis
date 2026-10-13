/**
 * Mock API'deki üç sayfalama biçiminin ortak uygulaması (`.claude/backend.md` § 3):
 *
 * - `kirp` (varsayılan): sayfa son sayfaya kırpılır — cari, tebligat, gönderim, bordro, borç
 * - `serbest`: kırpılmaz, taşan sayfa boş döner — e-Belge faturaları
 * - `istegeBagliSayfala`: `sayfa` gönderilmezse tüm liste tek sayfada — mükellef, arşiv
 *
 * `sayfaBoyutu` 1–100 aralığına sıkıştırılır.
 */
export interface SayfaGirdisi {
  sayfa?: unknown
  sayfaBoyutu?: unknown
}

export interface SayfaSecenekleri {
  varsayilan?: number
  kip?: "kirp" | "serbest"
}

export interface Sayfa<T> {
  items: T[]
  total: number
  sayfa: number
  sayfaBoyutu: number
}

export const AZAMI_SAYFA_BOYUTU = 100

/** SQL `limit / offset` için: toplam kayıt sayısı önceden bilinmelidir (`kirp` kipi). */
export function sayfaParametreleri(
  girdi: SayfaGirdisi,
  total: number,
  { varsayilan = 20, kip = "kirp" }: SayfaSecenekleri = {}
) {
  const sayfaBoyutu = Math.min(
    Math.max(Number(girdi.sayfaBoyutu) || varsayilan, 1),
    AZAMI_SAYFA_BOYUTU
  )
  const istenen = Math.max(Math.trunc(Number(girdi.sayfa)) || 1, 1)
  const sonSayfa = Math.max(Math.ceil(total / sayfaBoyutu), 1)
  const sayfa = kip === "kirp" ? Math.min(istenen, sonSayfa) : istenen
  return { sayfa, sayfaBoyutu, offset: (sayfa - 1) * sayfaBoyutu }
}

/** Bellekteki (okuma anında hesaplanan) listeler için */
export function sayfala<T>(
  liste: T[],
  girdi: SayfaGirdisi,
  secenekler?: SayfaSecenekleri
): Sayfa<T> {
  const { sayfa, sayfaBoyutu, offset } = sayfaParametreleri(
    girdi,
    liste.length,
    secenekler
  )
  return {
    items: liste.slice(offset, offset + sayfaBoyutu),
    total: liste.length,
    sayfa,
    sayfaBoyutu,
  }
}

export function istegeBagliSayfala<T>(
  liste: T[],
  girdi: SayfaGirdisi,
  secenekler?: SayfaSecenekleri
): Sayfa<T> {
  if (!Number(girdi.sayfa)) {
    return { items: liste, total: liste.length, sayfa: 1, sayfaBoyutu: liste.length }
  }
  return sayfala(liste, girdi, secenekler)
}
