import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

test("acil tebligat → göreve dönüştür → görev panelinde son gün", async ({
  page,
}) => {
  await girisYap(page)
  await page.locator('a[href="/tebligat"]').first().click()
  await expect(page).toHaveURL("/tebligat")
  await page.getByRole("button", { name: "Acil tebligatları göster" }).click()
  const tablo = page.getByRole("table", { name: "e-Tebligatlar" })
  await tablo.locator("tbody tr").first().locator("button").first().click()

  const panel = page.getByRole("dialog")
  await expect(
    panel.getByRole("list", { name: "Süre çizelgesi" })
  ).toBeVisible()
  await panel.getByRole("button", { name: "Göreve dönüştür" }).click()
  await expect(page.getByText("Görev oluşturuldu")).toBeVisible()
  await panel.getByRole("button", { name: "Göreve git" }).click()
  await expect(page).toHaveURL(/\/gorevler\?gorev=/)
})

test("hatalı GİB erişimi panelden güncellenir", async ({ page }) => {
  await girisYap(page)
  await page.goto("/tebligat?erisim=")
  const panel = page.getByRole("dialog", { name: "GİB erişim durumu" })
  const hatali = panel.getByRole("region", { name: "Giriş başarısız" })
  await expect(hatali.locator("li").first()).toBeVisible()
  const satirSayisi = await hatali.locator("li").count()
  await hatali.getByRole("button", { name: "Şifreyi güncelle" }).first().click()
  const form = page.getByRole("dialog", { name: "GİB e-Tebligat erişimi" })
  await form.getByLabel("Şifre").fill("yeni-ivd-sifresi")
  await form.getByRole("button", { name: "Kaydet" }).click()
  await expect(page.getByText(/GİB erişimi kaydedildi/)).toBeVisible()
  if (satirSayisi > 1)
    await expect(hatali.locator("li")).toHaveCount(satirSayisi - 1)
  else await expect(hatali).toBeHidden()
})
