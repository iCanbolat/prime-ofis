import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TEST_USERS, renderRoute } from "@/test/render"

describe("Mükellef kartı", () => {
  it("varsayılan olarak Genel sekmesine yönlenir ve bilgileri gösterir", async () => {
    const { router } = renderRoute("/mukellefler/m_ltd", {
      as: TEST_USERS.personel,
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mukellefler/m_ltd/genel")
    )

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("Zeynep Demir")).toBeInTheDocument()
    expect(await screen.findByText("0533 123 45 67")).toBeInTheDocument()
    expect(screen.getByText("Var (8 çalışan)")).toBeInTheDocument()
    const sekmeler = screen.getByRole("navigation", {
      name: "Mükellef bölümleri",
    })
    expect(
      within(sekmeler).getByRole("link", { name: "Genel" })
    ).toHaveAttribute("aria-current", "page")
  })

  it("breadcrumb mükellef unvanını gösterir", async () => {
    renderRoute("/mukellefler/m_as/genel", { as: TEST_USERS.personel })
    const nav = await screen.findByRole("navigation", { name: "breadcrumb" })
    await waitFor(() =>
      expect(within(nav).getByText("Öztürk İnşaat A.Ş.")).toBeInTheDocument()
    )
    expect(within(nav).getByText("Genel")).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("sekmeler arasında geçer; henüz yapılmamış sekmeler faz bilgisini gösterir", async () => {
    const { router, user } = renderRoute("/mukellefler/m_ltd/genel", {
      as: TEST_USERS.personel,
    })
    const sekmeler = await screen.findByRole("navigation", {
      name: "Mükellef bölümleri",
    })
    await user.click(within(sekmeler).getByRole("link", { name: "Arşiv" }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mukellefler/m_ltd/arsiv")
    )
    expect(
      await screen.findByRole("group", { name: "Kategori filtresi" })
    ).toBeInTheDocument()

    await user.click(within(sekmeler).getByRole("link", { name: "Görevler" }))
    const tablo = await screen.findByRole("table", { name: "Görevler" })
    // m_ltd'nin açık görevleri (tamamlananlar varsayılan olarak gizli)
    expect(within(tablo).getAllByRole("row")).toHaveLength(4)
  })

  it("olmayan mükellef için bulunamadı ekranı gösterir", async () => {
    renderRoute("/mukellefler/yok", { as: TEST_USERS.personel })
    expect(await screen.findByText("Mükellef bulunamadı")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Mükellef listesine dön" })
    ).toHaveAttribute("href", "/mukellefler")
  })

  it("listeden unvana tıklayınca karta gidilir", async () => {
    const { router, user } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("link", { name: "Öztürk İnşaat A.Ş." })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mukellefler/m_as/genel")
    )
  })
})
