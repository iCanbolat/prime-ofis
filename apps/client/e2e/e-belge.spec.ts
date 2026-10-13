import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

test("senkronize et → ticari faturayı reddet → faturayı arşive kaydet", async ({
  page,
}) => {
  await girisYap(page)
  await page.locator('a[href="/e-belge"]').first().click()
  await expect(page).toHaveURL("/e-belge/e-fatura")

  // Senkron: yeni gelen faturalar düşer, işlenen giden faturalar tamamlanır
  await page.getByRole("button", { name: "Şimdi senkronize et" }).click()
  await expect(
    page.getByText(/^Senkronize edildi: \d+ yeni fatura/)
  ).toBeVisible()

  // Yanıt bekleyen ilk ticari faturayı gerekçeyle reddet
  await page.getByRole("button", { name: "Gelen" }).click()
  // Yanıt filtresi "Filtreler" panelinde; seçim "Uygula" ile URL'e yazılır
  await page.getByRole("button", { name: "Filtreler" }).click()
  const filtreler = page.getByRole("dialog", { name: "Filtreler" })
  await filtreler.getByLabel("Yanıt durumu").click()
  await page.getByRole("option", { name: "Yanıt bekliyor" }).click()
  // Dev'deki React Query devtools düğmesi sağ alttaki "Uygula"nın üstüne biniyor
  await filtreler.getByRole("button", { name: "Uygula" }).press("Enter")
  await expect(page).toHaveURL(/yanit=BEKLIYOR/)
  const tablo = page.getByRole("table", { name: "Faturalar" })
  const ilk = tablo.getByRole("button", { name: /faturasını aç$/ }).first()
  const belgeNo = (await ilk.textContent())!.trim()
  await ilk.click()

  const panel = page.getByRole("dialog", { name: belgeNo })
  await expect(panel.getByText("Ticari fatura yanıtı bekleniyor")).toBeVisible()
  await panel.getByRole("button", { name: "Reddet" }).click()
  const red = page.getByRole("dialog", { name: "Faturayı reddet" })
  await red.getByRole("button", { name: "Fiyat veya miktar hatalı" }).click()
  await red.getByRole("button", { name: "Reddet" }).click()
  await expect(panel.getByText("Reddedildi", { exact: true })).toBeVisible()

  // Arşive kaydet → mükellefin arşivinde Fatura kategorisinde görünür
  await panel.getByRole("button", { name: "Arşive kaydet" }).click()
  await panel.getByRole("link", { name: "Arşivde" }).click()
  await expect(page).toHaveURL(/\/arsiv\?mukellef=m_\d+&kategori=FATURA/)
  await expect(page.getByText(new RegExp(`^${belgeNo} - `))).toBeVisible()
})
