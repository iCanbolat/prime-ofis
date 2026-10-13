import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { fixtureSifresi, kasayiAc } from "@/test/kasa"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("e-Tebligat", () => {
  it("liste kalan günü gösterir; detayda süre çizelgesi ve göreve dönüştürme", async () => {
    const { router, user } = renderRoute("/tebligat", {
      as: TEST_USERS.personel,
    })
    const tablo = await screen.findByRole("table", { name: "e-Tebligatlar" })
    expect(within(tablo).getByText("2 gün kaldı")).toBeInTheDocument()
    expect(
      screen.getByText(/1 tebligatın süresi 3 gün içinde doluyor/)
    ).toBeInTheDocument()
    // Kenar çubuğu: 1 açık tebligat
    expect(
      await screen.findByLabelText("1 açık e-Tebligat")
    ).toBeInTheDocument()

    await user.click(
      within(tablo).getAllByRole("button", { name: "Ödeme emri" })[0]!
    )
    expect(router.state.location.search).toBe("?tebligat=tb_acil")
    const panel = await screen.findByRole("dialog", { name: "Ödeme emri" })
    const cizelge = within(panel).getByRole("list", { name: "Süre çizelgesi" })
    expect(cizelge).toHaveTextContent("10.09.2026")
    expect(cizelge).toHaveTextContent("25.09.2026")

    await user.click(
      within(panel).getByRole("button", { name: "Göreve dönüştür" })
    )
    expect(
      await within(panel).findByRole("button", { name: "Göreve git" })
    ).toBeInTheDocument()
    expect(db.gorev.where((g) => g.sonTarih === "2026-09-25")).toHaveLength(1)
  })

  it("sorunlu GİB erişimleri uyarılır; panelden şifre güncellenir", async () => {
    const { router, user } = renderRoute("/tebligat", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText(
        "1 mükellefin GİB girişi başarısız, 1 mükellefin GİB erişimi tanımlı değil"
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Erişimleri düzenle" }))
    expect(router.state.location.search).toBe("?erisim=")
    const panel = await screen.findByRole("dialog", {
      name: "GİB erişim durumu",
    })
    const hatali = await within(panel).findByRole("region", {
      name: "Giriş başarısız",
    })
    expect(hatali).toHaveTextContent("Öztürk İnşaat")
    await user.click(
      within(hatali).getByRole("button", { name: "Şifreyi güncelle" })
    )
    const form = await screen.findByRole("dialog", {
      name: "GİB e-Tebligat erişimi",
    })
    await user.type(within(form).getByLabelText("Şifre"), "yeni-sifre")
    await user.click(within(form).getByRole("button", { name: "Kaydet" }))
    await waitFor(() =>
      expect(db.tebligatErisim.find("te_as")).toMatchObject({
        durum: "AKTIF",
        sifreIpucu: "ifre",
      })
    )
  })

  it("mükellef kartında erişim tanımlanır", async () => {
    const { user } = renderRoute("/mukellefler/m_sahis/tebligat", {
      as: TEST_USERS.personel,
    })
    expect(await screen.findByText("Tanımlı değil")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Erişim tanımla" }))
    const form = await screen.findByRole("dialog", {
      name: "GİB e-Tebligat erişimi",
    })
    expect(within(form).getByLabelText(/İVD kullanıcı kodu/)).toHaveValue(
      "10000000146"
    )
    await user.type(within(form).getByLabelText("Şifre"), "hatali")
    await user.click(within(form).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(form).findByText(/kullanıcı kodu veya şifre hatalı/)
    ).toBeInTheDocument()
    await user.clear(within(form).getByLabelText("Şifre"))
    await user.type(within(form).getByLabelText("Şifre"), "dogru-sifre")
    await user.click(within(form).getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText("Taranıyor")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Şimdi tara" })
    ).toBeInTheDocument()
  })

  it("mükellef kartında yalnızca o mükellefin tebligatları", async () => {
    renderRoute("/mukellefler/m_as/tebligat", { as: TEST_USERS.personel })
    const tablo = await screen.findByRole("table", { name: "e-Tebligatlar" })
    expect(within(tablo).getAllByRole("row")).toHaveLength(2)
    expect(within(tablo).getByText("İzaha davet")).toBeInTheDocument()
  })

  it("kasadaki İnteraktif VD şifresi erişim formundan aktarılır ve kasa erişim geçmişine yazılır", async () => {
    await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_sahis/tebligat", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("button", { name: "Erişim tanımla" })
    )
    const form = await screen.findByRole("dialog", {
      name: "GİB e-Tebligat erişimi",
    })
    await user.click(
      await within(form).findByRole("button", {
        name: "Kasadaki şifreyi kullan",
      })
    )
    const kasa = db.credential.where(
      (c) => c.mukellefId === "m_sahis" && c.sistem === "IVD"
    )[0]!
    await waitFor(() =>
      expect(
        db.tebligatErisim.where((e) => e.mukellefId === "m_sahis")[0]
      ).toMatchObject({
        durum: "AKTIF",
        kullaniciKodu: kasa.kullaniciAdi,
        sifreIpucu: fixtureSifresi("m_sahis", "IVD").sifre.slice(-4),
        kasaKaynagi: { credentialId: kasa.id },
      })
    )
    expect(
      db.aktivite.where(
        (a) => a.eylem === "SIFRE_TEBLIGATA_AKTARILDI" && a.hedefId === kasa.id
      )
    ).toHaveLength(1)
    expect(await screen.findByText(/\(kasadan\)/)).toBeInTheDocument()
  })

  it("kasada İnteraktif VD şifresi değişince e-Tebligat taraması da güncellenebilir", async () => {
    await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_ltd/sifreler", {
      as: TEST_USERS.personel,
    })
    const ivd = await screen.findByRole("region", {
      name: "İnteraktif VD şifresi",
    })
    expect(
      await within(ivd).findByText(/ayrı girilmiş bir şifre kullanıyor/)
    ).toBeInTheDocument()
    await user.click(
      within(ivd).getByRole("button", {
        name: "İnteraktif VD şifresini düzenle",
      })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "İnteraktif VD şifresi düzenle",
    })
    const sifre = within(dialog).getByLabelText("Şifre")
    await user.clear(sifre)
    await user.type(sifre, "YeniIvd#77")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    const soru = await screen.findByRole("dialog", {
      name: "e-Tebligat taraması da bu şifreyi kullansın mı?",
    })
    expect(soru).toHaveTextContent("••••abcd")
    await user.click(
      within(soru).getByRole("button", { name: "Evet, güncelle" })
    )
    await waitFor(() =>
      expect(db.tebligatErisim.find("te_ltd")).toMatchObject({
        sifreIpucu: "d#77",
        kasaKaynagi: { credentialId: expect.any(String) },
      })
    )
    expect(
      await within(ivd).findByText("e-Tebligat taraması bu şifreyi kullanıyor.")
    ).toBeInTheDocument()
  })
})
