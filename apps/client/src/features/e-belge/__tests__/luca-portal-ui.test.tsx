import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { http, type ApiError } from "@/lib/http"
import { db } from "@/mocks/db"
import { lucaPortal } from "@/mocks/handlers/luca-hesap"
import { useAuthStore } from "@/features/auth/store"
import { TEST_USERS, renderRoute } from "@/test/render"
import { mockDogrulamaKodu } from "@prime/mock-data/kamu/mock-adapter"
import { LUCA_EK_FIRMALAR, lucaFirmaId } from "@prime/mock-data/luca-portal"
import type {
  KontorOzetResponse,
  LucaFirma,
  LucaFirmaAktarimSonucu,
  LucaHesapView,
  SenkronResponse,
} from "@prime/shared/types/api"

/** Bekleyen doğrulamanın (mock) kodu: portal oturum kimliği yalnızca mock DB'de */
const bekleyenKod = () =>
  mockDogrulamaKodu(db.lucaHesap.find("buro")!.dogrulamaOturumId!)
const durum = (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: ApiError) => e.status
  )
const [ekSirket, , , , ekSahis] = LUCA_EK_FIRMALAR

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 23, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe("Luca portalı (MSW)", () => {
  beforeEach(() => useAuthStore.setState({ user: TEST_USERS.yonetici }))

  it("fixture hesabı bağlı; şifre yanıtta dönmez; firma eşleme, senkron ve kontör", async () => {
    expect(await http.get<LucaHesapView>("/luca-hesap")).toMatchObject({
      kullanici: "12345678901",
      durum: "BAGLI",
    })
    const h = await http.put<LucaHesapView>("/luca-hesap", {
      kullanici: "12345678901",
      sifre: "gizli-sifre-1234",
    })
    expect(h).toMatchObject({ durum: "BAGLI", sifreIpucu: "1234" })
    expect(JSON.stringify(h)).not.toContain("gizli-sifre")

    const firmalar = await http.get<LucaFirma[]>("/luca-hesap/firmalar")
    expect(
      firmalar.find((f) => f.firmaId === lucaFirmaId("m_ltd"))
    ).toMatchObject({ mukellefId: "m_ltd" })
    expect(
      firmalar.find((f) => f.firmaId === lucaFirmaId("m_sahis"))
    ).toMatchObject({ eslesenMukellefId: "m_sahis" })
    expect(
      await durum(
        http.put("/e-belge/baglantilar/m_as", {
          lucaFirmaId: lucaFirmaId("m_ltd"),
        })
      )
    ).toBe(409)

    const s = await http.post<SenkronResponse>("/e-belge/senkron", {
      mukellefId: "m_ltd",
    })
    expect(s.hatali).toEqual([])
    const k = await http.get<KontorOzetResponse>("/e-belge/kontor")
    expect(k.lucaBakiye).toBe(k.kalan)
  })

  it("firmalardan mükellef: yeni açar, kayıtlı VKN'yi eşler, eşliyi atlar", async () => {
    useAuthStore.setState({ user: TEST_USERS.personel })
    expect(
      await durum(
        http.post("/luca-hesap/firmalar/aktar", {
          firmaIdler: [ekSirket!.firmaId],
          sorumluPersonelId: "p_2",
        })
      )
    ).toBe(403)
    useAuthStore.setState({ user: TEST_USERS.yonetici })
    const sonuc = await http.post<LucaFirmaAktarimSonucu>(
      "/luca-hesap/firmalar/aktar",
      {
        firmaIdler: [
          ekSirket!.firmaId,
          ekSahis!.firmaId,
          lucaFirmaId("m_sahis"),
          lucaFirmaId("m_ltd"),
        ],
        sorumluPersonelId: "p_2",
      }
    )
    expect(sonuc).toEqual({
      olusturulan: 2,
      eslenen: 1,
      atlanan: 1,
      hatalar: [],
    })
    const [yeni] = db.mukellef.where((m) => m.vkn === ekSirket!.vknTckn)
    expect(yeni).toMatchObject({
      unvan: ekSirket!.unvan,
      vergiDairesi: ekSirket!.vergiDairesi,
      sorumluPersonelId: "p_2",
    })
    expect(
      db.baglanti.where((b) => b.mukellefId === yeni!.id)[0]?.lucaFirmaId
    ).toBe(ekSirket!.firmaId)
    expect(db.mukellef.where((m) => m.tckn === ekSahis!.vknTckn)[0]?.tur).toBe(
      "SAHIS"
    )
  })
})

describe("Luca portalı — arayüz", () => {
  it("yönetici hesabı günceller; doğrulama kodu personel tarafından girilir", async () => {
    const { user } = renderRoute("/ayarlar/luca-hesap", {
      as: TEST_USERS.yonetici,
    })
    const alan = await screen.findByLabelText("Luca kullanıcı adı")
    await user.clear(alan)
    await user.type(alan, "dogrulama-01")
    await user.type(screen.getByLabelText("Şifre"), "sifre-9876")
    await user.click(screen.getByRole("button", { name: "Kaydet ve bağlan" }))

    const dialog = await screen.findByRole("dialog", {
      name: "Luca doğrulama kodu",
    })
    expect(
      await within(dialog).findByAltText("Luca doğrulama görseli")
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Görseldeki kod"), "00000")
    await user.click(within(dialog).getByRole("button", { name: "Doğrula" }))
    expect(
      await within(dialog).findByText("Doğrulama kodu hatalı")
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText("Görseldeki kod"),
      bekleyenKod()
    )
    await user.click(within(dialog).getByRole("button", { name: "Doğrula" }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(await screen.findByText("Bağlı")).toBeInTheDocument()
  })

  it("senkron doğrulamaya takılırsa kod istenir, sonra senkron sürer", async () => {
    useAuthStore.setState({ user: TEST_USERS.yonetici })
    await http
      .put("/luca-hesap", { kullanici: "dogrulama-01", sifre: "sifre-9876" })
      .catch(() => undefined)
    await http.post("/luca-dogrulama", { kod: bekleyenKod() })
    // Luca oturumu sona erdi: yeniden girişte doğrulama istenir
    lucaPortal.oturumlariDusur()

    const { user } = renderRoute("/e-belge/baglantilar", {
      as: TEST_USERS.personel,
    })
    await user.click(
      await screen.findByRole("button", { name: "Şimdi senkronize et" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Luca doğrulama kodu",
    })
    await within(dialog).findByAltText("Luca doğrulama görseli")
    await user.type(
      within(dialog).getByLabelText("Görseldeki kod"),
      bekleyenKod()
    )
    await user.click(within(dialog).getByRole("button", { name: "Doğrula" }))
    expect(await screen.findByText(/Senkronize edildi/)).toBeInTheDocument()
  })

  it("mükellef listesinden Luca firmaları aktarılır", async () => {
    const { user } = renderRoute("/mukellefler", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("button", { name: /Luca'dan aktar/ })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Luca'dan mükellef aktar",
    })
    const liste = await within(dialog).findByRole("list", {
      name: "Luca firmaları",
    })
    // m_sahis kayıtlı: eşlenecek; ek firmalar yeni mükellef
    expect(
      within(liste)
        .getByRole("checkbox", { name: /^Ali Veli/ })
        .closest("li")
    ).toHaveTextContent("Kayıtlı mükellefe eşlenecek")
    await user.click(
      within(liste).getByRole("checkbox", {
        name: new RegExp(`^${ekSirket!.unvan}`),
      })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "1 firmayı aktar" })
    )
    expect(await screen.findByText("1 yeni mükellef")).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(liste).queryByRole("checkbox", {
          name: new RegExp(`^${ekSirket!.unvan}`),
        })
      ).not.toBeInTheDocument()
    )
    expect(db.mukellef.where((m) => m.vkn === ekSirket!.vknTckn)).toHaveLength(
      1
    )
  })

  it("personel aktarım butonunu görmez", async () => {
    renderRoute("/mukellefler", { as: TEST_USERS.personel })
    await screen.findByRole("heading", { name: "Mükellefler" })
    expect(
      screen.queryByRole("button", { name: /Luca'dan aktar/ })
    ).not.toBeInTheDocument()
  })

  it("fatura detayında kabul / red yerine Luca notu", async () => {
    renderRoute("/e-belge/e-fatura?fatura=f_bekleyen", {
      as: TEST_USERS.personel,
    })
    expect(
      await screen.findByText(/Kabul veya red yanıtını Luca'da verin/)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kabul et" })
    ).not.toBeInTheDocument()
  })
})
