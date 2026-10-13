import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { db } from "@/mocks/db"
import { DEMO_GIRIS_SIFRESI } from "@prime/mock-data/factories/personel"
import { setMockErrorPattern } from "@/mocks/config"
import { TEST_USERS, renderRoute } from "@/test/render"

describe("kimlik doğrulama yönlendirmeleri", () => {
  it("oturum yokken korumalı sayfa /login'e yönlendirir", async () => {
    const { router } = renderRoute("/mukellefler?tur=LTD")
    expect(await screen.findByLabelText("E-posta")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/login")
    expect(router.state.location.state).toEqual({
      from: "/mukellefler?tur=LTD",
    })
  })

  it("e-posta ve şifre girilince giriş yapılır ve geldiği sayfaya döner", async () => {
    const { router, user } = renderRoute("/takvim")
    await user.click(await screen.findByRole("button", { name: "Giriş yap" }))
    expect(screen.getByText("Geçerli bir e-posta girin")).toBeInTheDocument()

    await user.type(
      screen.getByLabelText("E-posta"),
      "zeynep.demir@primemusavirlik.com.tr"
    )
    await user.type(screen.getByLabelText("Şifre"), "yanlis-sifre")
    await user.click(screen.getByRole("button", { name: "Giriş yap" }))
    expect(
      await screen.findByText("Kullanıcı veya şifre hatalı")
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/login")

    await user.type(screen.getByLabelText("Şifre"), DEMO_GIRIS_SIFRESI)
    await user.click(screen.getByRole("button", { name: "Giriş yap" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/takvim"))
    expect(useAuthStore.getState().user?.id).toBe("p_3")
    expect(
      await screen.findByRole("heading", { name: "Vergi ve bildirim takvimi" })
    ).toBeInTheDocument()
    expect(
      db.aktivite.where((a) => a.eylem === "GIRIS" && a.aktorId === "p_3")
    ).toHaveLength(1)
  })

  it("giriş yapmış kullanıcı /login'e gelirse ana sayfaya gider", async () => {
    const { router } = renderRoute("/login", { as: TEST_USERS.personel })
    await waitFor(() => expect(router.state.location.pathname).toBe("/"))
  })

  it("pasif kullanıcı giriş yapamaz", async () => {
    db.personel.update("p_4", { aktif: false })
    const { user } = renderRoute("/login")
    await user.type(
      await screen.findByLabelText("E-posta"),
      "emre.sahin@primemusavirlik.com.tr"
    )
    await user.type(screen.getByLabelText("Şifre"), DEMO_GIRIS_SIFRESI)
    await user.click(screen.getByRole("button", { name: "Giriş yap" }))
    expect(
      await screen.findByText("Bu kullanıcı pasif durumda")
    ).toBeInTheDocument()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it("oturum sunucuda düşmüşse (401) yerel oturum temizlenir, giriş ekranına dönülür", async () => {
    // Mock'ta sunucu oturumunun düşmesi: pasif personelin /auth/me isteği 401 döner
    db.personel.update(TEST_USERS.personel.id, { aktif: false })
    const { router } = renderRoute("/takvim", { as: TEST_USERS.personel })
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    expect(useAuthStore.getState().user).toBeNull()
    expect(router.state.location.state).toEqual({ from: "/takvim" })
  })

  it("çıkış yapınca oturum kapanır ve /login'e dönülür", async () => {
    const { router, user } = renderRoute("/", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("button", { name: "Kullanıcı menüsü" })
    )
    await user.click(await screen.findByRole("menuitem", { name: /Çıkış yap/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe("rol bazlı erişim", () => {
  it("personel rolü /ayarlar/personel sayfasını göremez", async () => {
    renderRoute("/ayarlar/personel", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
    const ayarlarNav = screen.getByRole("navigation", {
      name: "Ayarlar bölümleri",
    })
    expect(
      within(ayarlarNav).queryByRole("link", { name: "Personel" })
    ).not.toBeInTheDocument()
    expect(
      within(ayarlarNav).getByRole("link", { name: "Büro" })
    ).toBeInTheDocument()
  })

  it("yönetici /ayarlar/personel sayfasında personel listesini görür", async () => {
    renderRoute("/ayarlar/personel", { as: TEST_USERS.yonetici })
    const table = await screen.findByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(5)
  })

  it("/ayarlar varsayılan olarak Büro sekmesine yönlenir", async () => {
    const { router } = renderRoute("/ayarlar", { as: TEST_USERS.personel })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/ayarlar/buro")
    )
    expect(
      await screen.findByText("Prime Mali Müşavirlik", { selector: "dd" })
    ).toBeInTheDocument()
  })
})

describe("app shell", () => {
  it("bilinmeyen adres 404 sayfası gösterir", async () => {
    renderRoute("/olmayan-sayfa", { as: TEST_USERS.personel })
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument()
  })

  it("sidebar menüsü aktif sayfayı işaretler ve breadcrumb gösterir", async () => {
    renderRoute("/gorevler", { as: TEST_USERS.personel })
    await screen.findByRole("heading", { name: "Görevler" })
    const sidebarLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("data-slot") === "sidebar-menu-button")
    const active = sidebarLinks.filter((el) => el.hasAttribute("data-active"))
    expect(active.map((el) => el.textContent)).toEqual(["Görevler"])
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" })
    expect(within(breadcrumb).getByText("Görevler")).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("⌘K arama paleti açılır, mükellef bulunur ve kartına gidilir", async () => {
    const { router, user } = renderRoute("/", { as: TEST_USERS.personel })
    await screen.findByRole("heading", { name: "Merhaba, Mehmet" })

    await user.keyboard("{Control>}k{/Control}")
    const input = await screen.findByPlaceholderText("Sayfa veya mükellef ara…")
    await user.type(input, "çınar")
    await user.click(
      await screen.findByRole("option", { name: /Çınar Yazılım/ })
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mukellefler/m_ltd")
    )
  })

  it("arama paletinden sayfaya gidilir", async () => {
    const { router, user } = renderRoute("/", { as: TEST_USERS.personel })
    await user.click(await screen.findByRole("button", { name: /Ara…/ }))
    await user.type(
      await screen.findByPlaceholderText("Sayfa veya mükellef ara…"),
      "kanban"
    )
    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/gorevler")
    )
  })

  it("dashboard Yapılacaklar kartını gösterir", async () => {
    renderRoute("/", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("heading", { name: "Merhaba, Mehmet" })
    ).toBeInTheDocument()
    const sekme = await screen.findByRole("tab", { name: /^Bu hafta/ })
    await waitFor(() =>
      expect(within(sekme).getByText(/^\d+$/)).toBeInTheDocument()
    )
  })

  it("API hatasında hata durumu ve tekrar dene butonu gösterir", async () => {
    setMockErrorPattern("/api/takvim")
    const { user } = renderRoute("/", { as: TEST_USERS.personel })
    expect(await screen.findByText("Veriler yüklenemedi")).toBeInTheDocument()

    setMockErrorPattern(null)
    await user.click(screen.getByRole("button", { name: /Tekrar dene/ }))
    expect(
      await screen.findByRole("tab", { name: /^Bu hafta/ })
    ).toBeInTheDocument()
  })
})
