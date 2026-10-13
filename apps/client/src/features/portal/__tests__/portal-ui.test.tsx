import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

const png = (ad: string) =>
  new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], ad, {
    type: "image/png",
  })

describe("Müşteri portalı", () => {
  it("geçerli token: büro, mükellef, istenen evraklar ve önceki yükleme görünür", async () => {
    renderRoute("/p/tkn_aktif")
    expect(
      await screen.findByRole("heading", {
        name: "Merhaba, Çınar Yazılım San. ve Tic. Ltd. Şti.",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("Prime Mali Müşavirlik")).toBeInTheDocument()
    expect(screen.getByText("Dönem: Ağustos 2026")).toBeInTheDocument()
    expect(screen.getByText(/Son gün: 30\.09\.2026/)).toBeInTheDocument()

    const liste = screen.getByRole("list", { name: "İstenen evraklar" })
    const satirlar = within(liste).getAllByRole("listitem", {
      name: /fatura|ekstresi/,
    })
    expect(satirlar.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Aylık fiş / fatura",
      "Banka ekstresi",
    ])
    expect(
      within(satirlar[0]!).getByText("agustos-faturalar.pdf")
    ).toBeInTheDocument()
    expect(within(satirlar[0]!).getByLabelText("Yüklendi")).toBeInTheDocument()
    expect(
      within(satirlar[1]!).getByLabelText("Bekleniyor")
    ).toBeInTheDocument()
    // Kamera ile çekim için capture özniteliği
    expect(
      within(satirlar[1]!).getByLabelText("Banka ekstresi: fotoğraf çek")
    ).toHaveAttribute("capture", "environment")
  })

  it.each([
    ["/p/tkn_sure", "Bağlantının süresi dolmuş"],
    ["/p/tkn_iptal", "Bu talep iptal edildi"],
    ["/p/tkn_tamam", "Evraklarınız alındı"],
    ["/p/bilinmeyen-token", "Bağlantı geçersiz"],
  ])("%s → '%s' ekranı", async (yol, baslik) => {
    renderRoute(yol)
    expect(
      await screen.findByRole("heading", { name: baslik })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("list", { name: "İstenen evraklar" })
    ).not.toBeInTheDocument()
  })

  it("2 dosya yükle → gönderimi tamamla → başarı; büroda talep 3 yükleme ve not", async () => {
    renderRoute("/p/tkn_aktif")
    const user = userEvent.setup({ applyAccept: false })
    await screen.findByRole("list", { name: "İstenen evraklar" })

    await user.upload(screen.getByLabelText("Banka ekstresi: dosya seç"), [
      png("ekstre-1.png"),
      png("ekstre-2.png"),
    ])
    const banka = screen.getByRole("listitem", { name: "Banka ekstresi" })
    await waitFor(() =>
      expect(within(banka).getByText("ekstre-1.png")).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(within(banka).getByText("ekstre-2.png")).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(within(banka).getByLabelText("Yüklendi")).toBeInTheDocument()
    )

    await user.type(
      screen.getByLabelText("Büronuza not (isteğe bağlı)"),
      "Hepsi bu kadar"
    )
    await user.click(
      screen.getByRole("button", { name: "Gönderimi tamamla (3 dosya)" })
    )
    expect(
      await screen.findByRole("heading", { name: "Teşekkürler!" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/3 dosya Prime Mali Müşavirlik ekibine iletildi/)
    ).toBeInTheDocument()

    expect(db.gelen.count((g) => g.talepId === "e_aktif")).toBe(3)
    expect(db.talep.find("e_aktif")).toMatchObject({
      durum: "TAMAMLANDI",
      musteriNotu: "Hepsi bu kadar",
    })
  })

  it("geçersiz tür/boyut reddedilir, hata dosyanın altında gösterilir", async () => {
    renderRoute("/p/tkn_aktif")
    const user = userEvent.setup({ applyAccept: false })
    await screen.findByRole("list", { name: "İstenen evraklar" })
    const buyuk = new File(["x"], "buyuk.pdf", { type: "application/pdf" })
    Object.defineProperty(buyuk, "size", { value: 11 * 1024 * 1024 })
    await user.upload(screen.getByLabelText("Banka ekstresi: dosya seç"), [
      new File(["x"], "rapor.docx", { type: "application/msword" }),
      buyuk,
    ])
    const banka = screen.getByRole("listitem", { name: "Banka ekstresi" })
    expect(
      await within(banka).findByText(/Desteklenmeyen dosya türü/)
    ).toBeInTheDocument()
    expect(within(banka).getByText(/10 MB sınırını aşıyor/)).toBeInTheDocument()
    expect(db.gelen.count((g) => g.talepId === "e_aktif")).toBe(1)
  })

  it("müşteri yüklediği dosyayı silebilir", async () => {
    const { user } = renderRoute("/p/tkn_aktif")
    await user.click(
      await screen.findByRole("button", { name: "agustos-faturalar.pdf sil" })
    )
    await waitFor(() =>
      expect(
        screen.queryByText("agustos-faturalar.pdf")
      ).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole("button", { name: "Gönderimi tamamla" })
    ).toBeDisabled()
  })

  it("puantajda “Bu ay değişiklik yok” ile dosyasız gönderilir; bordro dönemi girdi geldi olur", async () => {
    db.talep.insert({
      ...db.talep.find("e_aktif")!,
      id: "e_puantaj",
      token: "tkn_puantaj",
      istenenler: ["PUANTAJ"],
    })
    const { user } = renderRoute("/p/tkn_puantaj")
    const satir = await screen.findByRole("listitem", {
      name: "Puantaj / ek ödeme-kesinti bilgisi",
    })
    const gonder = screen.getByRole("button", { name: "Gönderimi tamamla" })
    expect(gonder).toBeDisabled()

    await user.click(
      within(satir).getByRole("checkbox", { name: /Bu ay değişiklik yok/ })
    )
    expect(within(satir).getByLabelText("Yüklendi")).toBeInTheDocument()
    expect(screen.getByText("1 / 1 evrak")).toBeInTheDocument()
    await user.click(gonder)

    expect(
      await screen.findByText(/Bildiriminiz .* ekibine iletildi/)
    ).toBeInTheDocument()
    expect(db.bordro.find("m_ltd:2026-08")).toMatchObject({
      durum: "GIRDI_GELDI",
      degisiklikYok: true,
      girdiTalepId: "e_puantaj",
    })
  })

  it("puantaj istenmeyen talepte “değişiklik yok” seçeneği çıkmaz", async () => {
    renderRoute("/p/tkn_aktif")
    await screen.findByRole("list", { name: "İstenen evraklar" })
    expect(
      screen.queryByRole("checkbox", { name: /Bu ay değişiklik yok/ })
    ).not.toBeInTheDocument()
  })

  it("reddedilen dosya nedeniyle birlikte gösterilir", async () => {
    db.talep.update("e_tamam", { durum: "AKTIF" })
    renderRoute("/p/tkn_tamam")
    const fatura = await screen.findByRole("listitem", {
      name: "Aylık fiş / fatura",
    })
    expect(
      within(fatura).getByText(/Reddedildi: Fotoğraf bulanık/)
    ).toBeInTheDocument()
    expect(within(fatura).getByLabelText("Bekleniyor")).toBeInTheDocument()
  })
})
