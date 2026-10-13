import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GOREV_DURUM_SIRASI,
  GOREV_SAYFA_BOYUTU,
} from "@prime/shared/gorev/sabitler"
import { useGorevTercihleri } from "@/features/gorev/store"
import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"
import type { GorevDurum } from "@prime/shared/types/domain"

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

/**
 * jsdom yerleşim hesaplamaz; dnd-kit'in çarpışma tespiti için sütunlar yan yana 300 px
 * aralıklı, kartlar kendi sütununun içinde konumlanmış gibi davranılır. Sürükleme
 * kopyası (DragOverlay) tarayıcıdaki gibi asıl kartın yerinde başlar.
 */
function yerlesimiSahtele() {
  const orijinal = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const kopya =
        this.tagName === "ARTICLE" && !this.closest("[data-kanban-sutun]")
      const hedef =
        (kopya &&
          [...document.querySelectorAll("[data-kanban-sutun] article")].find(
            (a) =>
              a.getAttribute("aria-label") === this.getAttribute("aria-label")
          )) ||
        this
      const sutun = hedef.closest<HTMLElement>("[data-kanban-sutun]")
      if (!sutun) return orijinal.call(this)
      const i = GOREV_DURUM_SIRASI.indexOf(
        sutun.dataset.kanbanSutun as GorevDurum
      )
      return hedef === sutun
        ? rect(i * 300, 0, 280, 800)
        : rect(i * 300 + 10, 60, 260, 100)
    }
  )
}

const sutun = (ad: string) =>
  screen.getByRole("region", { name: `${ad} sütunu` })
const kart = (ad: RegExp) => screen.getByRole("article", { name: ad })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Görevler — kanban", () => {
  it("görevler durum sütunlarında; kartta kontrol listesi ilerlemesi ve gecikme", async () => {
    renderRoute("/gorevler", { as: TEST_USERS.yonetici })
    await screen.findByRole("region", { name: "Devam sütunu" })

    expect(within(sutun("Yapılacak")).getAllByRole("article")).toHaveLength(2)
    expect(within(sutun("Devam")).getAllByRole("article")).toHaveLength(2)
    expect(within(sutun("Kontrol")).getAllByRole("article")).toHaveLength(1)
    expect(within(sutun("Tamam")).getAllByRole("article")).toHaveLength(1)

    const kdv = within(sutun("Devam")).getByRole("article", {
      name: /KDV beyannamesi — Ağustos 2026 · Çınar/,
    })
    expect(within(kdv).getByText("2/4")).toBeInTheDocument()
    expect(
      within(kdv).getByRole("progressbar", {
        name: "Kontrol listesi ilerlemesi: 2/4",
      })
    ).toHaveAttribute("aria-valuenow", "50")

    const vergi = kart(/Vergi levhası güncelleme/)
    expect(within(vergi).getByText(/gecikti/)).toBeInTheDocument()
    expect(
      within(sutun("Yapılacak")).getByText("1 gecikmiş ·")
    ).toBeInTheDocument()
  })

  it("klavyeyle sürükle: Devam → Kontrol; durum ve aktivite güncellenir", async () => {
    yerlesimiSahtele()
    const { user } = renderRoute("/gorevler", { as: TEST_USERS.personel })
    await screen.findByRole("region", { name: "Devam sütunu" })

    const tutamak = within(kart(/Banka mutabakatı/)).getByRole("button", {
      name: /Banka mutabakatı .* görevini taşı/,
    })
    tutamak.focus()
    await user.keyboard("[Space]")
    await user.keyboard("[ArrowRight]")
    await user.keyboard("[Space]")

    await waitFor(() =>
      expect(
        within(sutun("Kontrol")).getByRole("article", {
          name: /Banka mutabakatı/,
        })
      ).toBeInTheDocument()
    )
    await waitFor(() => expect(db.gorev.find("o_banka")?.durum).toBe("KONTROL"))
    expect(
      db.aktivite.where((a) => a.eylem === "GOREV_DURUMU_DEGISTI")
    ).toMatchObject([
      { aktorId: "p_2", hedefId: "o_banka", aciklama: /Devam → Kontrol/ },
    ])
  })

  it("personel başkasının görevini Tamam'a taşıyamaz; yönetici taşıyabilir", async () => {
    yerlesimiSahtele()
    const { user } = renderRoute("/gorevler", { as: TEST_USERS.personel })
    await screen.findByRole("region", { name: "Kontrol sütunu" })

    // Zeynep'in (p_3) Kontrol'deki görevi
    const tutamak = within(kart(/Muhtasar/)).getByRole("button", {
      name: /görevini taşı/,
    })
    tutamak.focus()
    await user.keyboard("[Space]")
    await user.keyboard("[ArrowRight]")
    await user.keyboard("[Space]")

    expect(
      await screen.findByText("Bu görevi tamamlayamazsınız")
    ).toBeInTheDocument()
    expect(db.gorev.find("o_muh_ltd")?.durum).toBe("KONTROL")
    expect(
      within(sutun("Kontrol")).getByRole("article", { name: /Muhtasar/ })
    ).toBeInTheDocument()

    // Kart menüsünde de "Tamam" pasif
    await user.click(
      within(kart(/Muhtasar/)).getByRole("button", { name: /işlemleri/ })
    )
    expect(
      await screen.findByRole("menuitem", { name: "Tamam" })
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("yönetici kart menüsünden Tamam'a taşır → takvimde beyan onaylanır", async () => {
    const { user } = renderRoute("/gorevler", { as: TEST_USERS.yonetici })
    await screen.findByRole("region", { name: "Kontrol sütunu" })
    await user.click(
      within(kart(/Muhtasar/)).getByRole("button", { name: /işlemleri/ })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Tamam" }))

    await waitFor(() => expect(db.gorev.find("o_muh_ltd")?.durum).toBe("TAMAM"))
    expect(db.takvim.find("m_ltd:MUHTASAR_SGK:2026-08")?.durum).toBe(
      "ONAYLANDI"
    )
    expect(
      await within(sutun("Tamam")).findByRole("article", { name: /Muhtasar/ })
    ).toBeInTheDocument()
  })

  it("atanan avatarları çoklu seçilir; tip ve gecikenler sheet'ten uygulanır", async () => {
    const { router, user } = renderRoute("/gorevler", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("region", { name: "Devam sütunu" })
    const atananlar = screen.getByRole("group", {
      name: "Atanan kişiye göre filtrele",
    })

    await user.click(
      within(atananlar).getByRole("button", { name: "Mehmet Kaya (siz)" })
    )
    expect(router.state.location.search).toBe("?atanan=p_2")
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: /Muhtasar/ })).toBeNull()
    )
    expect(screen.getAllByRole("article")).toHaveLength(4)

    // İkinci kişi eklenince ikisinin görevleri birlikte görünür
    const zeynep = within(atananlar).getByRole("button", {
      name: "Zeynep Demir",
    })
    await user.click(zeynep)
    expect(zeynep).toHaveAttribute("aria-pressed", "true")
    expect(
      new URLSearchParams(router.state.location.search).getAll("atanan")
    ).toEqual(["p_2", "p_3"])
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(6))

    await user.click(screen.getByRole("button", { name: "Filtreler" }))
    const sheet = await screen.findByRole("dialog", { name: "Filtreler" })
    await user.click(within(sheet).getByRole("checkbox", { name: "KDV" }))
    await user.click(
      within(sheet).getByRole("checkbox", { name: "Yalnızca gecikenler" })
    )
    await user.click(within(sheet).getByRole("button", { name: "Uygula" }))
    expect(router.state.location.search).toBe(
      "?atanan=p_2&atanan=p_3&tip=KDV&geciken=1"
    )
    expect(
      screen.getByRole("button", { name: "Filtreler, 2 filtre seçili" })
    ).toBeInTheDocument()

    await user.click(
      within(atananlar).getByRole("button", {
        name: "Atanan filtresini temizle",
      })
    )
    expect(router.state.location.search).toBe("?tip=KDV&geciken=1")
  })

  it("paylaşılan atanan=benim linki oturumdaki kullanıcıyı seçili gösterir", async () => {
    renderRoute("/gorevler?atanan=benim", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("button", { name: "Mehmet Kaya (siz)" })
    ).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(4))
  })

  it("görünüm tercihi saklanır; liste görünümünde toplu atama", async () => {
    const { user, unmount } = renderRoute("/gorevler", {
      as: TEST_USERS.yonetici,
    })
    await screen.findByRole("region", { name: "Devam sütunu" })
    await user.click(screen.getByRole("button", { name: "Liste" }))
    const tablo = await screen.findByRole("table", { name: "Görevler" })
    unmount()

    const ikinci = renderRoute("/gorevler", { as: TEST_USERS.yonetici })
    const tablo2 = await screen.findByRole("table", { name: "Görevler" })
    expect(tablo).not.toBe(tablo2)

    await ikinci.user.click(
      within(tablo2).getByRole("checkbox", { name: /Vergi levhası güncelleme/ })
    )
    await ikinci.user.click(
      within(tablo2).getByRole("checkbox", { name: /Banka mutabakatı/ })
    )
    const cubuk = screen.getByRole("region", { name: "Toplu işlemler" })
    expect(within(cubuk).getByText("2 görev seçildi")).toBeInTheDocument()
    await ikinci.user.click(
      within(cubuk).getByRole("combobox", { name: "Atanacak personel" })
    )
    await ikinci.user.click(
      await screen.findByRole("option", { name: /Emre Şahin/ })
    )
    await ikinci.user.click(within(cubuk).getByRole("button", { name: "Ata" }))

    await waitFor(() => expect(db.gorev.find("o_banka")?.atananId).toBe("p_4"))
    expect(db.gorev.find("o_vergi")?.atananId).toBe("p_4")
  })

  it("liste görünümü sayfalanır; filtre değişince ilk sayfaya döner", async () => {
    const ornek = db.gorev.find("o_banka")!
    db.gorev.insertMany(
      Array.from({ length: 30 }, (_, i) => ({
        ...ornek,
        id: `o_ek_${i}`,
        baslik: `Ek görev ${i}`,
      }))
    )
    const toplam = db.gorev.count()
    useGorevTercihleri.setState({ gorunum: "liste" })
    const { user } = renderRoute("/gorevler?sayfa=2", {
      as: TEST_USERS.yonetici,
    })

    const tablo = await screen.findByRole("table", { name: "Görevler" })
    const nav = screen.getByRole("navigation", { name: "Sayfalama" })
    expect(within(nav).getByText("Sayfa 2 / 2")).toBeInTheDocument()
    expect(within(tablo).getAllByRole("row")).toHaveLength(
      toplam - GOREV_SAYFA_BOYUTU + 1
    )

    await user.click(within(nav).getByRole("button", { name: "Önceki" }))
    await waitFor(() =>
      expect(within(tablo).getAllByRole("row")).toHaveLength(
        GOREV_SAYFA_BOYUTU + 1
      )
    )
    await user.click(within(nav).getByRole("button", { name: "Sonraki" }))
    expect(await within(nav).findByText("Sayfa 2 / 2")).toBeInTheDocument()

    await user.type(screen.getByRole("searchbox"), "Ek görev")
    await waitFor(() =>
      expect(
        screen.getByRole("navigation", { name: "Sayfalama" })
      ).toHaveTextContent("Sayfa 1 / 2")
    )
  })
})

describe("Görev detayı", () => {
  it("kontrol listesi işaretlenir, @bahsetmeli yorum eklenir", async () => {
    const { user } = renderRoute("/gorevler?gorev=o_kdv_as", {
      as: TEST_USERS.personel,
    })
    const panel = await screen.findByRole("dialog", { name: /Öztürk İnşaat/ })

    await user.click(
      await within(panel).findByRole("checkbox", { name: "Faturalar alındı" })
    )
    await waitFor(() =>
      expect(db.gorev.find("o_kdv_as")?.checklist[0]).toMatchObject({
        tamam: true,
        tamamlayanId: "p_2",
      })
    )
    expect(await within(panel).findByText("1/4 · %25")).toBeInTheDocument()

    const yorum = within(panel).getByRole("textbox", { name: "Yorum" })
    await user.type(yorum, "@Zey")
    await user.click(
      within(panel).getByRole("button", { name: "@Zeynep Demir" })
    )
    await user.type(yorum, "tahakkuku kontrol eder misin?")
    await user.click(within(panel).getByRole("button", { name: "Yorum ekle" }))

    const liste = await within(panel).findByRole("list", {
      name: "Yorum listesi",
    })
    expect(within(liste).getByText("@Zeynep Demir").tagName).toBe("MARK")
    expect(db.gorev.find("o_kdv_as")?.yorumlar).toMatchObject([
      {
        metin: "@Zeynep Demir tahakkuku kontrol eder misin?",
        bahsedilenler: ["p_3"],
      },
    ])
  })

  it("bağlı evrak talebi listelenir ve talep detayında görev bağlantısı görünür", async () => {
    renderRoute("/gorevler?gorev=o_banka", { as: TEST_USERS.personel })
    const panel = await screen.findByRole("dialog", { name: /Çınar Yazılım/ })
    const bolum = await within(panel).findByRole("region", {
      name: "Bağlı evrak talepleri",
    })
    expect(
      within(bolum).getByRole("link", { name: /fiş \/ fatura/ })
    ).toHaveAttribute("href", "/evrak-talepleri?talep=e_aktif")
  })
})

describe("Dönem görevleri ve diğer ekranlar", () => {
  it("önizleme mevcut görevleri atlar, yalnızca eksik olanı oluşturur", async () => {
    const { user } = renderRoute("/gorevler", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("button", { name: /Dönem görevlerini oluştur/ })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Dönem görevlerini oluştur",
    })
    const tablo = await within(dialog).findByRole("table", {
      name: "Oluşturulacak görevler",
    })
    expect(within(tablo).getAllByText("Zaten var")).toHaveLength(2)
    expect(
      within(tablo).getByRole("checkbox", { name: "Ali Veli seç" })
    ).toBeChecked()

    await user.click(
      within(dialog).getByRole("button", { name: "1 görev oluştur" })
    )
    await waitFor(() =>
      expect(
        db.gorev.where((g) => g.otomatikAnahtar === "m_sahis:KDV:2026-08")
      ).toHaveLength(1)
    )
    expect(db.gorev.count()).toBe(7)
  })

  it("mükellef kartından görev eklenir, beyan görevinde son gün takvimden gelir", async () => {
    const { router, user } = renderRoute("/mukellefler/m_sahis/genel", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("button", { name: "Görev ekle" }))
    const dialog = await screen.findByRole("dialog", { name: "Yeni görev" })

    await user.click(within(dialog).getByRole("combobox", { name: "Tip" }))
    await user.click(
      await screen.findByRole("option", { name: "KDV beyannamesi" })
    )
    expect(within(dialog).getByLabelText("Başlık")).toHaveValue(
      "KDV beyannamesi — Ağustos 2026"
    )
    expect(within(dialog).getByLabelText("Son tarih")).toHaveTextContent(
      "28 Eylül 2026"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Görev oluştur" })
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/mukellefler/m_sahis/gorevler"
      )
    )
    expect(
      db.gorev.where((g) => g.otomatikAnahtar === "m_sahis:KDV:2026-08")
    ).toMatchObject([{ atananId: "p_2", checklist: expect.any(Array) }])
    expect(
      await screen.findByRole("dialog", { name: /Ali Veli/ })
    ).toBeInTheDocument()
  })

  it("atanan avatarları büro geneli iş yükünü gösterir", async () => {
    const { user } = renderRoute("/gorevler?atanan=p_3", {
      as: TEST_USERS.yonetici,
    })
    const atananlar = await screen.findByRole("group", {
      name: "Atanan kişiye göre filtrele",
    })
    // Filtre başka kişiyi seçse de sayılar büro genelidir
    const mehmet = within(atananlar).getByRole("button", {
      name: "Mehmet Kaya",
    })
    await waitFor(() =>
      expect(mehmet).toHaveAccessibleDescription("3 açık, 1 gecikmiş görev")
    )
    // Rozet yalnızca ilgili avatarın üzerine gelinince görünür
    expect(within(mehmet).getByText("3")).toHaveClass(
      "opacity-0",
      "group-hover/avatar:opacity-100"
    )
    expect(
      screen.queryByRole("button", { name: "Özet" })
    ).not.toBeInTheDocument()
    await user.click(mehmet)
    expect(mehmet).toHaveAttribute("aria-pressed", "true")
  })

  it("gösterge panelinde geciken bağımsız görev Yapılacaklar'da", async () => {
    const { user } = renderRoute("/", { as: TEST_USERS.yonetici })
    await user.click(await screen.findByRole("tab", { name: /Gecikenler/ }))
    expect(
      await within(screen.getByRole("tabpanel")).findByRole("listitem", {
        name: /^Görev: Vergi levhası güncelleme/,
      })
    ).toBeInTheDocument()
  })
})
