import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("e-Belge — faturalar", () => {
  it("/e-belge e-Fatura sekmesine yönlenir; yön filtresi URL'e yazılır", async () => {
    const { router, user } = renderRoute("/e-belge", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("button", {
      name: "DNZ2026000000412 faturasını aç",
    })
    const tablo = screen.getByRole("table", { name: "Faturalar" })
    expect(router.state.location.pathname).toBe("/e-belge/e-fatura")
    const satir = (belgeNo: string) =>
      within(tablo)
        .getByRole("button", { name: `${belgeNo} faturasını aç` })
        .closest("tr")!
    expect(
      within(satir("DNZ2026000000412")).getAllByText("Yanıt bekliyor · 6 gün")
    ).not.toHaveLength(0)
    expect(
      within(satir("CNR2026000000057")).getAllByText("İşleniyor")
    ).not.toHaveLength(0)

    await user.click(screen.getByRole("button", { name: "Giden" }))
    expect(router.state.location.search).toBe("?yon=GIDEN")
    await waitFor(() =>
      expect(within(tablo).getAllByRole("row")).toHaveLength(4)
    )
    // Giden faturada yanıt filtresi gösterilmez
    expect(screen.queryByLabelText("Yanıt durumu")).not.toBeInTheDocument()
  })

  it("kenar çubuğunda ve sekmede yanıt bekleyen fatura sayısı görünür", async () => {
    renderRoute("/e-belge/e-arsiv", { as: TEST_USERS.personel })
    // Kenar çubuğu rozeti + e-Fatura sekmesi rozeti
    await waitFor(() =>
      expect(screen.getAllByLabelText("2 yanıt bekleyen fatura")).toHaveLength(
        2
      )
    )
  })

  it("ticari yanıt Luca'da verilir; kalemler görünür, arşive kaydet arşiv bağlantısına dönüşür", async () => {
    const { user } = renderRoute("/e-belge/e-fatura?fatura=f_yakin", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", {
      name: "OFS2026000001207",
    })
    expect(
      await within(panel).findByText("Ticari fatura yanıtı bekleniyor")
    ).toBeInTheDocument()
    expect(
      within(panel).getByText("Yanıt bekliyor · 1 gün")
    ).toBeInTheDocument()
    expect(
      within(panel).queryByRole("button", { name: "Reddet" })
    ).not.toBeInTheDocument()
    await within(panel).findByText("Kalemler")

    await user.click(
      within(panel).getByRole("button", { name: "Arşive kaydet" })
    )
    expect(
      await within(panel).findByRole("link", { name: "Arşivde" })
    ).toHaveAttribute("href", "/arsiv?mukellef=m_ltd&kategori=FATURA")
    expect(db.arsiv.where((d) => d.kategori === "FATURA")).toHaveLength(1)
  })
})

describe("e-Belge — bağlantılar ve e-Defter", () => {
  it("yönetici mükellefi Luca firmasına eşler; aynı VKN'li firma önerilir", async () => {
    const { user } = renderRoute("/e-belge/baglantilar", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      await screen.findByRole("button", { name: "Ali Veli Luca'ya bağla" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Luca firmasına eşle",
    })
    expect(
      await within(dialog).findByRole("combobox", { name: "Luca firması" })
    ).toHaveTextContent("Ali Veli")
    await user.click(within(dialog).getByRole("button", { name: "Eşle" }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    const tablo = screen.getByRole("table", { name: "Luca bağlantıları" })
    const satir = within(tablo)
      .getByRole("link", { name: "Ali Veli" })
      .closest("tr")!
    expect(await within(satir).findByText("Bağlı")).toBeInTheDocument()
    expect(within(satir).getByText("Luca firmasına eşli")).toBeInTheDocument()
  })

  it("personel bağlantı kuramaz", async () => {
    renderRoute("/e-belge/baglantilar", { as: TEST_USERS.personel })
    expect(
      await screen.findByText(
        "Bağlantıları yalnızca yönetici kurabilir veya kaldırabilir."
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Luca'ya bağla/ })
    ).not.toBeInTheDocument()
  })

  it("e-Defter matrisi: hücreden berat ayrıntısı açılır", async () => {
    const { user } = renderRoute("/e-belge/e-defter", {
      as: TEST_USERS.personel,
    })
    const hucre = await screen.findByRole("button", {
      name: "Çınar Yazılım San. ve Tic. Ltd. Şti. Temmuz 2026: Hatalı",
    })
    // Bağlantısı hatalı mükellefin yüklenmemiş, son günü geçmiş dönemi
    expect(
      screen.getByRole("button", {
        name: "Öztürk İnşaat A.Ş. Mayıs 2026: Gecikti",
      })
    ).toBeInTheDocument()
    await user.click(hucre)
    const panel = await screen.findByRole("dialog", {
      name: "Temmuz 2026 beratı",
    })
    expect(
      within(panel).getByText(
        "Yevmiye defteri kapanış kaydı ile kebir bakiyeleri tutarsız"
      )
    ).toBeInTheDocument()
  })
})

describe("Mükellef kartı — e-Belge sekmesi", () => {
  it("bağlı mükellefte faturalar ve beratlar listelenir", async () => {
    renderRoute("/mukellefler/m_ltd/e-belge", { as: TEST_USERS.personel })
    expect(await screen.findByText(/Luca firmasına eşli/)).toBeInTheDocument()
    await screen.findByRole("button", {
      name: "CNR2026000000057 faturasını aç",
    })
    const tablo = screen.getByRole("table", { name: "Faturalar" })
    // Mükellef sütunu gizli; yalnızca bu mükellefin 7 e-Faturası (+ başlık)
    expect(within(tablo).getAllByRole("row")).toHaveLength(8)
    // jsdom CSS uygulamaz; sütunun gizleme sınıfı taşıdığı doğrulanır
    expect(
      within(tablo).getByRole("columnheader", { name: "Mükellef" })
    ).toHaveClass("hidden")
    expect(
      await screen.findByRole("table", { name: "e-Defter berat durumları" })
    ).toBeInTheDocument()
  })

  it("bağlantısız mükellefte personele yalnızca bilgi gösterilir", async () => {
    renderRoute("/mukellefler/m_sahis/e-belge", { as: TEST_USERS.personel })
    expect(await screen.findByText("Luca bağlantısı yok")).toBeInTheDocument()
    expect(
      screen.getByText("Bağlantıyı büro yöneticisi kurabilir.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Luca'ya bağla" })
    ).not.toBeInTheDocument()
  })
})

describe("Gösterge paneli — dikkat kartı", () => {
  it("yanıt süresi dolmak üzere olan faturalar ve bağlantı hatası görünür", async () => {
    renderRoute("/", { as: TEST_USERS.yonetici })
    const liste = await screen.findByRole("list", {
      name: "Dikkat gerektirenler",
    })
    expect(
      await within(liste).findByRole("link", {
        name: /Yanıt süresi dolmak üzere/,
      })
    ).toHaveAttribute(
      "href",
      "/e-belge/e-fatura?yon=GELEN&yanitSuresi=yaklasan"
    )
    // Fixture: m_as bağlantısı hatalı
    expect(
      within(liste).getByRole("link", { name: /Luca bağlantı hatası\s*1/ })
    ).toHaveAttribute("href", "/e-belge/baglantilar?durum=HATA")
  })
})

describe("e-Belge — kontör", () => {
  it("bakiye ve mükellef tüketimi görünür; personel alım ekleyemez", async () => {
    renderRoute("/e-belge/kontor", { as: TEST_USERS.personel })
    const bakiye = await screen.findByRole("region", {
      name: "Kontör bakiyesi",
    })
    expect(within(bakiye).getByText("111")).toBeInTheDocument()
    const tablo = screen.getByRole("table", {
      name: "Mükellef bazında kontör tüketimi",
    })
    const satir = within(tablo)
      .getByRole("link", { name: "Çınar Yazılım San. ve Tic. Ltd. Şti." })
      .closest("tr")!
    expect(within(satir).getByText("7")).toBeInTheDocument()
    expect(within(satir).getByText(/7,70/)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kontör alımı ekle" })
    ).not.toBeInTheDocument()
  })

  it("yönetici alım ekler; hediye %20 hesaplanır ve bakiye artar", async () => {
    const { user } = renderRoute("/e-belge/kontor", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      await screen.findByRole("button", { name: "Kontör alımı ekle" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Kontör alımı ekle",
    })
    await user.type(within(dialog).getByLabelText("Paket (kontör)"), "250")
    expect(
      within(dialog).getByText("250 + 50 hediye = 300 kontör")
    ).toBeInTheDocument()
    await user.type(
      within(dialog).getByLabelText("Ödenen tutar (KDV dahil)"),
      "480"
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    const bakiye = screen.getByRole("region", { name: "Kontör bakiyesi" })
    await waitFor(() =>
      expect(within(bakiye).getByText("411")).toBeInTheDocument()
    )
    expect(db.kontor.all()).toHaveLength(2)
  })

  it("kontör azalınca e-Belge üst kısmında uyarı çıkar", async () => {
    db.kontor.update("u_1", { paketAdet: 10, hediyeAdet: 0 })
    renderRoute("/e-belge/e-fatura", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Luca kontörü azalıyor: 1 kaldı")
    ).toBeInTheDocument()
  })
})
