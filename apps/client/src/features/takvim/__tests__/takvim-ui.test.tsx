import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { TEST_USERS, renderRoute } from "@/test/render"

beforeEach(() => {
  // Bugün: 23 Eylül 2026 Çarşamba. Yalnızca Date sahtelenir.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("Takvim — ay görünümü", () => {
  it("bu ayı gösterir; günlerde yükümlülük sayısı ve bugün işareti vardır", async () => {
    renderRoute("/takvim", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("heading", { name: "Eylül 2026" })
    ).toBeInTheDocument()

    // 28 Eylül: Şahıs KDV + Ltd ve A.Ş. KDV ve MUHSGK
    expect(
      await screen.findByRole("button", {
        name: "28 Eylül Pazartesi, 5 yükümlülük",
      })
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "30 Eylül Çarşamba, 4 yükümlülük" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^23 Eylül Çarşamba/ })
    ).toHaveAttribute("aria-current", "date")
    expect(
      screen.getByRole("button", { name: "1 Eylül Salı, yükümlülük yok" })
    ).toBeDisabled()
  })

  it("ay değiştirir, URL'i günceller ve Bugün ile geri döner", async () => {
    const { router, user } = renderRoute("/takvim", { as: TEST_USERS.personel })
    await screen.findByRole("heading", { name: "Eylül 2026" })

    await user.click(screen.getByRole("button", { name: "Sonraki ay" }))
    expect(
      await screen.findByRole("heading", { name: "Ekim 2026" })
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("?ay=2026-10")
    // 29 Ekim resmi tatil olarak işaretlenir
    expect(
      await screen.findByRole("button", {
        name: /^29 Ekim Perşembe, Cumhuriyet Bayramı/,
      })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bugün" }))
    expect(
      await screen.findByRole("heading", { name: "Eylül 2026" })
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("")
  })

  it("güne tıklayınca panelde yükümlülükler listelenir ve durum değiştirilebilir", async () => {
    const { user } = renderRoute("/takvim", { as: TEST_USERS.personel })
    await user.click(
      await screen.findByRole("button", {
        name: "28 Eylül Pazartesi, 5 yükümlülük",
      })
    )

    const panel = await screen.findByRole("dialog", { name: /28 Eylül 2026/ })
    expect(within(panel).getAllByRole("listitem")).toHaveLength(5)
    // MUHSGK'nın yasal son günü Cumartesi olduğu için kaydırıldı bilgisi
    expect(
      within(panel).getAllByText(
        /26\.09\.2026 hafta sonu olduğu için kaydırıldı/
      )
    ).toHaveLength(2)

    await user.click(
      within(panel).getByRole("combobox", {
        name: "Çınar Yazılım San. ve Tic. Ltd. Şti. KDV Ağustos 2026 durumu",
      })
    )
    await user.click(await screen.findByRole("option", { name: "Onaylandı" }))

    await waitFor(() =>
      expect(db.takvim.find("m_ltd:KDV:2026-08")).toMatchObject({
        durum: "ONAYLANDI",
        guncelleyenId: "p_2",
      })
    )
    await waitFor(() =>
      expect(
        within(panel).getByRole("combobox", {
          name: "Çınar Yazılım San. ve Tic. Ltd. Şti. KDV Ağustos 2026 durumu",
        })
      ).toHaveTextContent("Onaylandı")
    )
  })

  it("yükümlülük türü filtresi URL'e yazılır ve sayıları daraltır", async () => {
    const { router, user } = renderRoute("/takvim", { as: TEST_USERS.personel })
    await screen.findByRole("button", {
      name: "28 Eylül Pazartesi, 5 yükümlülük",
    })

    await user.click(
      screen.getByRole("button", { name: /Yükümlülük filtresi/ })
    )
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "KDV beyannamesi" })
    )
    await user.keyboard("{Escape}")

    expect(
      await screen.findByRole("button", {
        name: "28 Eylül Pazartesi, 3 yükümlülük",
      })
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe("?tip=KDV")
    expect(
      screen.getByRole("button", { name: "30 Eylül Çarşamba, yükümlülük yok" })
    ).toBeDisabled()
  })

  it("sorumlu filtresi yalnızca o personelin mükelleflerini gösterir", async () => {
    renderRoute("/takvim?sorumlu=p_3", { as: TEST_USERS.personel })
    expect(
      await screen.findByRole("button", {
        name: "28 Eylül Pazartesi, 2 yükümlülük",
      })
    ).toBeInTheDocument()
  })
})

describe("Takvim — liste görünümü", () => {
  it("liste görünümüne geçer, tarihe göre gruplar", async () => {
    const { router, user } = renderRoute("/takvim", { as: TEST_USERS.personel })
    await screen.findByRole("heading", { name: "Eylül 2026" })
    await user.click(screen.getByRole("button", { name: "Liste" }))

    expect(router.state.location.search).toBe("?gorunum=liste")
    const gun = await screen.findByRole("region", { name: "28.09.2026" })
    expect(within(gun).getAllByRole("listitem")).toHaveLength(5)
    expect(
      screen.getByRole("region", { name: "30.09.2026" })
    ).toBeInTheDocument()
  })

  it("önümüzdeki 7 gün ve gecikenler aralıkları", async () => {
    const { user } = renderRoute("/takvim?gorunum=liste", {
      as: TEST_USERS.personel,
    })
    await screen.findByRole("region", { name: "28.09.2026" })

    await user.click(screen.getByRole("button", { name: "Önümüzdeki 7 gün" }))
    expect(
      await screen.findByText("9 yükümlülük · 0 onaylandı")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Gecikenler" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "28.09.2026" })
      ).not.toBeInTheDocument()
    )
    const gecikti = await screen.findAllByText("Gecikti")
    expect(gecikti.length).toBeGreaterThan(0)
    // Gecikenler görünümünde durum filtresi zaten sabit olduğu için gizlenir
    expect(
      screen.queryByRole("combobox", { name: "Beyan durumu" })
    ).not.toBeInTheDocument()
  })

  it("onaylanan gecikmiş yükümlülük gecikenler listesinden çıkar", async () => {
    const { user } = renderRoute(
      "/takvim?gorunum=liste&aralik=geciken&tip=KDV&sorumlu=p_3",
      {
        as: TEST_USERS.personel,
      }
    )
    const kdv = await screen.findByRole("combobox", {
      name: "Çınar Yazılım San. ve Tic. Ltd. Şti. KDV Temmuz 2026 durumu",
    })
    await user.click(kdv)
    await user.click(await screen.findByRole("option", { name: "Onaylandı" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", {
          name: "Çınar Yazılım San. ve Tic. Ltd. Şti. KDV Temmuz 2026 durumu",
        })
      ).not.toBeInTheDocument()
    )
  })
})

describe("Mükellef kartı — Takvim sekmesi", () => {
  it("tabi olunan yükümlülükleri ve yaklaşan/geçmiş listeyi gösterir", async () => {
    renderRoute("/mukellefler/m_sahis/takvim", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Tabi olduğu yükümlülükler")
    ).toBeInTheDocument()
    expect(screen.getByText("KDV beyannamesi")).toBeInTheDocument()
    expect(screen.getByText("Geçici vergi")).toBeInTheDocument()
    expect(screen.getByText("Yıllık gelir vergisi")).toBeInTheDocument()
    expect(screen.queryByText("Kurumlar vergisi")).not.toBeInTheDocument()

    const ilkYaklasan = await screen.findByRole("region", {
      name: "28.09.2026",
    })
    expect(within(ilkYaklasan).getByText("Ağustos 2026")).toBeInTheDocument()
  })
})
