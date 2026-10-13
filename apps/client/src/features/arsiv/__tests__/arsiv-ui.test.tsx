import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

const klasorler = () =>
  screen.getByRole("navigation", { name: "Arşiv klasörleri" })

describe("Arşiv gezgini", () => {
  it("ağaç mükellef ve kategori sayılarını gösterir, klasör seçimi URL'e yazılır", async () => {
    const { router, user } = renderRoute("/arsiv", { as: TEST_USERS.yonetici })

    const tumu = await within(
      await screen.findByRole("navigation", { name: "Arşiv klasörleri" })
    ).findByRole("button", { name: /Tüm dosyalar/ })
    expect(tumu).toHaveTextContent("8")
    expect(
      within(klasorler()).getByRole("button", { name: /Çöp kutusu/ })
    ).toHaveTextContent("1")
    expect(
      await screen.findAllByRole("listitem", { name: /\.pdf$|\.png$/ })
    ).toHaveLength(8)

    const ltd = within(klasorler()).getByRole("button", {
      name: /Çınar Yazılım/,
    })
    expect(ltd).toHaveTextContent("3")
    expect(
      within(ltd).getByLabelText("1 zorunlu evrak eksik")
    ).toBeInTheDocument()

    await user.click(ltd)
    expect(router.state.location.search).toBe("?mukellef=m_ltd")
    const kategoriler = within(klasorler()).getByRole("list", {
      name: /kategorileri/,
    })
    // Eksik zorunlu kategori de 0 sayısıyla ve uyarıyla listelenir
    expect(
      within(kategoriler).getByRole("button", { name: /İmza sirküleri/ })
    ).toHaveTextContent("0")
    expect(
      await screen.findByRole("region", { name: "Eksik zorunlu evraklar" })
    ).toBeInTheDocument()

    await user.click(
      within(kategoriler).getByRole("button", { name: /Vergi levhası/ })
    )
    expect(router.state.location.search).toBe(
      "?mukellef=m_ltd&kategori=VERGI_LEVHASI"
    )
    await waitFor(() =>
      expect(screen.getAllByRole("listitem", { name: /\.pdf$/ })).toHaveLength(
        1
      )
    )
  })

  it("bordrodan dönemle açılır: dönem rozeti ve filtre; düzenlemede dönem ve belge türü değişir", async () => {
    const ortak = {
      mukellefId: "m_ltd",
      kategori: "BORDRO" as const,
      mimeType: "application/pdf",
      boyut: 1000,
      yukleyenId: "p_2",
      yuklemeTarihi: "2026-09-10T10:00:00Z",
      silindi: false,
    }
    db.arsiv.insert({
      ...ortak,
      id: "b_agu",
      ad: "Pusula ağustos.pdf",
      donem: "2026-08",
      bordroBelge: "PUSULA",
    })
    db.arsiv.insert({
      ...ortak,
      id: "b_tem",
      ad: "Pusula temmuz.pdf",
      donem: "2026-07",
    })
    const { user, router } = renderRoute(
      "/arsiv?mukellef=m_ltd&kategori=BORDRO&donem=2026-08&gorunum=liste",
      { as: TEST_USERS.yonetici }
    )

    const satir = await screen.findByRole("row", { name: "Pusula ağustos.pdf" })
    expect(satir).toHaveTextContent("Ağustos 2026 · Pusula")
    expect(
      screen.queryByRole("row", { name: "Pusula temmuz.pdf" })
    ).not.toBeInTheDocument()

    await user.click(
      within(satir).getByRole("button", {
        name: "Pusula ağustos.pdf işlemleri",
      })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Düzenle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Dosyayı düzenle",
    })
    expect(within(dialog).getByLabelText("Dönem")).toHaveTextContent(
      "Ağustos 2026"
    )
    await user.click(
      within(dialog).getByRole("combobox", { name: "Belge türü" })
    )
    await user.click(
      await screen.findByRole("option", { name: "İmzalı bordro" })
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    await waitFor(() =>
      expect(db.arsiv.find("b_agu")).toMatchObject({
        donem: "2026-08",
        bordroBelge: "IMZALI",
      })
    )

    await user.click(
      screen.getByRole("button", { name: "Dönem filtresini kaldır" })
    )
    expect(
      await screen.findByRole("row", { name: "Pusula temmuz.pdf" })
    ).toBeInTheDocument()
    expect(router.state.location.search).not.toContain("donem")
  })

  it("sil → çöp kutusunda görünür → geri al → yerine döner", async () => {
    const { user } = renderRoute("/arsiv?mukellef=m_ltd&gorunum=liste", {
      as: TEST_USERS.yonetici,
    })

    await user.click(
      await screen.findByRole("button", { name: "Vergi levhası.pdf işlemleri" })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Çöp kutusuna taşı" })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("row", { name: "Vergi levhası.pdf" })
      ).not.toBeInTheDocument()
    )
    expect(db.arsiv.find("d_ltd_levha")?.silindi).toBe(true)

    await user.click(
      within(klasorler()).getByRole("button", { name: /Çöp kutusu/ })
    )
    expect(
      await screen.findByRole("row", { name: "Vergi levhası.pdf" })
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "Vergi levhası.pdf işlemleri" })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Geri al" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("row", { name: "Vergi levhası.pdf" })
      ).not.toBeInTheDocument()
    )
    expect(db.arsiv.find("d_ltd_levha")?.silindi).toBe(false)
    expect(
      db.aktivite.where((a) => a.hedefId === "d_ltd_levha").map((a) => a.eylem)
    ).toEqual(["ARSIV_SILINDI", "ARSIV_GERI_ALINDI"])
  })

  it("çöp kutusundan kalıcı silme onay ister", async () => {
    const { user } = renderRoute("/arsiv?cop=1&gorunum=liste", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      await screen.findByRole("button", { name: "Eski dekont.pdf işlemleri" })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Kalıcı olarak sil" })
    )
    const onay = await screen.findByRole("alertdialog", {
      name: "Dosya kalıcı olarak silinsin mi?",
    })
    await user.click(
      within(onay).getByRole("button", { name: "Kalıcı olarak sil" })
    )
    await waitFor(() => expect(db.arsiv.find("d_sahis_cop")).toBeUndefined())
    expect(await screen.findByText("Çöp kutusu boş")).toBeInTheDocument()
  })
})

describe("Arşiv — dosya erişim kaydı", () => {
  it("önizleme açılınca görüntüleme kaydedilir ve erişim geçmişinde görünür", async () => {
    const { user } = renderRoute("/arsiv?gorunum=liste", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      (await screen.findAllByRole("button", { name: /işlemleri$/ }))[0]!
    )
    await user.click(await screen.findByRole("menuitem", { name: /Önizle/ }))
    const dialog = await screen.findByRole("dialog")
    await waitFor(() =>
      expect(
        db.aktivite.where((a) => a.eylem === "DOSYA_GORUNTULENDI")
      ).toHaveLength(1)
    )

    const dosyaId = db.aktivite.where(
      (a) => a.eylem === "DOSYA_GORUNTULENDI"
    )[0]!.hedefId!
    await user.click(
      await within(dialog).findByRole("button", { name: "Erişim geçmişi" })
    )
    const gecmis = await within(dialog).findByRole("list", {
      name: "Erişim geçmişi",
    })
    expect(within(gecmis).getByText(/Görüntüledi/)).toBeInTheDocument()
    expect(
      db.aktivite.where(
        (a) => a.hedefId === dosyaId && a.eylem === "DOSYA_INDIRILDI"
      )
    ).toHaveLength(0)
  })
})

describe("Arşiv — panodan gelen filtreler", () => {
  it("?gecerlilik=doldu yalnızca süresi dolan belgeleri listeler; rozet filtreyi kaldırır", async () => {
    const { router, user } = renderRoute("/arsiv?gecerlilik=doldu", {
      as: TEST_USERS.yonetici,
    })
    await waitFor(() =>
      expect(
        screen.getAllByRole("listitem", { name: /\.pdf$|\.png$/ })
      ).toHaveLength(1)
    )
    await user.click(
      screen.getByRole("button", { name: "Süresi dolmuş filtresini kaldır" })
    )
    expect(router.state.location.search).toBe("")
    expect(
      await screen.findAllByRole("listitem", { name: /\.pdf$|\.png$/ })
    ).toHaveLength(8)
  })

  it("?eksik=1 eksik zorunlu evrakı olan mükellefleri listeler", async () => {
    const { router, user } = renderRoute("/arsiv?eksik=1", {
      as: TEST_USERS.yonetici,
    })
    const bolum = await screen.findByRole("region", {
      name: "Eksik zorunlu evrakı olan mükellefler",
    })
    expect(within(bolum).getByText(/Çınar Yazılım/)).toBeInTheDocument()
    expect(within(bolum).getByText("İmza sirküleri")).toBeInTheDocument()
    await user.click(within(bolum).getByRole("button", { name: "Klasörü aç" }))
    expect(router.state.location.search).toBe("?mukellef=m_ltd")
  })
})

describe("Mükellef kartı → Arşiv", () => {
  it("Ltd mükellefte eksik imza sirküleri listelenir; yükleyince kaybolur", async () => {
    renderRoute("/mukellefler/m_ltd/arsiv", { as: TEST_USERS.yonetici })
    const user = userEvent.setup({ applyAccept: false })

    const eksik = await screen.findByRole("region", {
      name: "Eksik zorunlu evraklar",
    })
    expect(within(eksik).getByText("İmza sirküleri")).toBeInTheDocument()

    await user.click(within(eksik).getByRole("button", { name: "Yükle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Arşive dosya yükle",
    })
    // Mükellef sabit, kategori ön seçili
    expect(within(dialog).queryByLabelText("Mükellef")).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText("Kategori")).toHaveTextContent(
      "İmza sirküleri"
    )

    const png = new File([new Uint8Array([137, 80, 78, 71])], "imza.png", {
      type: "image/png",
    })
    await user.upload(within(dialog).getByLabelText("Dosya seç"), png)
    await user.click(within(dialog).getByLabelText("Son geçerlilik"))
    await user.click(
      await screen.findByRole("button", { name: "Sonraki aya git" })
    )
    await user.click(screen.getByRole("button", { name: /30 Ekim 2026/ }))
    expect(within(dialog).getByLabelText("Son geçerlilik")).toHaveTextContent(
      "30 Ekim 2026"
    )
    await user.click(within(dialog).getByRole("button", { name: "Yükle" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Arşive dosya yükle" })
      ).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Eksik zorunlu evraklar" })
      ).not.toBeInTheDocument()
    )
    const yuklenen = db.arsiv.where((d) => d.ad === "imza.png")
    expect(yuklenen).toMatchObject([
      {
        mukellefId: "m_ltd",
        kategori: "IMZA_SIRKULERI",
        gecerlilikTarihi: "2026-10-30",
        yukleyenId: "p_1",
      },
    ])
  })

  it("geçersiz tür ve boyut reddedilir, hata mesajı gösterilir", async () => {
    renderRoute("/mukellefler/m_ltd/arsiv", { as: TEST_USERS.yonetici })
    const user = userEvent.setup({ applyAccept: false })

    await user.click(await screen.findByRole("button", { name: "Yükle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Arşive dosya yükle",
    })
    const docx = new File(["x"], "rapor.docx", { type: "application/msword" })
    const buyuk = new File(["x"], "buyuk.pdf", { type: "application/pdf" })
    Object.defineProperty(buyuk, "size", { value: 11 * 1024 * 1024 })
    await user.upload(within(dialog).getByLabelText("Dosya seç"), [docx, buyuk])

    const liste = within(dialog).getByRole("list", { name: "Seçilen dosyalar" })
    expect(
      within(liste).getByText(/Desteklenmeyen dosya türü/)
    ).toBeInTheDocument()
    expect(within(liste).getByText(/10 MB sınırını aşıyor/)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Yükle" })).toBeDisabled()
  })

  it("süresi dolan ve yaklaşan belgeler rozet alır", async () => {
    renderRoute("/mukellefler/m_ltd/arsiv", { as: TEST_USERS.yonetici })
    const kart = await screen.findByRole("listitem", {
      name: "Faaliyet belgesi.pdf",
    })
    expect(within(kart).getByText("20 gün kaldı")).toBeInTheDocument()
  })
})
