import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { tabloSatirlari } from "@/features/ice-aktarim/dosya-oku"
import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

vi.mock("@/features/ice-aktarim/dosya-oku", () => ({
  tabloSatirlari: vi.fn(),
  pdfMetni: vi.fn(),
}))

beforeEach(() => {
  // Bugün: 23 Eylül 2026 Çarşamba; Ağustos bordrosunun MUHSGK son günü 28 Eylül
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

const satir = (unvan: RegExp) =>
  screen.findByRole("row", { name: new RegExp(`${unvan.source}.*bordro`) })

describe("Bordro takibi sayfası", () => {
  it("bordrosu olan mükellefleri geçen ayın dönemiyle listeler; süre yaklaşıyorsa uyarır", async () => {
    renderRoute("/bordro", { as: TEST_USERS.personel })

    const ltd = await satir(/Çınar Yazılım/)
    expect(ltd).toHaveTextContent("Ağustos 2026")
    expect(ltd).toHaveTextContent("Girdi bekleniyor")
    expect(ltd).toHaveTextContent("Yaklaşıyor")
    expect(ltd).toHaveTextContent("3 iş günü kaldı")
    // Çalışanı olmayan şahıs listede yok
    expect(
      screen.queryByRole("row", { name: /Ahmet.*bordro/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("2 mükellefin bordrosu için süre yaklaşıyor")
    ).toBeInTheDocument()
  })

  it("satıra tıklayınca detay açılır; durum değişikliği kaydedilir", async () => {
    const { user, router } = renderRoute("/bordro", { as: TEST_USERS.personel })
    await user.click(await satir(/Çınar Yazılım/))

    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    expect(router.state.location.search).toBe("?bordro=m_ltd%3A2026-08")
    await user.click(
      within(panel).getByRole("combobox", { name: "Bordro durumu" })
    )
    await user.click(
      await screen.findByRole("option", { name: "Bordro hazırlandı" })
    )

    await waitFor(() =>
      expect(db.bordro.find("m_ltd:2026-08")?.durum).toBe("HAZIRLANDI")
    )
    expect(
      await within(panel).findByRole("combobox", { name: "Bordro durumu" })
    ).toHaveTextContent("Bordro hazırlandı")
  })

  it("not alanı odaktan çıkınca kaydedilir", async () => {
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    const not = within(panel).getByRole("textbox", { name: "Bordro notu" })
    await user.type(not, "2 yeni işe giriş")
    await user.tab()
    await waitFor(() =>
      expect(db.bordro.find("m_ltd:2026-08")?.not).toBe("2 yeni işe giriş")
    )
  })

  it("Puantaj iste: dönem ve evrak türü hazır gelir, hassas evrak için süre 3 gün", async () => {
    const { user } = renderRoute("/bordro", { as: TEST_USERS.personel })
    const onceki = db.talep.where(
      (t) => t.mukellefId === "m_ltd" && t.donem === "2026-08"
    ).length
    const ltd = await satir(/Çınar Yazılım/)
    await user.click(within(ltd).getByRole("button", { name: "Puantaj iste" }))

    const dialog = await screen.findByRole("dialog", { name: "Evrak iste" })
    expect(
      within(dialog).getByRole("checkbox", {
        name: "Puantaj / ek ödeme-kesinti bilgisi",
      })
    ).toBeChecked()
    expect(within(dialog).getByLabelText("Dönem")).toHaveTextContent(
      "Ağustos 2026"
    )
    expect(
      within(dialog).getByRole("combobox", { name: "Bağlantı geçerliliği" })
    ).toHaveTextContent("3 gün")

    await user.click(
      within(dialog).getByRole("button", { name: "Talep oluştur" })
    )
    await screen.findByRole("dialog", { name: "Talebi gönder" })
    expect(
      db.talep.where((t) => t.mukellefId === "m_ltd" && t.donem === "2026-08")
    ).toHaveLength(onceki + 1)
  })

  it("durum filtresi satırları süzer; beyan verilmiş dönem tamamlanmış görünür", async () => {
    db.takvim.insert({
      id: "m_as:MUHTASAR_SGK:2026-08",
      mukellefId: "m_as",
      tip: "MUHTASAR_SGK",
      donem: "2026-08",
      durum: "ONAYLANDI",
      guncelleyenId: "p_2",
      guncellemeTarihi: "2026-09-20T10:00:00Z",
    })
    const { user, router } = renderRoute("/bordro", {
      as: TEST_USERS.personel,
    })
    const as = await satir(/Öztürk İnşaat/)
    expect(as).toHaveTextContent("Beyan verildi")

    await user.click(screen.getByRole("combobox", { name: "Durum filtresi" }))
    // Seçenekler dönemdeki sayıyı gösterir
    await user.click(
      await screen.findByRole("option", { name: "Girdi bekleniyor (1)" })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("row", { name: /A\.Ş\..*bordro/ })
      ).not.toBeInTheDocument()
    )
    expect(await satir(/Çınar Yazılım/)).toBeInTheDocument()
    expect(router.state.location.search).toBe("?durum=BEKLENIYOR")

    await user.click(screen.getByRole("combobox", { name: "Süre filtresi" }))
    await user.click(await screen.findByRole("option", { name: "Geciken (0)" }))
    expect(
      await screen.findByText("Filtreyle eşleşen bordro yok")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filtreleri temizle" }))
    expect(await satir(/Öztürk İnşaat/)).toBeInTheDocument()
  })

  it("ızgara görünümüne geçer; seçim hatırlanır ve kart detayı açar", async () => {
    const { user, router } = renderRoute("/bordro", {
      as: TEST_USERS.personel,
    })
    await satir(/Çınar Yazılım/)
    await user.click(screen.getByRole("button", { name: "Izgara görünümü" }))

    const kartlar = await screen.findByRole("list", { name: "Bordro takibi" })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    const ltd = within(kartlar).getByRole("listitem", {
      name: /Çınar Yazılım.*bordro/,
    })
    expect(ltd).toHaveTextContent("Girdi bekleniyor")
    expect(ltd).toHaveTextContent("3 iş günü kaldı")
    expect(
      within(ltd).getByRole("button", { name: "Puantaj iste" })
    ).toBeInTheDocument()

    await user.click(within(ltd).getByRole("button", { name: /Çınar Yazılım/ }))
    expect(
      await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("?bordro=m_ltd%3A2026-08")
    expect(localStorage.getItem("prime-ofis:liste-gorunumu")).toContain(
      '"bordro":"grid"'
    )
  })

  it("sayfalar; filtre değişince ilk sayfaya döner, panel açmak sayfayı korur", async () => {
    const ornek = db.mukellef.find("m_ltd")!
    for (let i = 1; i <= 25; i++)
      db.mukellef.insert({
        ...ornek,
        id: `m_ek_${i}`,
        unvan: `Ek Firma ${String(i).padStart(2, "0")} Ltd. Şti.`,
      })
    const { user, router } = renderRoute("/bordro", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText("27 mükelleften 1–24 arası gösteriliyor")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Sonraki/ }))
    expect(
      await screen.findByText("27 mükelleften 25–27 arası gösteriliyor")
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("?sayfa=2")

    await user.click(await satir(/Ek Firma 25/))
    await screen.findByRole("dialog", { name: /Ek Firma 25/ })
    expect(router.state.location.search).toContain("sayfa=2")
    await user.keyboard("{Escape}")

    await user.type(
      screen.getByRole("searchbox", { name: "Mükellef ara" }),
      "Ek Firma"
    )
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=Ek+Firma")
    )
    expect(
      await screen.findByText("25 mükelleften 1–24 arası gösteriliyor")
    ).toBeInTheDocument()
  })
})

describe("Mükellef bordro sekmesi", () => {
  it("çalışanı olmayan mükellefte açıklayıcı boş durum gösterir", async () => {
    renderRoute("/mukellefler/m_sahis/bordro", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Bu mükellefin bordrosu yok")
    ).toBeInTheDocument()
  })

  it("son dönemleri listeler ve satırdan detay açar", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/bordro", {
      as: TEST_USERS.personel,
    })
    const agustos = await screen.findByRole("row", {
      name: /Çınar Yazılım.*Ağustos 2026 bordro/,
    })
    expect(
      screen.getByRole("row", { name: /Temmuz 2026 bordro/ })
    ).toHaveTextContent("Gecikti")
    await user.click(agustos)
    expect(
      await screen.findByRole("dialog", { name: /Çınar Yazılım.*Ağustos 2026/ })
    ).toBeInTheDocument()
  })
})

describe("Bordro özeti içe aktarımı", () => {
  const dosyaYukle = async (
    user: ReturnType<typeof renderRoute>["user"],
    dosya: File
  ) => {
    await user.click(
      await screen.findByRole("button", { name: "Bordro dökümünü yükle" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Bordro dökümünü yükle",
    })
    await user.upload(within(dialog).getByLabelText("Dosya seç"), dosya)
    return dialog
  }

  it("Excel döküm tarayıcıda toplanır, önizlenir ve kaydedilir; çalışan bilgisi gönderilmez", async () => {
    vi.mocked(tabloSatirlari).mockResolvedValue([
      ["Ad Soyad", "Brüt Ücret", "Net Ücret", "SGK İşçi Payı"],
      ["Gizli Kişi", 10000, 7700, 1400],
      ["Başka Kişi", 20000, 15400, 2800],
    ])
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const dialog = await dosyaYukle(
      user,
      new File(["x"], "bordro.xlsx", { type: "application/vnd.ms-excel" })
    )

    expect(await within(dialog).findByLabelText("Çalışan sayısı")).toHaveValue(
      "2"
    )
    expect(within(dialog).getByLabelText("Brüt toplam (TL)")).toHaveValue(
      "30000"
    )
    expect(within(dialog).getByLabelText("Net toplam (TL)")).toHaveValue(
      "23100"
    )
    expect(
      within(dialog).getByText(/Dosyada bulunamayan sütunlar 0 alındı/)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "İçe aktar" }))
    await waitFor(() =>
      expect(db.bordro.find("m_ltd:2026-08")?.ozet).toMatchObject({
        calisanSayisi: 2,
        brutToplam: 30_000,
        netToplam: 23_100,
        sgkIsciPayi: 4_200,
      })
    )
    expect(JSON.stringify(db.bordro.all())).not.toMatch(/Gizli|Başka/)
    expect(db.arsiv.where((d) => d.kategori === "BORDRO")).toHaveLength(1)
    // Detay paneli yeni özeti ve kontrolleri gösterir
    expect(
      await screen.findByText("Net ücret brütü aşmıyor")
    ).toBeInTheDocument()
  })

  it("PDF sunucuda okunur; okunamazsa hata gösterilir", async () => {
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const dialog = await dosyaYukle(
      user,
      new File(["%PDF"], "bulanik-bordro.pdf", { type: "application/pdf" })
    )
    expect(
      await within(dialog).findByText("Dosya okunamadı")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "İçe aktar" })
    ).toBeDisabled()

    // Okunamayan icmal kaldırılıp yenisi eklenince o okunur
    await user.click(
      within(dialog).getByRole("button", { name: "bulanik-bordro.pdf kaldır" })
    )
    await user.upload(
      within(dialog).getByLabelText("Dosya seç"),
      new File(["%PDF"], "bordro-agustos.pdf", { type: "application/pdf" })
    )
    expect(
      await within(dialog).findByLabelText("Brüt toplam (TL)")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "İçe aktar" })
    ).toBeEnabled()
  })

  it("icmal ile birlikte pusula yüklenir: türler addan tahmin edilir, toplamlar yalnızca icmalden okunur", async () => {
    vi.mocked(tabloSatirlari).mockResolvedValue([
      ["Brüt Ücret", "Net Ücret"],
      [1000, 800],
    ])
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("button", { name: "Bordro dökümünü yükle" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Bordro dökümünü yükle",
    })
    await user.upload(within(dialog).getByLabelText("Dosya seç"), [
      new File(["%PDF"], "ucret-pusulalari.pdf", { type: "application/pdf" }),
      new File(["x"], "icmal.xlsx", { type: "application/vnd.ms-excel" }),
    ])
    expect(
      within(dialog).getByRole("combobox", {
        name: "ucret-pusulalari.pdf belge türü",
      })
    ).toHaveTextContent("Ücret hesap pusulaları")
    expect(
      within(dialog).getByRole("listitem", { name: "icmal.xlsx" })
    ).toHaveTextContent("Toplamlar bu dosyadan okunur")
    expect(
      await within(dialog).findByLabelText("Brüt toplam (TL)")
    ).toHaveValue("1000")
    // Pusula PDF'i sunucuda okunmaz
    expect(tabloSatirlari).toHaveBeenCalledTimes(1)

    await user.click(within(dialog).getByRole("button", { name: "İçe aktar" }))
    await waitFor(() =>
      expect(
        db.arsiv
          .where((d) => d.donem === "2026-08" && d.mukellefId === "m_ltd")
          .map((d) => d.bordroBelge)
          .sort()
      ).toEqual(["ICMAL", "PUSULA"])
    )
    // Dönem belgeleri panelde listelenir
    const belgeler = await screen.findByRole("list", {
      name: "Dönem belgeleri",
    })
    expect(
      within(belgeler).getByRole("button", { name: /icmal\.xlsx.*İcmal/ })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Arşivde aç" })).toHaveAttribute(
      "href",
      "/arsiv?mukellef=m_ltd&kategori=BORDRO&donem=2026-08"
    )
  })

  it("icmal seçilmezse uyarı verilir ve içe aktarılamaz", async () => {
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const dialog = await dosyaYukle(
      user,
      new File(["%PDF"], "pusula.pdf", { type: "application/pdf" })
    )
    expect(
      within(dialog).getByText("Bordro dökümü (icmal) seçilmedi")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "İçe aktar" })
    ).toBeDisabled()
  })

  it("net toplam brütü aşarsa içe aktarma engellenir", async () => {
    vi.mocked(tabloSatirlari).mockResolvedValue([
      ["Brüt Ücret", "Net Ücret"],
      [1000, 800],
    ])
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const dialog = await dosyaYukle(
      user,
      new File(["x"], "b.csv", { type: "text/csv" })
    )
    const net = await within(dialog).findByLabelText("Net toplam (TL)")
    await user.clear(net)
    await user.type(net, "1500")
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "büyük ya da brüt sıfır"
    )
    expect(
      within(dialog).getByRole("button", { name: "İçe aktar" })
    ).toBeDisabled()
  })

  it("çalışan sayısı farkında kart güncelleme düğmesi çıkar ve uygulanır", async () => {
    db.bordro.insert({
      id: "m_ltd:2026-08",
      mukellefId: "m_ltd",
      donem: "2026-08",
      durum: "HAZIRLANDI",
      ozet: {
        calisanSayisi: 11,
        brutToplam: 1000,
        netToplam: 800,
        sgkIsciPayi: 0,
        sgkIsverenPayi: 0,
        issizlikToplam: 0,
        gelirVergisi: 0,
        damgaVergisi: 0,
      },
      guncelleyenId: "p_2",
      guncellemeTarihi: new Date().toISOString(),
    })
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("button", {
        name: "Çalışan sayısını mükellef kartına uygula",
      })
    )
    await waitFor(() =>
      expect(db.mukellef.find("m_ltd")?.calisanSayisi).toBe(11)
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Çalışan sayısını mükellef kartına uygula",
        })
      ).not.toBeInTheDocument()
    )
  })
})

describe("Puantaj girdisi", () => {
  it("“Değişiklik yok” dönemi girdi geldiye taşır ve panelde bildirilir; işaret kaldırılabilir", async () => {
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    await user.click(
      within(panel).getByRole("button", { name: "Değişiklik yok" })
    )
    await waitFor(() =>
      expect(db.bordro.find("m_ltd:2026-08")).toMatchObject({
        durum: "GIRDI_GELDI",
        degisiklikYok: true,
      })
    )
    expect(
      await within(panel).findByText(/puantajda değişiklik olmadığını bildirdi/)
    ).toBeInTheDocument()
    // Panel kapanınca tabloda da görünür
    await user.keyboard("{Escape}")
    const ltd = await satir(/Çınar Yazılım/)
    expect(ltd).toHaveTextContent("Değişiklik yok")
    await user.click(ltd)
    const yeniden = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })

    await user.click(
      within(yeniden).getByRole("button", {
        name: "“Değişiklik yok” işaretini kaldır",
      })
    )
    await waitFor(() =>
      expect(db.bordro.find("m_ltd:2026-08")?.degisiklikYok).toBeUndefined()
    )
  })

  it("döneme özetsiz belge eklenir", async () => {
    const { user } = renderRoute("/bordro?bordro=m_ltd:2026-08", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    expect(
      within(panel).getByText(/Bu döneme bağlı belge yok/)
    ).toBeInTheDocument()
    await user.click(within(panel).getByRole("button", { name: "Belge ekle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Döneme belge ekle",
    })
    await user.upload(
      within(dialog).getByLabelText("Dosya seç"),
      new File(["%PDF"], "taranmis.pdf", { type: "application/pdf" })
    )
    await user.click(
      within(dialog).getByRole("combobox", { name: "taranmis.pdf belge türü" })
    )
    await user.click(
      await screen.findByRole("option", { name: "İmzalı bordro" })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Arşive ekle" })
    )

    await waitFor(() =>
      expect(
        db.arsiv.where((d) => d.donem === "2026-08" && d.mukellefId === "m_ltd")
      ).toMatchObject([
        { ad: "taranmis.pdf", bordroBelge: "IMZALI", kategori: "BORDRO" },
      ])
    )
    expect(db.bordro.find("m_ltd:2026-08")?.ozet).toBeUndefined()
  })
})

describe("İşe giriş / çıkış takibi", () => {
  it("mükellef sekmesinden bildirim eklenir, bildirildi işaretlenir ve silinir", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/bordro", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("button", { name: "Bildirim ekle" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "İşe giriş / çıkış ekle",
    })
    // Boş ad soyad engellenir
    await user.click(within(dialog).getByRole("button", { name: "Ekle" }))
    expect(
      await within(dialog).findByText("Ad soyad girin")
    ).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText("Ad soyad"), "Ali Veli")
    await user.click(within(dialog).getByRole("button", { name: "Ekle" }))

    const satir = await screen.findByRole("row", { name: "Ali Veli İşe giriş" })
    // Bugün başlıyor: süre bugün doluyor
    expect(satir).toHaveTextContent("Bugün son gün")
    expect(satir).toHaveTextContent("Yaklaşıyor")
    expect(db.isHareketi.all()).toHaveLength(1)

    await user.click(within(satir).getByRole("button", { name: "Bildirildi" }))
    await waitFor(() =>
      expect(db.isHareketi.all()[0]?.durum).toBe("BILDIRILDI")
    )
    expect(
      await screen.findByRole("row", { name: "Ali Veli İşe giriş" })
    ).not.toHaveTextContent("Yaklaşıyor")

    await user.click(
      screen.getByRole("button", { name: "Ali Veli kaydını sil" })
    )
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Sil",
      })
    )
    await waitFor(() => expect(db.isHareketi.all()).toHaveLength(0))
  })

  it("çalışanı olmayan mükellefte de ilk işe giriş eklenebilir", async () => {
    renderRoute("/mukellefler/m_sahis/bordro", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Bu mükellefin bordrosu yok")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Bildirim ekle" })
    ).toBeInTheDocument()
  })

  it("bordro sayfasındaki ikinci sekme tüm mükelleflerin kayıtlarını mükellef adıyla listeler", async () => {
    db.isHareketi.insert({
      mukellefId: "m_as",
      tur: "CIKIS",
      tarih: "2026-09-10",
      kisi: "Veli Can",
      durum: "BEKLIYOR",
      olusturanId: "p_2",
      olusturmaTarihi: new Date().toISOString(),
    })
    const { user, router } = renderRoute("/bordro", { as: TEST_USERS.personel })
    await user.click(
      await screen.findByRole("tab", { name: "İşe giriş / çıkış" })
    )
    expect(router.state.location.search).toBe("?sekme=hareket")
    const satir = await screen.findByRole("row", {
      name: "Veli Can İşten çıkış",
    })
    expect(satir).toHaveTextContent("Gecikti")
    expect(satir).toHaveTextContent("Öztürk İnşaat")
  })
})
