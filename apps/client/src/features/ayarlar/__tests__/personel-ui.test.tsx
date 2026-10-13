import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { DEMO_GIRIS_SIFRESI } from "@prime/mock-data/factories/personel"
import { TEST_USERS, renderRoute } from "@/test/render"

const acPersonel = async () => {
  const r = renderRoute("/ayarlar/personel", { as: TEST_USERS.yonetici })
  await screen.findByRole("table")
  return r
}

describe("Ayarlar → Personel", () => {
  it("yönetici şifresiyle personel ekler", async () => {
    const { user } = await acPersonel()
    await user.click(screen.getByRole("button", { name: /Personel ekle/ }))
    const dialog = await screen.findByRole("dialog", { name: "Personel ekle" })
    const d = within(dialog)

    await user.type(d.getByLabelText("Ad"), "Can")
    await user.type(d.getByLabelText("Soyad"), "Öz")
    await user.type(
      d.getByLabelText("E-posta"),
      "can.oz@primemusavirlik.com.tr"
    )
    await user.type(d.getByLabelText("Şifre"), "ilkSifre123")
    await user.type(d.getByLabelText("Şifre (tekrar)"), "ilkSifre123")

    // Yanlış yönetici şifresi → alanın altında hata, kayıt oluşmaz
    await user.type(d.getByLabelText("Yönetici şifreniz"), "yanlis")
    await user.click(d.getByRole("button", { name: "Ekle" }))
    expect(await d.findByText("Yönetici şifresi hatalı")).toBeInTheDocument()
    expect(db.personel.count()).toBe(4)

    await user.type(d.getByLabelText("Yönetici şifreniz"), DEMO_GIRIS_SIFRESI)
    await user.click(d.getByRole("button", { name: "Ekle" }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(await screen.findByText("Can Öz")).toBeInTheDocument()
    expect(db.personel.count()).toBe(5)
  })

  it("şifreler eşleşmezse gönderilmez", async () => {
    const { user } = await acPersonel()
    await user.click(
      screen.getByRole("button", { name: "Mehmet Kaya işlemleri" })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: /Şifre belirle/ })
    )
    const d = within(
      await screen.findByRole("dialog", { name: "Şifre belirle" })
    )
    await user.type(d.getByLabelText("Yeni şifre"), "yeniSifre99")
    await user.type(d.getByLabelText("Yeni şifre (tekrar)"), "baskaSifre99")
    await user.type(d.getByLabelText("Yönetici şifreniz"), DEMO_GIRIS_SIFRESI)
    await user.click(d.getByRole("button", { name: "Şifreyi kaydet" }))
    expect(await d.findByText("Şifreler eşleşmiyor")).toBeInTheDocument()
  })

  it("kendi satırında silme seçeneği yoktur", async () => {
    const { user } = await acPersonel()
    await user.click(
      screen.getByRole("button", { name: "Ayşe Yılmaz işlemleri" })
    )
    await screen.findByRole("menuitem", { name: /Düzenle/ })
    expect(
      screen.queryByRole("menuitem", { name: /Sil/ })
    ).not.toBeInTheDocument()
  })
})
