import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

// pdf.js ve SheetJS jsdom'da çalıştırılmaz; ayrıştırma mantığı ayrı birim testlerinde
const { pdfMetni, tabloSatirlari } = vi.hoisted(() => ({
  pdfMetni: vi.fn<(f: File) => Promise<string>>(),
  tabloSatirlari: vi.fn<(f: File) => Promise<unknown[][]>>(),
}))
vi.mock("@/features/ice-aktarim/dosya-oku", () => ({
  pdfMetni,
  tabloSatirlari,
}))

const fis = (vkn: string, donem: string) => `TAHAKKUK FİŞİ
Vergi Kimlik Numarası: ${vkn}
Beyannamenin Türü: KDV1
Vergilendirme Dönemi: ${donem} - ${donem}
Tahakkuk Fişi No: 2026091612345678
0015 KATMA DEĞER VERGİSİ 125.000,00 25.000,00 18.250,50 6.749,50 28/09/2026
TOPLAM 25.000,00 18.250,50 6.749,50`

const pdf = (ad: string) => new File(["%PDF"], ad, { type: "application/pdf" })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  pdfMetni.mockImplementation(async (f) =>
    f.name === "cinar.pdf"
      ? fis("0174520662", "08/2026")
      : f.name === "bilinmeyen.pdf"
        ? fis("2940105481", "08/2026")
        : Promise.reject(new Error("bozuk"))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("İçe aktarım — tahakkuk", () => {
  it("PDF'ler okunur, VKN ile eşleşen içe aktarılır; eşleşmeyen ve bozuk dosya listede kalır", async () => {
    const { user, router } = renderRoute("/ice-aktarim", {
      as: TEST_USERS.personel,
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/ice-aktarim/tahakkuk")
    )
    const girdi = await screen.findByLabelText("Dosya seç")
    await waitFor(() => expect(girdi).toBeEnabled())
    await user.upload(girdi, [
      pdf("cinar.pdf"),
      pdf("bilinmeyen.pdf"),
      pdf("bozuk.pdf"),
    ])

    const liste = await screen.findByRole("list", {
      name: "Okunan tahakkuklar",
    })
    const cinar = within(liste).getByRole("listitem", { name: "cinar.pdf" })
    await waitFor(() =>
      expect(within(cinar).getByLabelText("Dönem")).toHaveValue("2026-08")
    )
    expect(within(cinar).getByLabelText("Ödenecek (₺)")).toHaveValue("6.749,50")
    expect(
      within(cinar).getByText(
        /KDV1 · Tahakkuk no 2026091612345678 · Vade 28\.09\.2026/
      )
    ).toBeInTheDocument()
    expect(
      within(liste).getByText(
        "2940105481 ile kayıtlı aktif mükellef yok; elle seçin"
      )
    ).toBeInTheDocument()
    expect(within(liste).getByText(/PDF okunamadı/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "İçe aktar (1)" }))

    await waitFor(() =>
      expect(
        within(liste).queryByRole("listitem", { name: "cinar.pdf" })
      ).not.toBeInTheDocument()
    )
    expect(within(liste).getAllByRole("listitem")).toHaveLength(2)
    expect(db.takvim.find("m_ltd:KDV:2026-08")?.durum).toBe("ONAYLANDI")
    const tablo = await screen.findByRole("table", {
      name: "İçe aktarılan tahakkuklar",
    })
    expect(
      within(tablo).getByRole("link", {
        name: "Çınar Yazılım San. ve Tic. Ltd. Şti.",
      })
    ).toBeInTheDocument()
    expect(within(tablo).getByText(/6\.749,50/)).toBeInTheDocument()
  })

  it("dönem elle düzeltilebilir; geçersiz biçimde içe aktarım kapalı", async () => {
    const { user } = renderRoute("/ice-aktarim/tahakkuk", {
      as: TEST_USERS.personel,
    })
    // Mükellef listesi yüklenene kadar (VKN eşleştirmesi için) yükleme alanı kapalıdır
    const girdi = await screen.findByLabelText("Dosya seç")
    await waitFor(() => expect(girdi).toBeEnabled())
    await user.upload(girdi, pdf("cinar.pdf"))
    const donem = await screen.findByLabelText("Dönem")
    await waitFor(() => expect(donem).toHaveValue("2026-08"))
    await user.clear(donem)
    await user.type(donem, "2026/08")
    expect(
      screen.getByText("Dönem biçimi: 2026-08 veya 2026-Q3")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "İçe aktar (0)" })).toBeDisabled()
  })
})

describe("İçe aktarım — mizan", () => {
  it("mizan okunur, ön kontroller gösterilir, içe aktarılınca detay açılır", async () => {
    tabloSatirlari.mockResolvedValue([
      ["Hesap Kodu", "Hesap Adı", "Borç", "Alacak"],
      ["100", "KASA", "1.000,00", "1.500,00"],
      ["102", "BANKALAR", "10.000,00", "0,00"],
      ["600", "YURT İÇİ SATIŞLAR", "0,00", "9.500,00"],
      ["", "TOPLAM", "11.000,00", "11.000,00"],
    ])
    const { user } = renderRoute("/ice-aktarim/mizan", {
      as: TEST_USERS.personel,
    })
    await user.upload(
      await screen.findByLabelText("Dosya seç"),
      new File(["x"], "mizan.xlsx")
    )
    expect(
      await screen.findByText(/3 ana hesap okundu · 1 satır/)
    ).toBeInTheDocument()
    const kontroller = screen.getByRole("list", { name: "Mizan kontrolleri" })
    expect(
      within(kontroller).getByText("Kasa alacak bakiyesi veriyor")
    ).toBeInTheDocument()

    // Mükellef seçilmeden içe aktarılamaz
    await user.click(screen.getByRole("button", { name: "İçe aktar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Mükellef seçin")

    await user.click(screen.getByRole("combobox", { name: "Mükellef" }))
    await user.click(
      await screen.findByRole("option", { name: /Çınar Yazılım/ })
    )
    await user.click(screen.getByRole("button", { name: "İçe aktar" }))

    const panel = await screen.findByRole("dialog", {
      name: "Çınar Yazılım San. ve Tic. Ltd. Şti. · Ağustos 2026 mizanı",
    })
    expect(within(panel).getByText("1 hata")).toBeInTheDocument()
    expect(
      await within(panel).findByRole("table", { name: "Mizan hesapları" })
    ).toBeInTheDocument()
    expect(db.mizan.all()).toHaveLength(1)
    expect(db.mizan.all()[0]).toMatchObject({
      mukellefId: "m_ltd",
      donem: "2026-08",
    })
  })

  it("başlığı olmayan dosyada anlaşılır hata", async () => {
    tabloSatirlari.mockResolvedValue([["a", "b"]])
    const { user } = renderRoute("/ice-aktarim/mizan", {
      as: TEST_USERS.personel,
    })
    await user.upload(
      await screen.findByLabelText("Dosya seç"),
      new File(["x"], "liste.csv")
    )
    expect(
      await screen.findByText(/Başlık satırı bulunamadı/)
    ).toBeInTheDocument()
  })
})
