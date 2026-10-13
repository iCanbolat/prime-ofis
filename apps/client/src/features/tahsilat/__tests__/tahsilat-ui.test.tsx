import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

// SheetJS jsdom'da çalıştırılmaz; ayrıştırma mantığı birim testlerinde
const { tabloSatirlari } = vi.hoisted(() => ({
  tabloSatirlari: vi.fn<(f: File) => Promise<unknown[][]>>(),
}))
vi.mock("@/features/ice-aktarim/dosya-oku", () => ({
  pdfMetni: vi.fn(),
  tabloSatirlari,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("Tahsilat", () => {
  it("mükellef sekmesinde ödeme alınır, bakiye düşer", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/tahsilat", {
      as: TEST_USERS.personel,
    })
    const ozet = await screen.findByRole("region", { name: "Cari özet" })
    expect(within(ozet).getAllByText(/20\.000,00/)).not.toHaveLength(0)
    expect(within(ozet).getByText(/gün gecikmiş/)).toBeInTheDocument()
    // Personel ücret tanımlayamaz
    expect(
      screen.queryByRole("button", { name: "Ücreti düzenle" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Ödeme al" }))
    const dialog = await screen.findByRole("dialog", { name: "Ödeme al" })
    const tutar = await within(dialog).findByLabelText("Tutar (TL)")
    expect(tutar).toHaveValue(20_000)
    await user.clear(tutar)
    await user.type(tutar, "10000")
    expect(within(dialog).getByText("Kapanır")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Ödeme al" })
      ).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(within(ozet).getAllByText(/10\.000,00/)).not.toHaveLength(0)
    )
    const odeme = db.cari.where(
      (h) => h.tip === "ODEME" && h.tarih === "2026-09-23"
    )
    expect(odeme[0]?.kapatmalar).toEqual([{ borcId: "ch_2", tutar: 10_000 }])
  })

  it("yönetici aylık ücret tanımlar; eksik aylar borçlandırılır", async () => {
    const { user } = renderRoute("/mukellefler/m_sahis/tahsilat", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      await screen.findByRole("button", { name: "Aylık ücret tanımla" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Aylık ücret" })
    await user.type(within(dialog).getByLabelText("Aylık brüt (TL)"), "4000")
    await user.click(within(dialog).getByRole("checkbox", { name: /stopaj/ }))
    expect(within(dialog).getByLabelText("Tutar özeti")).toHaveTextContent(
      /4\.800,00/
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    await waitFor(() =>
      expect(db.mukellef.find("m_sahis")?.ucret).toMatchObject({
        aylikBrut: 4000,
        stopajVar: false,
        baslangicDonem: "2026-09",
      })
    )
    const tablo = await screen.findByRole("table", {
      name: "Cari hesap ekstresi",
    })
    expect(
      await within(tablo).findByText("Eylül 2026 hizmet bedeli")
    ).toBeInTheDocument()
  })

  it("cari listesinde geciken filtresi URL'e yazılır, satırdan ekstre açılır", async () => {
    const { router, user } = renderRoute("/tahsilat/cari", {
      as: TEST_USERS.personel,
    })
    const tablo = await screen.findByRole("table", { name: "Cari hesaplar" })
    await waitFor(() =>
      expect(within(tablo).getAllByRole("row")).toHaveLength(4)
    )
    await user.click(screen.getByRole("button", { name: "Geciken" }))
    expect(router.state.location.search).toBe("?geciken=true")
    await waitFor(() =>
      expect(within(tablo).getAllByRole("row")).toHaveLength(3)
    )

    await user.click(
      within(tablo).getByRole("button", { name: "Öztürk İnşaat A.Ş." })
    )
    const panel = await screen.findByRole("dialog", {
      name: "Öztürk İnşaat A.Ş.",
    })
    expect(
      await within(panel).findByText("Ticaret sicil tadil tescili")
    ).toBeInTheDocument()
    expect(router.state.location.search).toContain("mukellef=m_as")
  })

  it("özet sayfası KPI'ları ve bekleyenleri gösterir", async () => {
    renderRoute("/tahsilat", { as: TEST_USERS.personel })
    const ozet = await screen.findByRole("region", { name: "Tahsilat özeti" })
    expect(within(ozet).getByText("₺25.000,00")).toBeInTheDocument()
    const liste = screen
      .getByText("En uzun süredir bekleyenler")
      .closest("[data-slot=card]")!
    expect(
      within(liste as HTMLElement).getByText("Öztürk İnşaat A.Ş.")
    ).toBeInTheDocument()
  })

  it("İVD kesinti listesi yüklenir ve karşılaştırılır", async () => {
    tabloSatirlari.mockResolvedValue([
      ["VKN", "Unvan", "Dönem", "Matrah", "Kesinti"],
      ["0174520662", "Çınar", "2026/07", "10.000,00", "2.000,00"],
      ["9358005601", "Öztürk", "2026/08", "2.500,00", "500,00"],
    ])
    const { user } = renderRoute("/tahsilat/kesinti", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText("Karşılaştırılacak liste yok")
    ).toBeInTheDocument()
    await user.upload(
      screen.getByLabelText("Dosya seç"),
      new File(["x"], "kesinti.xlsx")
    )
    expect(await screen.findByText("kesinti.xlsx")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "İçe aktar" }))
    const tablo = await screen.findByRole("table", {
      name: "Kesinti karşılaştırması",
    })
    expect(within(tablo).getAllByText("Eşleşti")).not.toHaveLength(0)
    expect(within(tablo).getAllByText("Tahsilatta yok")).not.toHaveLength(0)
    expect(db.kesinti.all()).toHaveLength(2)
  })
})
