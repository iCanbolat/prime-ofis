import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

// Seed: bilanço mükelleflerinin Ağustos fiş / ekstre talepleri okunmuş, bir kısmı onaylı
test("ekstre taslağı düzeltilip onaylanır → Luca Excel'i indirilir → aktarım geri alınır", async ({
  page,
}) => {
  await girisYap(page)
  await page.locator('a[href="/fis-aktarimi"]').click()
  await expect(page).toHaveURL(/\/fis-aktarimi\/taslaklar$/)

  // Okunamayan belge listede, yeniden okunabilir
  await expect(page.getByText("fis-bulanik.jpg")).toBeVisible()

  // Ekstrenin karşı hesabı belirlenemeyen satırlarını doldur ve onayla
  const taslaklar = page.getByRole("table", { name: "Taslak fişler" })
  await taslaklar.getByRole("button", { name: /ekstresi/ }).first().click()
  const sheet = page.getByRole("dialog")
  const onayla = sheet.getByRole("button", { name: "Onayla" })
  await expect(onayla).toBeDisabled()
  // Hesabı boş satırlar aria-invalid ile işaretli; doldurdukça listeden düşer
  const bos = sheet.locator('input[placeholder="Hesap"][aria-invalid="true"]')
  const adet = await bos.count()
  expect(adet).toBeGreaterThan(0)
  for (let i = 0; i < adet; i++) await bos.first().fill("689.01")
  await expect(bos).toHaveCount(0)
  await expect(sheet.getByText("Borç ve alacak eşit")).toBeVisible()
  // Dev'deki React Query devtools düğmesi sağ alttaki "Onayla"nın üstüne biniyor
  await onayla.press("Enter")
  await expect(sheet).toBeHidden()

  // Aktarıma hazır: ilk mükellefin fişleri Luca dosyası olarak iner
  await page.getByRole("link", { name: /Aktarıma hazır/ }).click()
  const indirme = page.waitForEvent("download")
  await page.getByRole("button", { name: "Luca Excel'i indir" }).first().click()
  expect((await indirme).suggestedFilename()).toMatch(/^Luca_.+_1\.xlsx$/)
  await expect(page.getByText("Luca dosyası indirildi")).toBeVisible()

  // Aktarımlar: geri alınca fişler yeniden hazır olur
  await page.getByRole("link", { name: "Aktarımlar" }).click()
  const tablo = page.getByRole("table", { name: "Luca aktarımları" })
  await tablo.getByRole("button", { name: /aktarımını geri al/ }).click()
  await page
    .getByRole("alertdialog", { name: "Aktarım geri alınsın mı?" })
    .getByRole("button", { name: "Geri al" })
    .click()
  await expect(tablo.getByText("Geri alındı")).toBeVisible()
})
