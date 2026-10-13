import { create } from "zustand"

/** 5 dakika hareketsizlikte kasa kilitlenir. */
export const KASA_OTOMATIK_KILIT_MS = 5 * 60 * 1000
/** Bu kadar hatalı ana şifre denemesinden sonra deneme geçici olarak durdurulur. */
export const MAKS_HATALI_DENEME = 5
export const DENEME_BEKLEME_MS = 30_000
/** Görüntülenen şifre bu süre sonra otomatik gizlenir. */
export const GOSTERME_SURESI_MS = 10_000

type KeyAction = (key: CryptoKey) => void | Promise<void>

interface VaultState {
  /** Ana şifreden türetilen anahtar. Yalnızca bellekte tutulur, asla persist edilmez. */
  key: CryptoKey | null
  sonEtkinlik: number
  /** Kilit açma penceresi açık mı */
  dialogAcik: boolean
  /** Kilit açıldığında çalıştırılacak işlem (ör. "göster" tıklandıysa) */
  bekleyenIslem: KeyAction | null
  hataliDeneme: number
  /** Doluysa bu zamana kadar yeni deneme yapılamaz (pencere kapanıp açılsa da korunur). */
  beklemeBitis: number | null

  unlock: (key: CryptoKey) => void
  lock: () => void
  touch: (now?: number) => void
  /** Hareketsizlik süresi dolduysa kilitler; kilitlediyse true döner. */
  lockIfIdle: (now?: number) => boolean
  /**
   * Anahtar gerektiren işlemler için giriş noktası: kasa açıksa işlemi hemen çalıştırır,
   * kilitliyse kilit açma penceresini açar ve işlemi kilit açılınca çalıştırır.
   */
  requireKey: (action?: KeyAction) => void
  closeDialog: () => void
  /** Hatalı denemeyi kaydeder; sınır aşıldıysa bekleme başlatır. Güncel sayacı döner. */
  hataliDenemeKaydet: (now?: number) => number
  beklemeyiBitir: () => void
}

export const useVaultStore = create<VaultState>()((set, get) => ({
  key: null,
  sonEtkinlik: Date.now(),
  dialogAcik: false,
  bekleyenIslem: null,
  hataliDeneme: 0,
  beklemeBitis: null,

  unlock: (key) => {
    const islem = get().bekleyenIslem
    set({
      key,
      sonEtkinlik: Date.now(),
      dialogAcik: false,
      bekleyenIslem: null,
      hataliDeneme: 0,
    })
    if (islem) void islem(key)
  },

  lock: () => set({ key: null, bekleyenIslem: null }),

  touch: (now = Date.now()) => {
    if (get().key) set({ sonEtkinlik: now })
  },

  lockIfIdle: (now = Date.now()) => {
    const { key, sonEtkinlik } = get()
    if (key && now - sonEtkinlik >= KASA_OTOMATIK_KILIT_MS) {
      set({ key: null, bekleyenIslem: null })
      return true
    }
    return false
  },

  requireKey: (action) => {
    const { key } = get()
    if (key) {
      set({ sonEtkinlik: Date.now() })
      if (action) void action(key)
      return
    }
    set({ dialogAcik: true, bekleyenIslem: action ?? null })
  },

  closeDialog: () => set({ dialogAcik: false, bekleyenIslem: null }),

  hataliDenemeKaydet: (now = Date.now()) => {
    const deneme = get().hataliDeneme + 1
    if (deneme >= MAKS_HATALI_DENEME) {
      set({ hataliDeneme: deneme, beklemeBitis: now + DENEME_BEKLEME_MS })
    } else {
      set({ hataliDeneme: deneme })
    }
    return deneme
  },

  beklemeyiBitir: () => set({ hataliDeneme: 0, beklemeBitis: null }),
}))

export const useKasaAcik = () => useVaultStore((s) => s.key !== null)
