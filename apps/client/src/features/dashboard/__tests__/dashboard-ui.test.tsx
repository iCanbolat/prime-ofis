import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  // Bugün: 23 Eylül 2026 Çarşamba
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

/** Yapılacaklar sekmesindeki sayaç */
const sekmeSayisi = (ad: RegExp) =>
  Number(
    within(screen.getByRole("tab", { name: ad })).getByText(/^\d+$/).textContent
  )

const dikkatSatiri = (etiket: string) =>
  within(screen.getByRole("list", { name: "Dikkat gerektirenler" }))
    .getByText(etiket)
    .closest("[data-slot=dikkat]") as HTMLElement

describe("Gösterge paneli", () => {
  it("Yapılacaklar sekme sayaçları: bu hafta, geciken, onay bekleyen", async () => {
    db.takvim.insert({
      id: "m_as:KDV:2026-08",
      mukellefId: "m_as",
      tip: "KDV",
      donem: "2026-08",
      durum: "HAZIRLANDI",
      guncelleyenId: "p_2",
      guncellemeTarihi: "2026-09-20T10:00:00Z",
    })
    renderRoute("/", { as: TEST_USERS.yonetici })

    await waitFor(() => expect(sekmeSayisi(/^Bu hafta/)).toBe(9))
    expect(sekmeSayisi(/^Onay bekleyen/)).toBe(1)
    expect(sekmeSayisi(/^Gecikenler/)).toBeGreaterThan(0)
    expect(screen.queryByRole("list", { name: "Özet" })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("list", { name: "Personel iş yükü" })
    ).not.toBeInTheDocument()
  })

  it("bağımsız görevler Yapılacaklar'da görünür, beyana bağlı görevler tekrarlanmaz", async () => {
    const { user } = renderRoute("/", { as: TEST_USERS.yonetici })
    await screen.findByRole("tabpanel")
    const panel = () => screen.getByRole("tabpanel")

    // o_kdv_ltd (28.09, beyana bağlı) yalnızca beyan satırındaki görev linkiyle görünür
    const gun = await within(panel()).findByRole("region", {
      name: "28.09.2026",
    })
    expect(
      within(gun).queryByRole("listitem", { name: /^Görev:/ })
    ).not.toBeInTheDocument()
    expect(
      within(gun).getAllByRole("link", { name: /^Görev: / }).length
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole("tab", { name: /Gecikenler/ }))
    const gorev = await within(panel()).findByRole("listitem", {
      name: /^Görev: Vergi levhası güncelleme/,
    })
    expect(
      within(gorev).getByRole("link", { name: "Vergi levhası güncelleme" })
    ).toHaveAttribute("href", "/gorevler?gorev=o_vergi")
    expect(within(gorev).getByText("Gecikti")).toBeInTheDocument()
  })

  it("Yapılacaklar sekmeleri listeyi değiştirir", async () => {
    db.takvim.insert({
      id: "m_ltd:KDV:2026-08",
      mukellefId: "m_ltd",
      tip: "KDV",
      donem: "2026-08",
      durum: "HAZIRLANDI",
      guncelleyenId: "p_3",
      guncellemeTarihi: "2026-09-20T10:00:00Z",
    })
    const { user } = renderRoute("/", { as: TEST_USERS.yonetici })

    await screen.findByRole("tabpanel")
    const panel = () => screen.getByRole("tabpanel")
    expect(
      await within(panel()).findByRole("region", { name: "28.09.2026" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /Gecikenler/ }))
    expect(await within(panel()).findAllByText("Gecikti")).not.toHaveLength(0)

    await user.click(screen.getByRole("tab", { name: /Onay bekleyen/ }))
    const onay = within(panel()).getAllByRole("listitem")
    expect(onay).toHaveLength(1)
    expect(onay[0]).toHaveAccessibleName(
      /Çınar Yazılım .* KDV beyannamesi Ağustos 2026/
    )
  })

  it("dikkat kartı: yalnızca sıfırdan büyük uyarılar, tehlike önce", async () => {
    renderRoute("/", { as: TEST_USERS.yonetici })
    const liste = await screen.findByRole("list", {
      name: "Dikkat gerektirenler",
    })
    // Fixture: A.Ş. imza sirkülerinin süresi dolmuş, Ltd faaliyet belgesine 20 gün var
    await waitFor(() =>
      expect(
        within(dikkatSatiri("Süresi dolan belge")).getByText("1")
      ).toBeInTheDocument()
    )
    expect(
      within(dikkatSatiri("30 gün içinde dolacak belge")).getByText("1")
    ).toBeInTheDocument()
    // Satırlar hedef sayfada aynı kümeyi gösteren filtreyle açılır
    expect(
      within(dikkatSatiri("Süresi dolan belge")).getByRole("link")
    ).toHaveAttribute(
      "href",
      "/arsiv?gecerlilik=doldu&sirala=gecerlilikTarihi&gorunum=liste"
    )
    expect(
      within(dikkatSatiri("30 gün içinde dolacak belge")).getByRole("link")
    ).toHaveAttribute(
      "href",
      "/arsiv?gecerlilik=yakinda&sirala=gecerlilikTarihi&gorunum=liste"
    )
    // Fixture'da yalnızca Ltd'nin eksiği var: doğrudan klasörü açılır
    expect(
      within(dikkatSatiri("Eksik zorunlu evrak")).getByRole("link")
    ).toHaveAttribute("href", "/arsiv?mukellef=m_ltd")

    const satirlar = within(liste)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "")
    const tehlike = satirlar.findIndex((t) => t.includes("Süresi dolan belge"))
    const uyari = satirlar.findIndex((t) =>
      t.includes("30 gün içinde dolacak belge")
    )
    expect(tehlike).toBeLessThan(uyari)
  })

  it("bordro uyarıları: girdisi gelmeyen dönemler dikkat kartında sayılır ve bordro sayfasına gider", async () => {
    renderRoute("/", { as: TEST_USERS.yonetici })
    // m_ltd + m_as × (Ağustos yaklaşıyor, Temmuz gecikti): hepsi girdi bekliyor
    await waitFor(() =>
      expect(
        within(dikkatSatiri("Bordro girdisi gelmedi")).getByText("4")
      ).toBeInTheDocument()
    )
    expect(
      within(dikkatSatiri("Bordro girdisi gelmedi")).getByRole("link")
    ).toHaveAttribute("href", "/bordro?durum=BEKLENIYOR")
  })

  it("'Benim mükelleflerim' yalnızca kullanıcının mükelleflerini sayar", async () => {
    const { router, user } = renderRoute("/", { as: TEST_USERS.personel }) // Mehmet: m_sahis, m_as
    await screen.findByText("Eksik zorunlu evrak")
    await user.click(
      screen.getByRole("button", { name: "Benim mükelleflerim" })
    )

    expect(router.state.location.search).toBe("?kapsam=benim")
    await waitFor(() => expect(sekmeSayisi(/^Bu hafta/)).toBe(5))
    // Ltd (Zeynep'in) eksik evrak uyarısı bu kapsamda görünmez
    await waitFor(() =>
      expect(screen.queryByText("Eksik zorunlu evrak")).not.toBeInTheDocument()
    )
  })

  it("göstergeler ve 'Takvimde aç' takvimin ilgili liste görünümüne gider", async () => {
    const { router, user } = renderRoute("/?kapsam=benim", {
      as: TEST_USERS.personel,
    })
    await user.click(await screen.findByRole("link", { name: "Takvimde aç" }))
    await waitFor(() => expect(router.state.location.pathname).toBe("/takvim"))
    expect(router.state.location.search).toBe(
      "?gorunum=liste&aralik=hafta&sorumlu=p_2"
    )
  })

  it("14 günlük yoğunluk şeridi bugünden başlar", async () => {
    renderRoute("/", { as: TEST_USERS.yonetici })
    const serit = await screen.findByRole("list", { name: "Günlük yoğunluk" })
    const gunler = within(serit).getAllByRole("link")
    expect(gunler).toHaveLength(14)
    expect(gunler[0]).toHaveAccessibleName(/^23 Eylül Çarşamba/)
    expect(gunler[5]).toHaveAccessibleName("28 Eylül Pazartesi: 5 yükümlülük")
  })
})
