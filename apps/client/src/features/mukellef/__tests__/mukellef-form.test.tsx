import { screen, waitFor, within } from "@testing-library/react"
import type { UserEvent } from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

async function adimBasligi(baslik: string) {
  return screen.findByRole("heading", { level: 2, name: baslik })
}

async function ileri(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /İleri/ }))
}

async function yaz(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  await user.type(input, value)
}

describe("Yeni mükellef sihirbazı", () => {
  it("Şahıs mükellefi dört adımda oluşturur ve kartına yönlendirir", async () => {
    const { router, user } = renderRoute("/mukellefler/yeni", {
      as: TEST_USERS.personel,
    })
    await adimBasligi("Tür ve kimlik")

    await user.click(screen.getByRole("radio", { name: /Şahıs/ }))
    expect(screen.queryByLabelText("VKN")).not.toBeInTheDocument()
    await yaz(user, "Ad soyad", "Selin Aksoy")
    await yaz(user, "TCKN", "60465985014")
    await yaz(user, "Vergi dairesi", "Kadıköy")
    await ileri(user)

    await adimBasligi("İletişim")
    await yaz(user, "Telefon (WhatsApp)", "0532 111 22 33")
    await yaz(user, "İlçe", "Moda")
    await ileri(user)

    await adimBasligi("Vergi yükümlülükleri")
    await yaz(user, "NACE kodu", "96.02.01")
    await yaz(user, "Faaliyet konusu", "Kuaför")
    await ileri(user)

    await adimBasligi("Sorumlu ve etiketler")
    // Varsayılan sorumlu formu açan personel
    expect(
      screen.getByRole("combobox", { name: "Sorumlu personel" })
    ).toHaveTextContent("Mehmet Kaya")
    await user.click(screen.getByRole("button", { name: "Yeni Müşteri" }))
    await user.click(screen.getByRole("button", { name: "Mükellefi kaydet" }))

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/mukellefler\/m_[\w]+\/genel$/
      )
    )
    expect(
      await screen.findByRole("heading", { level: 1, name: "Selin Aksoy" })
    ).toBeInTheDocument()

    const kayit = db.mukellef.where((m) => m.unvan === "Selin Aksoy")[0]
    expect(kayit).toMatchObject({
      tur: "SAHIS",
      tckn: "60465985014",
      telefon: "05321112233",
      sorumluPersonelId: "p_2",
      etiketler: ["Yeni Müşteri"],
    })
    expect(kayit.vkn).toBeUndefined()
  })

  it("geçersiz TCKN ile sonraki adıma geçilmez", async () => {
    const { user } = renderRoute("/mukellefler/yeni", {
      as: TEST_USERS.personel,
    })
    await adimBasligi("Tür ve kimlik")
    await user.click(screen.getByRole("radio", { name: /Şahıs/ }))
    await yaz(user, "Ad soyad", "Test Kişi")
    await yaz(user, "TCKN", "10000000147")
    await yaz(user, "Vergi dairesi", "Kadıköy")
    await ileri(user)

    expect(await screen.findByText(/Geçersiz TCKN/)).toBeInTheDocument()
    expect(screen.getByLabelText("TCKN")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(
      screen.getByRole("heading", { level: 2, name: "Tür ve kimlik" })
    ).toBeInTheDocument()
  })

  it("boş form ilerletilince zorunlu alan hataları görünür", async () => {
    const { user } = renderRoute("/mukellefler/yeni", {
      as: TEST_USERS.personel,
    })
    await adimBasligi("Tür ve kimlik")
    await ileri(user)
    expect(
      await screen.findByText("Unvan en az 2 karakter olmalıdır")
    ).toBeInTheDocument()
    expect(screen.getByText("VKN zorunludur")).toBeInTheDocument()
  })

  it("mevcut VKN ile kayıtta sunucu hatası ilk adımda VKN alanında gösterilir", async () => {
    const { user } = renderRoute("/mukellefler/yeni", {
      as: TEST_USERS.personel,
    })
    await adimBasligi("Tür ve kimlik")
    await yaz(user, "Unvan", "Kopya Ltd. Şti.")
    await yaz(user, "VKN", "0174520662") // m_ltd'nin VKN'si
    await yaz(user, "Vergi dairesi", "Kozyatağı")
    await ileri(user)
    await adimBasligi("İletişim")
    await yaz(user, "Telefon (WhatsApp)", "05321112233")
    await yaz(user, "İlçe", "Ataşehir")
    await ileri(user)
    await adimBasligi("Vergi yükümlülükleri")
    await yaz(user, "NACE kodu", "62.01.01")
    await yaz(user, "Faaliyet konusu", "Yazılım")
    await ileri(user)
    await adimBasligi("Sorumlu ve etiketler")
    await user.click(screen.getByRole("button", { name: "Mükellefi kaydet" }))

    await adimBasligi("Tür ve kimlik")
    const vknHatasi = await screen.findAllByText(
      /Bu VKN ile kayıtlı mükellef var: Çınar Yazılım/
    )
    expect(vknHatasi.length).toBeGreaterThan(0)
    expect(db.mukellef.count()).toBe(3)
  })
})

describe("Mükellef düzenleme", () => {
  it("bilgileri günceller, karta döner ve aktiviteye yazar", async () => {
    const { router, user } = renderRoute("/mukellefler/m_ltd/duzenle", {
      as: TEST_USERS.yonetici,
    })
    await adimBasligi("Tür ve kimlik")
    expect(screen.getByLabelText("VKN")).toHaveValue("0174520662")

    // Düzenlemede adımlar serbestçe gezilebilir
    await user.click(
      screen.getByRole("button", { name: /Vergi yükümlülükleri/ })
    )
    await adimBasligi("Vergi yükümlülükleri")
    await yaz(user, "Çalışan sayısı", "12")

    await user.click(screen.getByRole("button", { name: /Tür ve kimlik/ }))
    await yaz(user, "Unvan", "Çınar Bulut Yazılım Ltd. Şti.")
    await user.click(
      screen.getByRole("button", { name: "Değişiklikleri kaydet" })
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/mukellefler/m_ltd/genel")
    )
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Çınar Bulut Yazılım Ltd. Şti.",
      })
    ).toBeInTheDocument()
    expect(db.mukellef.find("m_ltd")).toMatchObject({
      calisanSayisi: 12,
      unvan: "Çınar Bulut Yazılım Ltd. Şti.",
    })

    const aktivite = await screen.findByRole("list", {
      name: "Aktivite geçmişi",
    })
    expect(
      within(aktivite).getByText(/mükellef bilgilerini güncelledi/)
    ).toBeInTheDocument()
  })
})
