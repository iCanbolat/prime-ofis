import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { mockDogrulamaKodu } from "@prime/mock-data/kamu/mock-adapter"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

const borcSorgusu = () =>
  db.borcSorgusu.insert({
    id: "m_ltd:GIB",
    mukellefId: "m_ltd",
    kurum: "GIB",
    kalemler: [
      {
        tur: "Katma Değer Vergisi",
        yukumlulukTip: "KDV",
        donem: "2026-07",
        vade: "2026-08-28",
        asil: 10_000,
        gecikme: 375.5,
      },
    ],
    sorguTarihi: new Date(2026, 8, 23, 3, 0).toISOString(),
    sorgulayanId: "sistem",
  })

describe("Borç ve levha", () => {
  it("vadesi geçmiş borç uyarılır; detay panelinde kalemler ve erişim durumu görünür", async () => {
    borcSorgusu()
    const { router, user } = renderRoute("/borc-levha", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText(
        /1 mükellefin ₺10\.375,50 vadesi geçmiş vergi borcu/
      )
    ).toBeInTheDocument()
    const tablo = await screen.findByRole("table", { name: "Vergi borcu" })
    const satir = within(tablo)
      .getByRole("button", { name: "Çınar Yazılım San. ve Tic. Ltd. Şti." })
      .closest("tr")!
    expect(satir).toHaveTextContent("vadesi geçmiş")
    // m_as'ın GİB girişi hatalı: sorgulanamaz, ayrıntıya yönlendirilir
    expect(
      within(tablo)
        .getByRole("button", { name: "Öztürk İnşaat A.Ş." })
        .closest("tr")
    ).toHaveTextContent("Giriş başarısız")

    await user.click(
      within(satir).getByRole("button", {
        name: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      })
    )
    expect(router.state.location.search).toBe("?borc=m_ltd")
    const panel = await screen.findByRole("dialog", {
      name: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
    })
    const kalemler = within(panel).getByRole("table", {
      name: "Vergi borcu kalemleri",
    })
    expect(kalemler).toHaveTextContent("Vadesi geçti")
    expect(kalemler).toHaveTextContent("tahakkuku içe aktarılmamış")
  })

  it("sorguda doğrulama çıkarsa pencere açılır; personel kodu girince sorgu tamamlanır", async () => {
    db.tebligatErisim.update("te_ltd", { kullaniciKodu: "dogrulama01" })
    const { user } = renderRoute("/borc-levha", { as: TEST_USERS.personel })
    const tablo = await screen.findByRole("table", { name: "Vergi borcu" })
    await user.click(
      within(tablo).getByRole("button", {
        name: "Çınar Yazılım San. ve Tic. Ltd. Şti. vergi borcu sorgula",
      })
    )
    const pencere = await screen.findByRole("dialog", {
      name: "Doğrulama kodu gerekiyor",
    })
    expect(
      within(pencere).getByRole("img", { name: "GİB doğrulama görseli" })
    ).toBeInTheDocument()

    const kod = mockDogrulamaKodu(db.kamuDogrulama.all()[0]!.oturumId)
    await user.type(within(pencere).getByLabelText("Görseldeki kod"), kod)
    await user.click(within(pencere).getByRole("button", { name: "Doğrula" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Doğrulama kodu gerekiyor" })
      ).not.toBeInTheDocument()
    )
    expect(db.kamuDogrulama.count()).toBe(0)
    expect(db.borcSorgusu.find("m_ltd:GIB")).toBeDefined()
  })

  it("mükellef kartında levha alınır ve borcu yoktur yazısı istenir", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/borc", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("button", { name: "GİB'den al" }))
    expect(
      await screen.findByRole("list", { name: "Vergi levhaları" })
    ).toHaveTextContent("2025")
    expect(
      db.arsiv.count(
        (d) => d.mukellefId === "m_ltd" && d.kategori === "VERGI_LEVHASI"
      )
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole("button", { name: "Yazı iste" }))
    const pencere = await screen.findByRole("dialog", {
      name: "Borcu yoktur yazısı iste",
    })
    await user.click(within(pencere).getByRole("button", { name: "Talep et" }))
    expect(
      await screen.findByRole("list", { name: "Borcu yoktur talepleri" })
    ).toHaveTextContent("Hazırlanıyor")
  })

  it("dashboard dikkat kartında vadesi geçmiş borç satırı", async () => {
    borcSorgusu()
    renderRoute("/", { as: TEST_USERS.personel })
    const satir = await screen.findByRole("link", {
      name: /Vadesi geçmiş vergi borcu/,
    })
    expect(satir).toHaveAttribute(
      "href",
      "/borc-levha?sekme=vergi&kapsam=vadesiGecmis"
    )
  })
})
