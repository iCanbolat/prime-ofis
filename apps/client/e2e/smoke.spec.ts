import { expect, test } from "@playwright/test"

import { DEMO_GIRIS_SIFRESI } from "./helpers"

test("giriş yapıp gösterge paneline ulaşılır", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)

  await page.getByRole("button", { name: /Ayşe Yılmaz/ }).click()
  await page.getByLabel("Şifre").fill("yanlis-sifre")
  await page.getByRole("button", { name: "Giriş yap" }).click()
  await expect(page.getByText("Kullanıcı veya şifre hatalı")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel("Şifre").fill(DEMO_GIRIS_SIFRESI)
  await page.getByRole("button", { name: "Giriş yap" }).click()
  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("heading", { name: "Merhaba, Ayşe" })
  ).toBeVisible()
  await expect(page.getByRole("tab", { name: /^Bu hafta/ })).toBeVisible()
})
