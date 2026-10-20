import { act, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { decryptJson } from "@/lib/crypto"
import { db } from "@/mocks/db"
import { useVaultStore } from "@/features/kasa/store"
import { demoKasaAnahtari } from "@/test/kasa"
import { TEST_USERS, renderRoute } from "@/test/render"

// SheetJS jsdom'da çalıştırılmaz; ayrıştırma mantığı birim testlerinde
const { tabloSatirlari } = vi.hoisted(() => ({
  tabloSatirlari: vi.fn<(f: File) => Promise<unknown[][]>>(),
}))
vi.mock("@/features/ice-aktarim/dosya-oku", () => ({
  pdfMetni: vi.fn(),
  tabloSatirlari,
}))

const excel = (ad = "liste.xlsx") => new File(["x"], ad)

async function dosyaYukle(user: ReturnType<typeof renderRoute>["user"]) {
  const girdi = await screen.findByLabelText("Dosya seç")
  await waitFor(() => expect(girdi).toBeEnabled())
  await user.upload(girdi, excel())
  return screen.findByRole("table", { name: "Aktarım önizlemesi" })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("Hızlı başlangıç — şifreler", () => {
  it("kasa kilitliyken dosya seçilemez; şifreler tarayıcıda şifrelenip aktarılır ve önizlemede görünmez", async () => {
    tabloSatirlari.mockResolvedValue([
      ["VKN/TCKN", "İVD Şifre", "SGK Kullanıcı Adı", "SGK Sistem Şifresi"],
      ["9358005601", "gizli-ivd", "sgk-kul", "gizli-sgk"],
    ])
    // Demo kasa şifreleri ilk erişimde üretir; önce kasayı oluşturup m_as'ınkileri sil
    const key = await demoKasaAnahtari()
    db.credential
      .where((c) => c.mukellefId === "m_as")
      .forEach((c) => db.credential.remove(c.id))

    const { user } = renderRoute("/ice-aktarim/sifreler", {
      as: TEST_USERS.personel,
    })
    expect(await screen.findByLabelText("Dosya seç")).toBeDisabled()
    act(() => useVaultStore.getState().unlock(key))
    const tablo = await dosyaYukle(user)
    expect(within(tablo).queryByText(/gizli/)).not.toBeInTheDocument()
    expect(within(tablo).getAllByText("Aktarılacak")).toHaveLength(2)

    await user.click(screen.getByRole("button", { name: "2 kaydı aktar" }))
    expect(
      await screen.findByText(/Excel dosyasını bilgisayarınızdan/)
    ).toBeInTheDocument()
    const [ivd, sgk] = ["IVD", "SGK"].map(
      (s) =>
        db.credential.where(
          (c) => c.mukellefId === "m_as" && c.sistem === s
        )[0]!
    )
    expect(ivd!.kullaniciAdi).toBe("9358005601")
    expect(ivd!.cipherText).not.toContain("gizli")
    expect(await decryptJson(ivd!, key)).toEqual({ sifre: "gizli-ivd" })
    expect(await decryptJson(sgk!, key)).toEqual({ sifre: "gizli-sgk" })
  })
})

describe("Hızlı başlangıç — ücret ve bakiyeler", () => {
  it("personel göremez", async () => {
    renderRoute("/ice-aktarim/bakiyeler", { as: TEST_USERS.personel })
    expect(await screen.findByText("Yalnızca yönetici")).toBeInTheDocument()
  })

  it("yönetici ücret ve açılış bakiyesini aktarır", async () => {
    tabloSatirlari.mockResolvedValue([
      ["VKN/TCKN", "Aylık ücret", "Açılış bakiyesi"],
      ["9358005601", 5000, 12500],
    ])
    const { user } = renderRoute("/tahsilat", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("link", { name: /bakiyeleri içe aktar/ })
    )
    await dosyaYukle(user)
    await user.click(screen.getByRole("button", { name: "1 kaydı aktar" }))
    expect(await screen.findByText("Aktarım tamamlandı")).toBeInTheDocument()
    expect(db.mukellef.find("m_as")!.ucret).toMatchObject({
      aylikBrut: 5000,
      baslangicDonem: "2026-10",
    })
    expect(
      db.cari.where((h) => h.mukellefId === "m_as" && h.kalem === "ACILIS")
    ).toMatchObject([{ tip: "BORC", tutar: 12500 }])
  })
})

describe("Şifre kasası görünümü", () => {
  it("geniş ekranda tablo ile ızgara arasında geçilir", async () => {
    const { user } = renderRoute("/kasa", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("table", {
        name: "Şifre kasası tamamlanma tablosu",
      })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Izgara görünümü" }))
    const kartlar = await screen.findByRole("list", {
      name: "Şifre kasası mükellefleri",
    })
    await user.click(
      within(kartlar).getByRole("button", { name: "Ali Veli SGK: Gerekmez" })
    )
    expect(
      await screen.findByRole("dialog", { name: "Ali Veli" })
    ).toBeInTheDocument()
  })

  it("tablet ve altında ızgara zorunludur, görünüm seçici gizlenir", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query.includes("1023px"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    )
    renderRoute("/kasa", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("list", { name: "Şifre kasası mükellefleri" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("group", { name: "Görünüm" })
    ).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
