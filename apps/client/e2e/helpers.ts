import { expect, type Page } from "@playwright/test"

export const DEMO_KASA_SIFRESI = "demo1234"
/** Seed kullanıcılarının giriş şifresi (`mocks/factories/personel.ts`). */
export const DEMO_GIRIS_SIFRESI = "demo1234"

/** Seed personeli: `p_1` yönetici, diğerleri personel. */
export const KULLANICI = {
  yonetici: "Ayşe Yılmaz",
  personel: "Mehmet Kaya",
} as const

/** Giriş ekranından hazır kullanıcıyla oturum açar ve gösterge paneline iner. */
export async function girisYap(page: Page, ad: string = KULLANICI.yonetici) {
  await page.goto("/login")
  await page.getByRole("button", { name: new RegExp(ad) }).click()
  await page.getByLabel("Şifre").fill(DEMO_GIRIS_SIFRESI)
  await page.getByRole("button", { name: "Giriş yap" }).click()
  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("heading", { name: `Merhaba, ${ad.split(" ")[0]}` })
  ).toBeVisible()
}

/** Seed ile çakışmayan geçerli (checksum'lı) VKN üretir. */
export function rastgeleVkn(): string {
  const d = Array.from({ length: 9 }, (_, i) =>
    i === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)
  )
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + (9 - i)) % 10
    let weighted = (tmp * 2 ** (9 - i)) % 9
    if (tmp !== 0 && weighted === 0) weighted = 9
    sum += weighted
  }
  return [...d, (10 - (sum % 10)) % 10].join("")
}

/** Kilit penceresine ana şifreyi girer. */
export async function kasaKilidiniAc(page: Page) {
  const dialog = page.getByRole("dialog", { name: /kilidini aç/ })
  await dialog.getByLabel("Ana şifre").fill(DEMO_KASA_SIFRESI)
  await dialog.getByRole("button", { name: "Kilidi aç" }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Aktif bir evrak talebinin portal token'ı. Seed son kullanma tarihleri sabit
 * referans tarihine (SEED_REF_DATE) göre üretildiği için gerçek tarih ilerleyince
 * süresi dolar; bu yüzden AKTIF bir talebin `sonKullanma`'sı localStorage'daki
 * mock DB'de ileri alınır (seed'in kendisi değişmez, yalnız tarayıcı kopyası).
 */
export async function aktifPortalTokeni(page: Page): Promise<string> {
  await page.goto("/login")
  // Mock DB ilk API isteğinde oluşur; giriş listesi gelince hazırdır
  await expect(
    page.getByRole("button", { name: new RegExp(KULLANICI.yonetici) })
  ).toBeVisible()
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("prime-ofis:db:")
    )!
    const db = JSON.parse(localStorage.getItem(key)!)
    const talep = db.talep.find((t: { durum: string }) => t.durum === "AKTIF")
    if (!talep) return undefined
    if (talep.sonKullanma <= new Date().toISOString()) {
      talep.sonKullanma = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString()
      localStorage.setItem(key, JSON.stringify(db))
    }
    return talep.token as string
  })
  expect(token).toBeTruthy()
  // Bellekteki mock DB kopyası eskimesin; sonraki sayfa yüklemesi yamalı hâli okur
  await page.reload()
  return token!
}
