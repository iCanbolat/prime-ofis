import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

// 1×1 piksel PNG — portal küçük görselleri olduğu gibi yükler (ad değişmez)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)
const DOSYALAR = ["fis-eylul-1.png", "fis-eylul-2.png"]

test("evrak talebi → portal (ayrı sekme) → 2 fotoğraf → büroda onay → arşivde görünür", async ({
  page,
  context,
}) => {
  await girisYap(page)

  // Seed'deki ilk mükellefin kartı
  await page.goto("/mukellefler")
  await page.getByRole("table").getByRole("link").first().click()
  await expect(page).toHaveURL(/\/mukellefler\/m_\w+\/genel$/)
  const baslik = page.getByRole("heading", { level: 1 })
  await expect(baslik).toBeVisible()
  const unvan = (await baslik.textContent())!.trim()
  const kartUrl = page.url().replace(/\/genel$/, "")

  // Talep oluştur: varsayılan evraklardan yalnızca fiş/fatura kalsın
  await page.getByRole("button", { name: "Evrak iste" }).click()
  const talepDialog = page.getByRole("dialog", { name: "Evrak iste" })
  await expect(
    talepDialog.getByRole("checkbox", { name: "Aylık fiş / fatura" })
  ).toBeChecked()
  await talepDialog.getByRole("checkbox", { name: "Banka ekstresi" }).click()
  await talepDialog.getByRole("button", { name: "Talep oluştur" }).click()

  const gonder = page.getByRole("dialog", { name: "Talebi gönder" })
  const link = await gonder.getByLabel("Yükleme bağlantısı").inputValue()
  expect(link).toMatch(/\/p\/[\w-]{43}$/)
  await page.keyboard.press("Escape")
  await expect(gonder).toBeHidden()

  // Müşteri linki aynı tarayıcıda yeni sekmede açar (büro sekmesi açık kalır)
  const portal = await context.newPage()
  await portal.goto(link)
  await expect(portal.getByRole("heading", { name: unvan })).toBeVisible()
  await portal
    .getByLabel("Aylık fiş / fatura: dosya seç")
    .setInputFiles(
      DOSYALAR.map((name) => ({ name, mimeType: "image/png", buffer: PNG }))
    )
  const fatura = portal.getByRole("listitem", { name: "Aylık fiş / fatura" })
  for (const ad of DOSYALAR) await expect(fatura.getByText(ad)).toBeVisible()
  await expect(fatura.getByLabel("Yüklendi")).toBeVisible()
  await portal
    .getByRole("button", { name: "Gönderimi tamamla (2 dosya)" })
    .click()
  await expect(
    portal.getByRole("heading", { name: "Teşekkürler!" })
  ).toBeVisible()
  await portal.close()

  // Büro: sayfa yenilenmeden (SPA içinde) gelen kutusuna geç ve iki dosyayı onayla.
  // Portal sekmesinin yazdıkları görünmeli ve büronun yazmaları onları ezmemeli.
  await page.bringToFront()
  await page.locator('a[href="/evrak-talepleri"]').click()
  await page.getByRole("tab", { name: /Gelen kutusu/ }).click()
  for (const ad of DOSYALAR) {
    const satir = page.getByRole("listitem", { name: ad })
    await expect(satir.getByText(unvan)).toBeVisible()
    await satir.getByRole("button", { name: "Onayla" }).click()
    const onay = page.getByRole("dialog", { name: "Onayla ve arşive kaydet" })
    await onay.getByRole("button", { name: "Onayla" }).click()
    await expect(onay).toBeHidden()
    await expect(satir).toHaveCount(0)
  }

  // Arşivde görünür
  await page.goto(`${kartUrl}/arsiv`)
  for (const ad of DOSYALAR) {
    await expect(
      page
        .getByRole("listitem", { name: ad })
        .or(page.getByRole("row", { name: ad }))
    ).toBeVisible()
  }
})
