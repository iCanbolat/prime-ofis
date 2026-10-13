import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db, resetDb } from "@/mocks/db"
import { setMockErrorPattern } from "@/mocks/config"
import { TEST_USERS, renderRoute } from "@/test/render"

const satirlar = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1) // başlık satırı

const unvanlar = () =>
  satirlar().map((r) => within(r).getByRole("link").textContent)

describe("Mükellef listesi", () => {
  it("aktif mükellefleri unvana göre sıralı listeler", async () => {
    renderRoute("/mukellefler", { as: TEST_USERS.personel })
    await screen.findByRole("link", { name: "Ali Veli" })
    expect(unvanlar()).toEqual([
      "Ali Veli",
      "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      "Öztürk İnşaat A.Ş.",
    ])
    expect(
      screen.getByText("3 kayıttan 1–3 arası gösteriliyor")
    ).toBeInTheDocument()
  })

  it("tür filtresi URL'e yazılır ve listeyi daraltır", async () => {
    const { router, user } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("link", { name: "Ali Veli" })

    await user.click(screen.getByRole("button", { name: "Ltd. Şti." }))
    await waitFor(() =>
      expect(unvanlar()).toEqual(["Çınar Yazılım San. ve Tic. Ltd. Şti."])
    )
    expect(router.state.location.search).toBe("?tur=LTD")

    // Sekme tek seçimlidir
    await user.click(screen.getByRole("button", { name: "A.Ş." }))
    await waitFor(() => expect(unvanlar()).toEqual(["Öztürk İnşaat A.Ş."]))
    expect(router.state.location.search).toBe("?tur=AS")

    await user.click(screen.getByRole("button", { name: "Tümü" }))
    await waitFor(() => expect(satirlar()).toHaveLength(3))
    expect(router.state.location.search).toBe("")
  })

  it("URL'deki filtrelerle açılır (paylaşılabilir link)", async () => {
    const { user } = renderRoute("/mukellefler?sorumlu=p_2", {
      as: TEST_USERS.personel,
    })
    await waitFor(() =>
      expect(unvanlar()).toEqual(["Ali Veli", "Öztürk İnşaat A.Ş."])
    )
    await user.click(
      screen.getByRole("button", { name: "Filtreler, 1 filtre seçili" })
    )
    const sheet = await screen.findByRole("dialog", { name: "Filtreler" })
    expect(
      within(sheet).getByRole("combobox", { name: "Sorumlu personel" })
    ).toHaveTextContent("Mehmet Kaya")
  })

  it("filtre sheet'i taslakla çalışır; Uygula URL'e yazar", async () => {
    const { router, user } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("link", { name: "Ali Veli" })
    await user.click(screen.getByRole("button", { name: "Filtreler" }))
    const sheet = await screen.findByRole("dialog", { name: "Filtreler" })
    await user.click(within(sheet).getByRole("combobox", { name: "Durum" }))
    await user.click(await screen.findByRole("option", { name: "Pasif" }))
    // Uygulanmadan liste değişmez
    expect(router.state.location.search).toBe("")
    await user.click(within(sheet).getByRole("button", { name: "Uygula" }))
    await waitFor(() =>
      expect(router.state.location.search).toBe("?durum=pasif")
    )
  })

  it("ızgara görünümüne geçilebilir; seçim kartlarda da çalışır", async () => {
    const { user } = renderRoute("/mukellefler", { as: TEST_USERS.personel })
    await screen.findByRole("link", { name: "Ali Veli" })
    await user.click(screen.getByRole("button", { name: "Izgara görünümü" }))
    const kartlar = await screen.findByRole("list", { name: "Mükellefler" })
    expect(within(kartlar).getAllByRole("listitem")).toHaveLength(3)
    await user.click(
      within(kartlar).getByRole("checkbox", { name: "Ali Veli seç" })
    )
    expect(
      screen.getByRole("region", { name: "Toplu işlemler" })
    ).toHaveTextContent("1 mükellef seçildi")
  })

  it("arama gecikmeli olarak URL'e yazılır; Türkçe harf duyarsız eşleşir", async () => {
    const { router, user } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("link", { name: "Ali Veli" })
    await user.type(
      screen.getByRole("searchbox", { name: "Mükellef ara" }),
      "ÖZTÜRK"
    )
    await waitFor(() => expect(unvanlar()).toEqual(["Öztürk İnşaat A.Ş."]))
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
      "ÖZTÜRK"
    )
  })

  it("sonuç yoksa boş durum gösterir; filtreler temizlenebilir", async () => {
    const { user, router } = renderRoute("/mukellefler?durum=pasif", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText("Filtrelere uyan mükellef yok")
    ).toBeInTheDocument()
    await user.click(
      screen.getAllByRole("button", { name: /Filtreleri temizle/ })[0]
    )
    await screen.findByRole("link", { name: "Ali Veli" })
    expect(router.state.location.search).toBe("")
  })

  it("sayfalama: sonraki sayfaya geçer ve URL'i günceller", async () => {
    resetDb() // 40 seed kaydı, 35'i aktif
    const { router, user } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText("35 kayıttan 1–20 arası gösteriliyor")
    ).toBeInTheDocument()
    expect(satirlar()).toHaveLength(20)

    await user.click(screen.getByRole("button", { name: /Sonraki/ }))
    expect(
      await screen.findByText("35 kayıttan 21–35 arası gösteriliyor")
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("?sayfa=2")
    expect(screen.getByRole("button", { name: /Sonraki/ })).toBeDisabled()
  })

  it("unvan başlığına tıklayınca sıralama tersine döner", async () => {
    const { user, router } = renderRoute("/mukellefler", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("link", { name: "Ali Veli" })
    await user.click(
      screen.getByRole("button", { name: "Unvan sütununa göre sırala" })
    )
    await waitFor(() => expect(unvanlar()[0]).toBe("Öztürk İnşaat A.Ş."))
    expect(router.state.location.search).toBe("?yon=desc")
  })

  it("seçilen mükelleflere toplu sorumlu atar", async () => {
    const { user } = renderRoute("/mukellefler", { as: TEST_USERS.yonetici })
    await screen.findByRole("link", { name: "Ali Veli" })

    await user.click(screen.getByRole("checkbox", { name: "Ali Veli seç" }))
    await user.click(
      screen.getByRole("checkbox", { name: "Öztürk İnşaat A.Ş. seç" })
    )
    const bar = screen.getByRole("region", { name: "Toplu işlemler" })
    expect(within(bar).getByText("2 mükellef seçildi")).toBeInTheDocument()

    await user.click(
      within(bar).getByRole("combobox", { name: "Atanacak sorumlu" })
    )
    await user.click(await screen.findByRole("option", { name: /Emre Şahin/ }))
    await user.click(within(bar).getByRole("button", { name: "Sorumlu ata" }))

    expect(
      await screen.findByText("2 mükellefin sorumlusu güncellendi")
    ).toBeInTheDocument()
    expect(db.mukellef.find("m_sahis")?.sorumluPersonelId).toBe("p_4")
    expect(db.mukellef.find("m_as")?.sorumluPersonelId).toBe("p_4")
    expect(
      screen.queryByRole("region", { name: "Toplu işlemler" })
    ).not.toBeInTheDocument()
  })

  it("API hatasında hata durumu gösterir", async () => {
    setMockErrorPattern("/api/mukellefler")
    renderRoute("/mukellefler", { as: TEST_USERS.personel })
    expect(await screen.findByText("Veriler yüklenemedi")).toBeInTheDocument()
  })
})
