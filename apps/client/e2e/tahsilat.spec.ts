import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

test("geciken borçlu → ödeme al → bakiye düşer, borç kapanır", async ({
  page,
}) => {
  await girisYap(page)
  await page.locator('a[href="/tahsilat"]').first().click()
  await expect(page).toHaveURL("/tahsilat/ozet")
  await expect(page.getByRole("region", { name: "Tahsilat özeti" })).toBeVisible()

  await page.getByRole("link", { name: "Cari hesaplar" }).click()
  await page.getByRole("button", { name: "Geciken" }).click()
  await expect(page).toHaveURL(/geciken=true/)
  const tablo = page.getByRole("table", { name: "Cari hesaplar" })
  const ilk = tablo.locator("tbody tr").first()
  const unvan = (await ilk.locator("td").first().locator("button").textContent())!.trim()
  await ilk.locator("td").first().locator("button").click()

  const panel = page.getByRole("dialog", { name: unvan })
  const ozet = panel.getByRole("region", { name: "Cari özet" })
  const onceki = await ozet.getByText(/^₺/).first().textContent()
  await panel.getByRole("button", { name: "Ödeme al" }).click()
  const odeme = page.getByRole("dialog", { name: "Ödeme al" })
  await odeme.getByLabel("Açıklama (isteğe bağlı)").fill("Havale")
  await odeme.getByRole("button", { name: "Kaydet" }).click()
  await expect(page.getByText(/tahsilat kaydedildi/)).toBeVisible()
  await expect(ozet.getByText(/^₺/).first()).not.toHaveText(onceki!)
  await expect(ozet.getByText("Borcu yok")).toBeVisible()
})

test("kesinti kontrolü raporu seed listesindeki uyuşmazlıkları gösterir", async ({ page }) => {
  await girisYap(page)
  await page.goto("/tahsilat/kesinti")
  const tablo = page.getByRole("table", { name: "Kesinti karşılaştırması" })
  await expect(tablo).toBeVisible()
  await page.getByRole("button", { name: /^Eksik bildirilmiş/ }).click()
  await expect(page).toHaveURL(/durum=EKSIK/)
  // Dar ekranda satır içi, genişte ayrı sütunda gösterilen rozetin görünür olanı
  await expect(tablo.getByText("Eksik bildirilmiş").filter({ visible: true }).first()).toBeVisible()
})
