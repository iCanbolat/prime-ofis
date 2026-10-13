import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useVaultStore } from "@/features/kasa/store"
import { decryptJson } from "@/lib/crypto"
import { db } from "@/mocks/db"
import { DEMO_KASA_SIFRESI } from "@/mocks/vault"
import { fixtureSifresi, kasayiAc } from "@/test/kasa"
import { TEST_USERS, renderRoute } from "@/test/render"
import type { CredentialSecret } from "@prime/shared/types/domain"

const kart = (ad: string) =>
  screen.findByRole("region", { name: `${ad} şifresi` })

describe("Mükellef şifreler sekmesi — kasa kilitli", () => {
  it("kullanıcı adları görünür, şifreler maskelidir; eksik sistemler işaretlenir", async () => {
    renderRoute("/mukellefler/m_as/sifreler", { as: TEST_USERS.personel })
    const gib = await kart("GİB")
    expect(
      within(gib).getByText(fixtureSifresi("m_as", "GIB").kullaniciAdi)
    ).toBeInTheDocument()
    expect(within(gib).getByTestId("GIB-sifre")).toHaveTextContent("••••")
    expect(within(await kart("SGK")).getByText("Eksik")).toBeInTheDocument()
    expect(screen.getByText("Kasa kilitli")).toBeInTheDocument()
  })

  it("göster: kilit penceresi açılır, yanlış şifre reddedilir, doğru şifreyle şifre çözülür ve erişim kaydedilir", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/sifreler", {
      as: TEST_USERS.personel,
    })
    const gib = await kart("GİB")
    await user.click(
      within(gib).getByRole("button", { name: "GİB şifresini göster" })
    )

    const dialog = await screen.findByRole("dialog", { name: /kilidini aç/ })
    await user.type(within(dialog).getByLabelText("Ana şifre"), "yanlis")
    await user.click(within(dialog).getByRole("button", { name: "Kilidi aç" }))
    expect(
      await within(dialog).findByText("Ana şifre hatalı (1/5)")
    ).toBeInTheDocument()
    expect(useVaultStore.getState().key).toBeNull()

    await user.type(
      within(dialog).getByLabelText("Ana şifre"),
      DEMO_KASA_SIFRESI
    )
    await user.click(within(dialog).getByRole("button", { name: "Kilidi aç" }))

    // Bekleyen "göster" işlemi kilit açılınca kendiliğinden çalışır
    const beklenen = fixtureSifresi("m_ltd", "GIB")
    await waitFor(() =>
      expect(within(gib).getByTestId("GIB-sifre")).toHaveTextContent(
        beklenen.sifre
      )
    )
    expect(within(gib).getByTestId("GIB-ekSifre")).toHaveTextContent(
      beklenen.ekSifre!
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await waitFor(() =>
      expect(
        db.aktivite.where(
          (a) => a.eylem === "SIFRE_GORUNTULENDI" && a.aktorId === "p_2"
        )
      ).toHaveLength(1)
    )
    expect(
      await within(gib).findByText(/Son erişim: Mehmet Kaya/)
    ).toBeInTheDocument()
  })

  it("5 hatalı denemeden sonra giriş geçici olarak durdurulur (pencere kapanıp açılsa da)", async () => {
    const { user } = renderRoute("/mukellefler/m_ltd/sifreler", {
      as: TEST_USERS.personel,
    })
    await kart("GİB")
    await user.click(screen.getByRole("button", { name: "Kilidi aç" }))
    for (let i = 1; i <= 5; i++) {
      const dialog = await screen.findByRole("dialog")
      await user.type(within(dialog).getByLabelText("Ana şifre"), `yanlis${i}`)
      await user.click(
        within(dialog).getByRole("button", { name: "Kilidi aç" })
      )
      await within(dialog).findByText(
        i < 5 ? `Ana şifre hatalı (${i}/5)` : /Çok fazla hatalı deneme/
      )
    }
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: "Kilidi aç" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("Ana şifre")).toBeDisabled()
    expect(
      within(dialog).getByText(/geçici olarak durduruldu/)
    ).toBeInTheDocument()
  })
})

describe("Mükellef şifreler sekmesi — kasa açık", () => {
  it("kopyala: şifre panoya yazılır, erişim kaydedilir", async () => {
    await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_sahis/sifreler", {
      as: TEST_USERS.personel,
    })
    const ivd = await kart("İnteraktif VD")
    await user.click(
      within(ivd).getByRole("button", { name: "İnteraktif VD Şifre kopyala" })
    )

    expect(await screen.findByText("Şifre kopyalandı")).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(
      fixtureSifresi("m_sahis", "IVD").sifre
    )
    await waitFor(() =>
      expect(
        db.aktivite.where((a) => a.eylem === "SIFRE_KOPYALANDI")
      ).toHaveLength(1)
    )
  })

  it("kasa kilitlenince görüntülenen şifre hemen maskelenir", async () => {
    await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_ltd/sifreler", {
      as: TEST_USERS.personel,
    })
    const gib = await kart("GİB")
    await user.click(
      within(gib).getByRole("button", { name: "GİB şifresini göster" })
    )
    const sifre = fixtureSifresi("m_ltd", "GIB").sifre
    await waitFor(() =>
      expect(within(gib).getByTestId("GIB-sifre")).toHaveTextContent(sifre)
    )

    await user.click(screen.getByRole("button", { name: "Kasayı kilitle" }))
    expect(within(gib).getByTestId("GIB-sifre")).not.toHaveTextContent(sifre)
    expect(screen.getByText("Kasa kilitli")).toBeInTheDocument()
  })

  it("şifre ekle: sunucuya yalnızca şifreli veri gider ve kasa anahtarıyla çözülür", async () => {
    const key = await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_as/sifreler", {
      as: TEST_USERS.yonetici,
    })
    await user.click(
      within(await kart("SGK")).getByRole("button", { name: "Şifre ekle" })
    )

    const dialog = await screen.findByRole("dialog", {
      name: "SGK şifresi ekle",
    })
    await user.type(
      within(dialog).getByLabelText("Kullanıcı adı"),
      "ozturk-sgk"
    )
    await user.type(
      within(dialog).getByLabelText("Sistem şifresi"),
      "Sgk!Gizli2026"
    )
    await user.type(
      within(dialog).getByLabelText("İşyeri şifresi"),
      "isyeri-99"
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    expect(await screen.findByText("SGK şifresi eklendi")).toBeInTheDocument()
    const kayit = db.credential.where(
      (c) => c.mukellefId === "m_as" && c.sistem === "SGK"
    )[0]
    expect(kayit.kullaniciAdi).toBe("ozturk-sgk")
    expect(JSON.stringify(kayit)).not.toContain("Sgk!Gizli2026")
    expect(await decryptJson<CredentialSecret>(kayit, key)).toEqual({
      sifre: "Sgk!Gizli2026",
      ekSifre: "isyeri-99",
    })
    await waitFor(async () =>
      expect(
        within(await kart("SGK")).queryByText("Eksik")
      ).not.toBeInTheDocument()
    )
  })

  it("şifre düzenle: mevcut değerler çözülüp forma gelir ve güncellenir", async () => {
    const key = await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_sahis/sifreler", {
      as: TEST_USERS.personel,
    })
    await user.click(
      within(await kart("İnteraktif VD")).getByRole("button", {
        name: "İnteraktif VD şifresini düzenle",
      })
    )

    const dialog = await screen.findByRole("dialog", {
      name: "İnteraktif VD şifresi düzenle",
    })
    const sifreInput = within(dialog).getByLabelText("Şifre")
    expect(sifreInput).toHaveValue(fixtureSifresi("m_sahis", "IVD").sifre)
    await user.clear(sifreInput)
    await user.type(sifreInput, "YeniSifre#1")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    expect(
      await screen.findByText("İnteraktif VD şifresi güncellendi")
    ).toBeInTheDocument()
    const kayit = db.credential.where(
      (c) => c.mukellefId === "m_sahis" && c.sistem === "IVD"
    )[0]
    expect(await decryptJson<CredentialSecret>(kayit, key)).toEqual({
      sifre: "YeniSifre#1",
    })
  })

  it("şifre sil: onay sonrası kayıt silinir ve kart eksik görünür", async () => {
    await kasayiAc()
    const { user } = renderRoute("/mukellefler/m_sahis/sifreler", {
      as: TEST_USERS.personel,
    })
    await user.click(
      within(await kart("GİB")).getByRole("button", {
        name: "GİB şifresini sil",
      })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Şifre silinsin mi?",
    })
    await user.click(within(dialog).getByRole("button", { name: "Sil" }))

    expect(await screen.findByText("GİB şifresi silindi")).toBeInTheDocument()
    await waitFor(async () =>
      expect(within(await kart("GİB")).getByText("Eksik")).toBeInTheDocument()
    )
    expect(
      db.credential.count(
        (c) => c.mukellefId === "m_sahis" && c.sistem === "GIB"
      )
    ).toBe(0)
  })
})

describe("Şifre kasası sayfası", () => {
  it("tamamlanma özetini ve mükellef × sistem matrisini gösterir", async () => {
    renderRoute("/kasa", { as: TEST_USERS.personel })
    const tablo = await screen.findByRole("table", {
      name: "Şifre kasası tamamlanma tablosu",
    })

    // Fixture: şahıs 2/2, ltd 4/4, a.ş. 2/4 (SGK ve e-Bildirge eksik)
    expect(screen.getByText("Kayıtlı şifre").parentElement).toHaveTextContent(
      "8"
    )
    expect(screen.getByText("Eksik şifre").parentElement).toHaveTextContent("2")
    expect(screen.getByText("Tamamlanma").parentElement).toHaveTextContent(
      "%80"
    )

    expect(
      within(tablo).getByRole("button", { name: "Ali Veli SGK: Gerekmez" })
    ).toBeInTheDocument()
    expect(
      within(tablo).getByRole("button", {
        name: "Öztürk İnşaat A.Ş. e-Bildirge: Eksik",
      })
    ).toBeInTheDocument()
  })

  it("yalnızca eksiği olanlar filtresi ve arama çalışır", async () => {
    const { user } = renderRoute("/kasa", { as: TEST_USERS.personel })
    const tablo = await screen.findByRole("table")
    expect(within(tablo).getAllByRole("row")).toHaveLength(4)

    await user.click(
      screen.getByRole("checkbox", { name: "Yalnızca eksiği olanlar" })
    )
    expect(within(tablo).getAllByRole("row")).toHaveLength(2)
    expect(within(tablo).getByText("Öztürk İnşaat A.Ş.")).toBeInTheDocument()

    await user.click(
      screen.getByRole("checkbox", { name: "Yalnızca eksiği olanlar" })
    )
    await user.type(
      screen.getByRole("searchbox", { name: "Kasada mükellef ara" }),
      "çınar"
    )
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2
    )
  })

  it("hücreye tıklayınca mükellefin şifre kartları yan panelde açılır", async () => {
    const { user } = renderRoute("/kasa", { as: TEST_USERS.personel })
    await user.click(
      await screen.findByRole("button", {
        name: "Öztürk İnşaat A.Ş. SGK: Eksik",
      })
    )
    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText("Öztürk İnşaat A.Ş.")).toBeInTheDocument()
    expect(
      await within(panel).findByRole("region", { name: "SGK şifresi" })
    ).toBeInTheDocument()
  })

  it("sayfadaki kasa bandı kilidi açar ve kilitler", async () => {
    const { user } = renderRoute("/kasa", { as: TEST_USERS.personel })
    await user.click(await screen.findByRole("button", { name: "Kilidi aç" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByLabelText("Ana şifre"),
      DEMO_KASA_SIFRESI
    )
    await user.click(within(dialog).getByRole("button", { name: "Kilidi aç" }))
    await waitFor(() => expect(useVaultStore.getState().key).not.toBeNull())

    await user.click(
      await screen.findByRole("button", { name: "Kasayı kilitle" })
    )
    expect(useVaultStore.getState().key).toBeNull()
  })

  it("çıkış yapınca kasa kilitlenir", async () => {
    await kasayiAc()
    const { user } = renderRoute("/kasa", { as: TEST_USERS.personel })
    await user.click(
      await screen.findByRole("button", { name: "Kullanıcı menüsü" })
    )
    await user.click(await screen.findByRole("menuitem", { name: /Çıkış yap/ }))
    await waitFor(() => expect(useVaultStore.getState().key).toBeNull())
  })
})
