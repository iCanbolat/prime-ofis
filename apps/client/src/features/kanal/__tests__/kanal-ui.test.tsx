import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("Ayarlar → Kanallar", () => {
  it("yönetici WhatsApp Business'ı yapılandırır; anahtar yalnızca son 4 haneyle görünür", async () => {
    const { user } = renderRoute("/ayarlar/kanallar", {
      as: TEST_USERS.yonetici,
    })
    const wa = (await screen.findByText("WhatsApp Business")).closest(
      "[data-slot=card]"
    ) as HTMLElement
    expect(within(wa).getByText("Yapılandırılmadı")).toBeInTheDocument()
    await user.click(within(wa).getByRole("button", { name: "Yapılandır" }))

    const dialog = await screen.findByRole("dialog", {
      name: "WhatsApp Business",
    })
    await user.type(
      within(dialog).getByLabelText("Telefon numarası kimliği"),
      "109876543210"
    )
    await user.type(
      within(dialog).getByLabelText("İşletme hesabı kimliği (WABA)"),
      "208765432109"
    )
    await user.type(
      within(dialog).getByLabelText("Görünen numara"),
      "+90 216 345 67 89"
    )
    await user.type(
      within(dialog).getByLabelText("Kalıcı erişim anahtarı"),
      "EAAG-anahtar-Zx81"
    )
    await user.type(
      within(dialog).getByLabelText("Borç hatırlatma"),
      "borc_hatirlatma_v1"
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    await waitFor(() =>
      expect(within(wa).getByText("Bağlı")).toBeInTheDocument()
    )
    expect(within(wa).getByText("••••Zx81")).toBeInTheDocument()
    expect(within(wa).getByText("1/5 eşlendi")).toBeInTheDocument()
    expect(db.kanal.find("WHATSAPP")).toMatchObject({
      sablonlar: { BORC_HATIRLATMA: "borc_hatirlatma_v1" },
    })
  })

  it("personel Kanallar sekmesini görmez, Bildirimlerim'de tercih değiştirir", async () => {
    const { user } = renderRoute("/ayarlar/bildirimler", {
      as: TEST_USERS.personel,
    })
    const nav = await screen.findByRole("navigation", {
      name: "Ayarlar bölümleri",
    })
    expect(
      within(nav).queryByRole("link", { name: "Kanallar" })
    ).not.toBeInTheDocument()

    const kutu = await screen.findByRole("checkbox", {
      name: "Görev — E-posta",
    })
    expect(kutu).not.toBeChecked()
    // Telegram bot yapılandırılmadığı için seçilemez
    expect(
      screen.getByRole("checkbox", { name: "Görev — Telegram" })
    ).toHaveAttribute("aria-disabled", "true")
    await user.click(kutu)
    await waitFor(() =>
      expect(db.bildirimTercihi.find("p_2")?.kanallar.gorev).toEqual(["EPOSTA"])
    )
  })
})

describe("Mükellefe gönderim", () => {
  it("evrak talebi e-posta kanalıyla sunucudan gider; SMS düğmesi yok", async () => {
    const { user } = renderRoute("/evrak-talepleri?talep=e_aktif", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog")
    await user.click(
      await within(panel).findByRole("button", {
        name: /gönder/i,
        expanded: false,
      })
    )
    expect(within(panel).queryByText(/SMS/)).not.toBeInTheDocument()
    await user.click(
      await within(panel).findByRole("button", { name: "E-posta ile gönder" })
    )
    await waitFor(() =>
      expect(
        db.gonderim.where((g) => g.kaynak === "TALEP" && g.kanal === "EPOSTA")
      ).toHaveLength(1)
    )
    // WhatsApp Business yok → wa.me bağlantısı
    expect(
      within(panel).getByRole("link", { name: "WhatsApp'ta aç" })
    ).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\//))
  })

  it("cari listesinden toplu borç hatırlatma: önizleme → gönder → elle açılacak bağlantılar", async () => {
    const { user } = renderRoute("/tahsilat/cari", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("button", { name: "Borç hatırlat" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Toplu borç hatırlatması",
    })
    const alicilar = await within(dialog).findByRole("list", {
      name: "Alıcılar",
    })
    expect(within(alicilar).getAllByRole("listitem")).toHaveLength(2)
    await user.click(
      within(dialog).getByRole("button", { name: "2 mükellefe gönder" })
    )
    const sonuc = await within(dialog).findByRole("list", {
      name: "Gönderim sonuçları",
    })
    expect(
      within(sonuc).getAllByRole("link", { name: "WhatsApp'ta aç" })
    ).toHaveLength(2)
    expect(
      db.gonderim.where((g) => g.kaynak === "BORC" && g.durum === "ELLE")
    ).toHaveLength(2)
  })

  it("mesaj şablonları dört türü gösterir", async () => {
    renderRoute("/ayarlar/sablonlar", { as: TEST_USERS.yonetici })
    expect(await screen.findByText("Tahakkuk gönderimi")).toBeInTheDocument()
    expect(screen.getByText("Ücret borcu hatırlatması")).toBeInTheDocument()
    expect(
      screen.getByLabelText("Ücret borcu hatırlatması önizleme")
    ).toHaveTextContent("₺24.000,00")
  })
})
