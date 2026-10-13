import { screen, waitFor, within } from "@testing-library/react"
import { HttpResponse, http as msw } from "msw"
import { describe, expect, it } from "vitest"

import { kasaAnahtariGuncelMi } from "@/features/kasa/queries"
import { useVaultStore } from "@/features/kasa/store"
import {
  createVerifier,
  decryptJson,
  deriveKey,
  generateSalt,
  verifyKey,
} from "@/lib/crypto"
import { db } from "@/mocks/db"
import { api } from "@/mocks/handlers/common"
import { server } from "@/mocks/server"
import { fixtureSifresi, kasayiAc } from "@/test/kasa"
import { TEST_USERS, renderRoute } from "@/test/render"
import type { CredentialSecret } from "@prime/shared/types/domain"

const YENI_SIFRE = "YeniAnaSifre!42"

/**
 * Kasa kurulu değilmiş gibi: sunucu meta için 404 döner. Mock'un demo kasasını (`ensureVault`)
 * kuran liste ucu da boş döner.
 */
function kasaKurulmamis() {
  server.use(
    msw.get(api("/kasa/meta"), () =>
      db.kasa.count() > 0
        ? HttpResponse.json(db.kasa.all()[0])
        : HttpResponse.json(
            { message: "Kasa henüz kurulmadı" },
            { status: 404 }
          )
    ),
    msw.get(api("/kasa/credentials"), () => HttpResponse.json([]))
  )
}

describe("kasa kurulumu", () => {
  it("personel kurulum uyarısını görür, kuramaz", async () => {
    kasaKurulmamis()
    renderRoute("/kasa", { as: TEST_USERS.personel })
    expect(
      await screen.findByText("Şifre kasası kurulmadı")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Kasayı büro yöneticisi kurmalıdır.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kasayı kur" })
    ).not.toBeInTheDocument()
  })

  it("yönetici ana şifreyi belirleyip kasayı kurar; kasa açılır", async () => {
    kasaKurulmamis()
    const { user } = renderRoute("/kasa", { as: TEST_USERS.yonetici })
    await user.click(await screen.findByRole("button", { name: "Kasayı kur" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Şifre kasasını kur",
    })

    await user.type(within(dialog).getByLabelText("Yeni ana şifre"), "kisa")
    await user.type(
      within(dialog).getByLabelText("Yeni ana şifre (tekrar)"),
      "kisa"
    )
    await user.click(within(dialog).getByRole("button", { name: "Kasayı kur" }))
    expect(
      await within(dialog).findByText("Ana şifre en az 10 karakter olmalı")
    ).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Yeni ana şifre"))
    await user.clear(within(dialog).getByLabelText("Yeni ana şifre (tekrar)"))
    await user.type(within(dialog).getByLabelText("Yeni ana şifre"), YENI_SIFRE)
    await user.type(
      within(dialog).getByLabelText("Yeni ana şifre (tekrar)"),
      YENI_SIFRE
    )
    await user.click(within(dialog).getByRole("button", { name: "Kasayı kur" }))

    expect(await screen.findByText("Kasa açık")).toBeInTheDocument()
    const [meta] = db.kasa.all()
    const key = await deriveKey(YENI_SIFRE, meta.salt, meta.iterations)
    expect(await verifyKey(key, meta.verifier)).toBe(true)
    expect(useVaultStore.getState().key).not.toBeNull()
    expect(db.aktivite.where((a) => a.eylem === "KASA_KURULDU")).toHaveLength(1)
  })
})

describe("ana şifre değişimi", () => {
  it("yalnızca yöneticiye ve kasa açıkken görünür", async () => {
    await kasayiAc()
    renderRoute("/kasa", { as: TEST_USERS.personel })
    expect(await screen.findByText("Kasa açık")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Ana şifreyi değiştir" })
    ).not.toBeInTheDocument()
  })

  it("tüm kayıtlar yeni ana şifreyle yeniden şifrelenir; eski anahtar çözemez", async () => {
    const eskiKey = await kasayiAc()
    const { user } = renderRoute("/kasa", { as: TEST_USERS.yonetici })
    await user.click(
      await screen.findByRole("button", { name: "Ana şifreyi değiştir" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Kasa ana şifresini değiştir",
    })
    await user.type(within(dialog).getByLabelText("Yeni ana şifre"), YENI_SIFRE)
    await user.type(
      within(dialog).getByLabelText("Yeni ana şifre (tekrar)"),
      `${YENI_SIFRE}x`
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Ana şifreyi değiştir" })
    )
    expect(
      await within(dialog).findByText("Şifreler eşleşmiyor")
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText("Yeni ana şifre (tekrar)"),
      "{Backspace}"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Ana şifreyi değiştir" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )

    const [meta] = db.kasa.all()
    const yeniKey = await deriveKey(YENI_SIFRE, meta.salt, meta.iterations)
    expect(await verifyKey(yeniKey, meta.verifier)).toBe(true)
    expect(await verifyKey(eskiKey, meta.verifier)).toBe(false)

    const gib = db.credential.where(
      (c) => c.mukellefId === "m_ltd" && c.sistem === "GIB"
    )[0]
    expect(await decryptJson<CredentialSecret>(gib, yeniKey)).toMatchObject({
      sifre: fixtureSifresi("m_ltd", "GIB").sifre,
    })
    await expect(decryptJson(gib, eskiKey)).rejects.toThrow()
    // Bellekteki anahtar yeni anahtar: kayıt çözülebiliyor
    const bellek = useVaultStore.getState().key!
    expect(await verifyKey(bellek, meta.verifier)).toBe(true)
  })
})

describe("başka oturumda ana şifre değişince", () => {
  it("eski anahtarla yazma engellenir ve kasa kilitlenir", async () => {
    await kasayiAc()
    await expect(kasaAnahtariGuncelMi()).resolves.toBeUndefined()

    const [meta] = db.kasa.all()
    const baskaKey = await deriveKey("baska-sifre", generateSalt())
    db.kasa.update(meta.id, { verifier: await createVerifier(baskaKey) })

    await expect(kasaAnahtariGuncelMi()).rejects.toThrow(
      /ana şifresi değiştirilmiş/
    )
    expect(useVaultStore.getState().key).toBeNull()
  })
})
