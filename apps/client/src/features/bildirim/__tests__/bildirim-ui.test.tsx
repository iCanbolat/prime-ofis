import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { logActivity } from "@/mocks/handlers/common"
import { TEST_USERS, renderRoute } from "@/test/render"

/** Yönetici, Mehmet'e (p_2) atanmış bir görevi Zeynep'ten Mehmet'e atar */
function gorevAtandi() {
  logActivity({
    aktorId: TEST_USERS.yonetici.id,
    eylem: "GOREV_ATANDI",
    hedefTip: "GOREV",
    hedefId: "o_banka",
    mukellefId: "m_ltd",
    aciklama: "Banka mutabakatı → Mehmet Kaya",
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
  // Hatırlatmalar testleri etkilemesin: geciken görev kalmasın
  for (const g of db.gorev.all())
    db.gorev.update(g.id, { sonTarih: "2026-12-31" })
  // ...vadesi geçmiş ücret borcu (aylık ücret yeniden borç üretmesin)...
  for (const h of db.cari.all()) db.cari.remove(h.id)
  for (const m of db.mukellef.all())
    db.mukellef.update(m.id, { ucret: undefined })
  // ...bordro girdisi bekleyen (çalışanı olan) mükellef kalmasın...
  for (const m of db.mukellef.all())
    db.mukellef.update(m.id, { calisanSayisi: 0, sgkIsyeriVar: false })
  // ...ve süresi yaklaşan tebligat
  for (const t of db.tebligat.all())
    db.tebligat.update(t.id, { durum: "KAPANDI" })
})
afterEach(() => vi.useRealTimers())

describe("Bildirim zili", () => {
  it("okunmamış sayısını gösterir; tıklanan bildirim okunur ve hedefe gider", async () => {
    gorevAtandi()
    const { router, user } = renderRoute("/", { as: TEST_USERS.personel })

    const zil = await screen.findByRole("button", {
      name: "Bildirimler, 1 okunmamış",
    })
    await user.click(zil)
    const panel = await screen.findByRole("region", { name: "Bildirimler" })
    const satir = await within(panel).findByRole("button", {
      name: /Bir görev size atandı/,
    })
    expect(satir).toHaveTextContent("Banka mutabakatı → Mehmet Kaya")
    expect(satir).toHaveTextContent("Okunmamış")

    await user.click(satir)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/gorevler")
    )
    expect(router.state.location.search).toBe("?gorev=o_banka")
    await waitFor(() =>
      expect(db.bildirim.all()[0]?.okuyanlar).toContain(TEST_USERS.personel.id)
    )
    // Görev detay paneli (modal) açık olduğundan header erişilebilirlik ağacından gizlidir
    expect(
      await screen.findByRole("button", { name: "Bildirimler", hidden: true })
    ).toBeInTheDocument()
  })

  it("tümünü okundu işaretler; okunmamış sekmesi boşalır", async () => {
    gorevAtandi()
    logActivity({
      aktorId: TEST_USERS.yonetici.id,
      eylem: "SABLON_GUNCELLENDI",
    })
    const { user } = renderRoute("/", { as: TEST_USERS.personel })

    await user.click(
      await screen.findByRole("button", { name: "Bildirimler, 2 okunmamış" })
    )
    const panel = await screen.findByRole("region", { name: "Bildirimler" })
    await within(panel).findByText("Mesaj şablonları güncellendi")
    await user.click(
      within(panel).getByRole("button", { name: "Tümünü okundu işaretle" })
    )
    await user.click(within(panel).getByRole("tab", { name: /Okunmamış/ }))
    expect(
      await within(panel).findByText("Okunmamış bildirim yok")
    ).toBeInTheDocument()
  })

  it("aktör kendi eyleminin bildirimini görmez", async () => {
    gorevAtandi()
    const { user } = renderRoute("/", { as: TEST_USERS.yonetici })
    await user.click(await screen.findByRole("button", { name: "Bildirimler" }))
    expect(await screen.findByText("Henüz bildirim yok")).toBeInTheDocument()
  })
})
