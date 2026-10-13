import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"

import { KasaOtomatikKilit } from "@/features/kasa/components/kasa-kilidi"
import {
  DENEME_BEKLEME_MS,
  KASA_OTOMATIK_KILIT_MS,
  MAKS_HATALI_DENEME,
  useVaultStore,
} from "@/features/kasa/store"

const sahteAnahtar = {} as CryptoKey
const store = () => useVaultStore.getState()

beforeEach(() => {
  useVaultStore.setState({
    key: null,
    dialogAcik: false,
    bekleyenIslem: null,
    hataliDeneme: 0,
    beklemeBitis: null,
  })
})

describe("requireKey", () => {
  it("kasa kilitliyken pencereyi açar, kilit açılınca bekleyen işlemi çalıştırır", () => {
    const islem = vi.fn()
    store().requireKey(islem)
    expect(store().dialogAcik).toBe(true)
    expect(islem).not.toHaveBeenCalled()

    store().unlock(sahteAnahtar)
    expect(islem).toHaveBeenCalledWith(sahteAnahtar)
    expect(store().dialogAcik).toBe(false)
    expect(store().bekleyenIslem).toBeNull()
  })

  it("kasa açıkken işlemi hemen çalıştırır", () => {
    store().unlock(sahteAnahtar)
    const islem = vi.fn()
    store().requireKey(islem)
    expect(islem).toHaveBeenCalledWith(sahteAnahtar)
    expect(store().dialogAcik).toBe(false)
  })

  it("pencere kapatılınca bekleyen işlem iptal olur", () => {
    const islem = vi.fn()
    store().requireKey(islem)
    store().closeDialog()
    store().unlock(sahteAnahtar)
    expect(islem).not.toHaveBeenCalled()
  })
})

describe("otomatik kilit", () => {
  it("hareketsizlik süresi dolunca kilitler, dolmadan kilitlemez", () => {
    store().unlock(sahteAnahtar)
    const t0 = store().sonEtkinlik
    expect(store().lockIfIdle(t0 + KASA_OTOMATIK_KILIT_MS - 1)).toBe(false)
    expect(store().key).toBe(sahteAnahtar)
    expect(store().lockIfIdle(t0 + KASA_OTOMATIK_KILIT_MS)).toBe(true)
    expect(store().key).toBeNull()
  })

  it("etkinlik (touch) süreyi yeniler", () => {
    store().unlock(sahteAnahtar)
    const t0 = store().sonEtkinlik
    store().touch(t0 + KASA_OTOMATIK_KILIT_MS - 1000)
    expect(store().lockIfIdle(t0 + KASA_OTOMATIK_KILIT_MS + 1000)).toBe(false)
  })

  it("KasaOtomatikKilit bileşeni zamanlayıcıyla kasayı kilitler", () => {
    vi.useFakeTimers()
    try {
      store().unlock(sahteAnahtar)
      render(<KasaOtomatikKilit kontrolAraligiMs={1000} />)
      act(() => vi.advanceTimersByTime(KASA_OTOMATIK_KILIT_MS - 2000))
      expect(store().key).not.toBeNull()
      act(() => vi.advanceTimersByTime(3000))
      expect(store().key).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("hatalı deneme sınırı", () => {
  it(`${MAKS_HATALI_DENEME}. hatalı denemede bekleme başlatır; kilit açılınca sayaç sıfırlanır`, () => {
    for (let i = 1; i < MAKS_HATALI_DENEME; i++) {
      expect(store().hataliDenemeKaydet(1000)).toBe(i)
      expect(store().beklemeBitis).toBeNull()
    }
    store().hataliDenemeKaydet(1000)
    expect(store().beklemeBitis).toBe(1000 + DENEME_BEKLEME_MS)

    store().beklemeyiBitir()
    store().hataliDenemeKaydet()
    store().unlock(sahteAnahtar)
    expect(store().hataliDeneme).toBe(0)
  })
})
