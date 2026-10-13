import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("Evrak talepleri sayfası", () => {
  it("talepler türetilmiş durumlarıyla listelenir, durum filtresi URL'e yazılır", async () => {
    const { router, user } = renderRoute("/evrak-talepleri", {
      as: TEST_USERS.yonetici,
    })
    const tablo = await screen.findByRole("table", { name: "Evrak talepleri" })
    const satir = (unvan: RegExp) =>
      within(tablo).getAllByRole("row", { name: unvan })
    expect(within(satir(/Çınar/)[0]!).getByText("Aktif")).toBeInTheDocument()
    expect(within(satir(/Çınar/)[0]!).getByText("1 yeni")).toBeInTheDocument()
    expect(
      within(satir(/Ali Veli/)[0]!).getByText("Süresi doldu")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Süresi doldu" }))
    expect(router.state.location.search).toBe("?durum=SURESI_DOLDU")
    await waitFor(() =>
      expect(within(tablo).getAllByRole("row")).toHaveLength(2)
    )
  })

  it("kenar çubuğunda bekleyen evrak rozeti görünür", async () => {
    renderRoute("/evrak-talepleri", { as: TEST_USERS.yonetici })
    expect(
      await screen.findByLabelText("1 inceleme bekleyen evrak")
    ).toHaveTextContent("1")
  })

  it("gelen kutusu: onayla → dosya arşive önerilen kategoriyle kaydedilir", async () => {
    const { user } = renderRoute("/evrak-talepleri?sekme=gelen", {
      as: TEST_USERS.personel,
    })
    const satir = await screen.findByRole("listitem", {
      name: "agustos-faturalar.pdf",
    })
    expect(within(satir).getByText(/Çınar Yazılım/)).toBeInTheDocument()

    await user.click(within(satir).getByRole("button", { name: "Onayla" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Onayla ve arşive kaydet",
    })
    expect(within(dialog).getByLabelText("Arşiv kategorisi")).toHaveTextContent(
      "Fatura"
    )
    await user.clear(within(dialog).getByLabelText("Arşivdeki adı"))
    await user.type(
      within(dialog).getByLabelText("Arşivdeki adı"),
      "Ağustos faturaları.pdf"
    )
    await user.click(within(dialog).getByRole("button", { name: "Onayla" }))

    expect(
      await screen.findByText("İnceleme bekleyen evrak yok")
    ).toBeInTheDocument()
    expect(db.gelen.find("g_bekleyen")?.durum).toBe("ONAYLANDI")
    expect(
      db.arsiv.where((d) => d.ad === "Ağustos faturaları.pdf")
    ).toMatchObject([
      { mukellefId: "m_ltd", kategori: "FATURA", yukleyenId: "p_2" },
    ])
    // Bilanço mükellefinin fişi okunmak üzere kuyruğa alınır
    expect(db.gelen.find("g_bekleyen")?.okumaId).toBe("ok_g_bekleyen")
    expect(db.okuma.find("ok_g_bekleyen")?.durum).toBe("OKUNUYOR")
  })

  it("reddet → neden kaydedilir, talep yeniden açılır ve tekrar yükleme mesajı hazırlanır", async () => {
    db.talep.update("e_aktif", { durum: "TAMAMLANDI" })
    const { user } = renderRoute("/evrak-talepleri?talep=e_aktif", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    const satir = await within(panel).findByRole("listitem", {
      name: "agustos-faturalar.pdf",
    })
    await user.click(within(satir).getByRole("button", { name: "Reddet" }))

    const dialog = await screen.findByRole("dialog", { name: "Evrakı reddet" })
    await user.click(
      within(dialog).getByRole("button", { name: "Eksik sayfa var" })
    )
    await user.click(within(dialog).getByRole("button", { name: "Reddet" }))

    const mesajDialog = await screen.findByRole("dialog", {
      name: "Müşteriye tekrar yükleme mesajı",
    })
    const mesaj = await within(mesajDialog).findByLabelText("Mesaj")
    expect((mesaj as HTMLTextAreaElement).value).toContain(
      "uygun değil: Eksik sayfa var"
    )
    expect(db.gelen.find("g_bekleyen")).toMatchObject({
      durum: "REDDEDILDI",
      redNedeni: "Eksik sayfa var",
    })
    expect(db.talep.find("e_aktif")?.durum).toBe("AKTIF")
  })

  it("detay: süresi dolmuş talep uzatılır, iptal onay ister", async () => {
    const { user } = renderRoute("/evrak-talepleri?talep=e_sure", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Ali Veli/ })
    expect(await within(panel).findByText("Süresi doldu")).toBeInTheDocument()
    await user.click(within(panel).getByRole("button", { name: /Süre uzat/ }))
    await user.click(await screen.findByRole("menuitem", { name: "+7 gün" }))
    await waitFor(() =>
      expect(within(panel).getByText("Aktif")).toBeInTheDocument()
    )

    await user.click(within(panel).getByRole("button", { name: "İptal et" }))
    const onay = await screen.findByRole("alertdialog", {
      name: "Talep iptal edilsin mi?",
    })
    await user.click(within(onay).getByRole("button", { name: "İptal et" }))
    await waitFor(() => expect(db.talep.find("e_sure")?.durum).toBe("IPTAL"))
  })
})

describe("Talep oluşturma", () => {
  it("bordro / SGK evrakı seçilince bağlantı süresi 3 güne iner; elle seçilen süre korunur", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/genel", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("button", { name: "Evrak iste" }))
    const dialog = await screen.findByRole("dialog", { name: "Evrak iste" })
    const sure = within(dialog).getByRole("combobox", {
      name: "Bağlantı geçerliliği",
    })
    expect(sure).toHaveTextContent("7 gün")

    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Puantaj / ek ödeme-kesinti bilgisi",
      })
    )
    expect(sure).toHaveTextContent("3 gün")
    expect(
      within(dialog).getByText(
        "Bordro / SGK evrakı: bağlantı kısa süreli tutulur."
      )
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Puantaj / ek ödeme-kesinti bilgisi",
      })
    )
    expect(sure).toHaveTextContent("7 gün")
  })

  it("mükellef kartından: talep oluşturulur, mesaj önizlenir, WhatsApp bağlantısı ve gönderim kaydı", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/genel", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("button", { name: "Evrak iste" }))
    const dialog = await screen.findByRole("dialog", { name: "Evrak iste" })
    // Varsayılan: fiş/fatura + banka ekstresi, önceki ay
    expect(
      within(dialog).getByRole("checkbox", { name: "Aylık fiş / fatura" })
    ).toBeChecked()
    expect(within(dialog).getByLabelText("Dönem")).toHaveTextContent(
      "Ağustos 2026"
    )
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Banka ekstresi" })
    )
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "İşe giriş / çıkış belgeleri",
      })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Talep oluştur" })
    )

    const gonder = await screen.findByRole("dialog", { name: "Talebi gönder" })
    const talep = db.talep.where(
      (t) => t.mukellefId === "m_ltd" && t.id !== "e_aktif"
    )[0]!
    expect(talep.istenenler).toEqual(["FIS_FATURA", "ISE_GIRIS_CIKIS"])
    const mesaj = (
      within(gonder).getByLabelText("Mesaj") as HTMLTextAreaElement
    ).value
    expect(mesaj).toContain("Merhaba Çınar Yazılım San. ve Tic. Ltd. Şti.")
    expect(mesaj).toContain(`/p/${talep.token}`)
    expect(mesaj).toContain("aylık fiş / fatura, işe giriş / çıkış belgeleri")

    const wa = within(gonder).getByRole("link", { name: "WhatsApp'ta aç" })
    expect(wa.getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/905331234567\?text=Merhaba/
    )

    await user.click(
      within(gonder).getByRole("button", { name: "Mesajı kopyala" })
    )
    await waitFor(() =>
      expect(db.talep.find(talep.id)?.gonderimler).toHaveLength(1)
    )
  })

  it("mükellef ve evrak seçilmeden oluşturulamaz", async () => {
    const { user } = renderRoute("/evrak-talepleri", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("button", { name: "Evrak iste" }))
    const dialog = await screen.findByRole("dialog", { name: "Evrak iste" })
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Aylık fiş / fatura" })
    )
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Banka ekstresi" })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Talep oluştur" })
    )
    expect(within(dialog).getByText("Bir mükellef seçin")).toBeInTheDocument()
    expect(
      within(dialog).getByText("En az bir evrak seçin")
    ).toBeInTheDocument()
  })

  it("arşivdeki eksik evraktan tek tıkla talep: ilgili evrak seçili gelir", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/arsiv", {
      as: TEST_USERS.personel,
    })
    const eksik = await screen.findByRole("region", {
      name: "Eksik zorunlu evraklar",
    })
    await user.click(within(eksik).getByRole("button", { name: "Evrak iste" }))
    const dialog = await screen.findByRole("dialog", { name: "Evrak iste" })
    expect(
      within(dialog).getByRole("checkbox", { name: "İmza sirküleri" })
    ).toBeChecked()
    expect(
      within(dialog).getByRole("checkbox", { name: "Aylık fiş / fatura" })
    ).not.toBeChecked()
    expect(within(dialog).getByLabelText("Dönem")).toHaveTextContent("Dönemsiz")
  })
})

describe("Mesaj şablonları", () => {
  it("yönetici şablonu düzenler; önizleme güncellenir ve kaydedilir", async () => {
    const { user } = renderRoute("/ayarlar/sablonlar", {
      as: TEST_USERS.yonetici,
    })
    const alan = await screen.findByLabelText("Şablon", {
      selector: "#sablon-TALEP",
    })
    await user.clear(alan)
    await user.type(alan, "Selam {{unvan}, yükleyin: ")
    await user.click(screen.getAllByRole("button", { name: "{link}" })[0]!)
    expect(
      screen.getByLabelText("Evrak talebi mesajı önizleme")
    ).toHaveTextContent(
      /^Selam Çınar Yazılım Ltd\. Şti\., yükleyin: http.*\/p\/ornek-baglanti$/
    )
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    await waitFor(() =>
      expect(db.buro.all()[0]!.mesajSablonlari.TALEP).toMatch(
        /^Selam \{unvan\}, yükleyin: \{link\}$/
      )
    )
  })

  it("personel şablon sayfasına erişemez", async () => {
    renderRoute("/ayarlar/sablonlar", { as: TEST_USERS.personel })
    expect(await screen.findByText(/yetkiniz yok|Erişim/i)).toBeInTheDocument()
  })
})
