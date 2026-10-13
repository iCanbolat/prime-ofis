import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

// Excel üretimi ayrı birim testinde; burada yalnızca indirmenin tetiklendiği doğrulanır
const { lucaExcelOlustur, dosyaIndir } = vi.hoisted(() => ({
  lucaExcelOlustur: vi.fn(async () => new Blob(["xlsx"])),
  dosyaIndir: vi.fn(),
}))
vi.mock("@/features/fis-aktarimi/luca-excel", () => ({ lucaExcelOlustur }))
vi.mock("@/lib/dosya", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/dosya")>()),
  dosyaIndir,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("Fiş aktarımı", () => {
  it("taslak ekstrede eksik hesabı doldurup onaylar", async () => {
    const { user, router } = renderRoute("/fis-aktarimi", {
      as: TEST_USERS.personel,
    })
    const tablo = await screen.findByRole("table", { name: "Taslak fişler" })
    expect(within(tablo).getAllByRole("row")).toHaveLength(3)

    await user.click(
      within(tablo).getByRole("button", { name: /Garanti BBVA ekstresi/ })
    )
    expect(router.state.location.search).toBe("?fis=mf_ekstre")
    const sheet = await screen.findByRole("dialog")
    const onayla = await within(sheet).findByRole("button", { name: "Onayla" })
    expect(onayla).toBeDisabled()
    expect(
      within(sheet).getByRole("list", { name: "Onayı engelleyen hatalar" })
    ).toHaveTextContent("1 satırda hesap kodu yok")

    await user.type(
      within(sheet).getByLabelText("2. satır hesap kodu"),
      "361.01"
    )
    expect(
      within(sheet).queryByRole("list", { name: "Onayı engelleyen hatalar" })
    ).toBeNull()
    await user.click(onayla)

    await waitFor(() =>
      expect(db.fis.find("mf_ekstre")?.durum).toBe("ONAYLANDI")
    )
    expect(db.fis.find("mf_ekstre")?.satirlar[1]?.hesapKodu).toBe("361.01")
    expect(db.fisHesapAyari.find("m_as")?.eslemeler).toEqual([
      { anahtar: "SGK PRİM", hesapKodu: "361.01" },
    ])
  })

  it("borç ve alacak farkını canlı gösterir", async () => {
    const { user } = renderRoute("/fis-aktarimi/taslaklar?fis=mf_taslak", {
      as: TEST_USERS.personel,
    })
    const sheet = await screen.findByRole("dialog")
    const borc = await within(sheet).findByLabelText("1. satır borç")
    expect(within(sheet).getByRole("status")).toHaveTextContent(
      "Borç ve alacak eşit"
    )
    await user.clear(borc)
    await user.type(borc, "1.100,50")
    expect(within(sheet).getByRole("status")).toHaveTextContent(/Fark: ₺100,50/)
    expect(within(sheet).getByRole("button", { name: "Onayla" })).toBeDisabled()
  })

  it("aktarıma hazır fişleri Luca Excel'i olarak indirir", async () => {
    const { user } = renderRoute("/fis-aktarimi/hazir", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("table", { name: /aktarıma hazır fişleri/ })
    await user.click(screen.getByRole("button", { name: "Luca Excel'i indir" }))

    await waitFor(() => expect(dosyaIndir).toHaveBeenCalledTimes(1))
    expect(dosyaIndir.mock.calls[0]![1]).toMatch(/^Luca_.+\.xlsx$/)
    expect(lucaExcelOlustur).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "mf_hazir", durum: "AKTARILDI" })],
      expect.objectContaining({ baslangicFisNo: 1 })
    )
    expect(
      await screen.findByText("Aktarıma hazır fiş yok")
    ).toBeInTheDocument()
    expect(db.fis.find("mf_hazir")?.durum).toBe("AKTARILDI")
  })

  it("işletme defterli mükellefin kartında desteklenmediği söylenir", async () => {
    renderRoute("/mukellefler/m_sahis/fis-aktarimi", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText("Şimdilik yalnızca bilanço esası")
    ).toBeInTheDocument()
  })
})
