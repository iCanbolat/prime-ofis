import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

/**
 * Mock GİB / SGK girişi her gün küçük bir olasılıkla doğrulama ekranı çıkarır; testler bu durumda
 * doğrulama penceresinin açıldığını kabul eder (kod otomatik çözülmez).
 */
const sonucVeyaDogrulama = (
  page: import("@playwright/test").Page,
  basari: RegExp
) =>
  expect(
    page
      .getByText(basari)
      .or(page.getByRole("dialog", { name: "Doğrulama kodu gerekiyor" }))
      .first()
  ).toBeVisible()

test("borç ve levha: vergi borcu listesi → detay paneli", async ({ page }) => {
  await girisYap(page)
  await page.locator('a[href="/borc-levha"]').first().click()
  await expect(page).toHaveURL(/\/borc-levha/)
  const tablo = page.getByRole("table", { name: "Vergi borcu" })
  await expect(tablo.locator("tbody tr").first()).toBeVisible()

  await tablo.locator("tbody tr").first().locator("button").first().click()
  await expect(page).toHaveURL(/borc=m_/)
  const panel = page.getByRole("dialog")
  await expect(panel.getByText("Vergi borcu").first()).toBeVisible()
  await expect(
    panel.getByRole("link", { name: "Mükellef kartında aç" })
  ).toBeVisible()
})

test("borç ve levha: eksik vergi levhası GİB'den alınır", async ({ page }) => {
  await girisYap(page)
  await page.goto("/borc-levha?sekme=levha&kapsam=eksik")
  const al = page.getByRole("button", { name: /vergi levhasını GİB'den al/ })
  await expect(al.first()).toBeVisible()
  await al.first().click()
  await sonucVeyaDogrulama(page, /vergi levhası sorgulandı/)
})

test("borç ve levha: mükellef kartından borcu yoktur yazısı istenir", async ({
  page,
}) => {
  await girisYap(page)
  // Sorgusu olan (GİB erişimi çalışan) ilk mükellefin kartına geç
  await page.goto("/borc-levha?sekme=vergi&kapsam=borclu")
  const tablo = page.getByRole("table", { name: "Vergi borcu" })
  await tablo.locator("tbody tr").first().locator("button").first().click()
  await page.getByRole("link", { name: "Mükellef kartında aç" }).click()
  await expect(page).toHaveURL(/\/mukellefler\/m_\d+\/borc/)
  await page.getByRole("button", { name: "Yazı iste" }).click()
  const pencere = page.getByRole("dialog", { name: "Borcu yoktur yazısı iste" })
  await pencere.getByRole("button", { name: "Talep et" }).click()
  await sonucVeyaDogrulama(page, /borcu yoktur yazısı istendi/)
  await expect(
    page.getByRole("list", { name: "Borcu yoktur talepleri" })
  ).toBeVisible()
})

test("borç ve levha: doğrulama bekleyen giriş için yeni görsel istenir", async ({
  page,
}) => {
  await girisYap(page)
  await page.goto("/borc-levha?dogrulama=")
  const panel = page.getByRole("dialog", {
    name: "Doğrulama bekleyen girişler",
  })
  // Seed'deki doğrulama gece oluşturulduğu için görselinin süresi dolmuştur
  await panel.getByRole("button", { name: "Yeni görsel iste" }).first().click()
  await expect(
    panel.getByRole("img", { name: /doğrulama görseli/ }).first()
  ).toBeVisible()
  await expect(panel.getByLabel("Görseldeki kod").first()).toBeVisible()
})
