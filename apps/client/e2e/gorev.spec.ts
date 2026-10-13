import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

test("dönem görevlerini oluştur → kanban'da klavyeyle Tamam'a taşı", async ({
  page,
}) => {
  await girisYap(page)
  // Seed'de Ba-Bs görevi yok: geçen ay için tüm uygun mükelleflere görev aç
  await page.locator('a[href="/gorevler"]').first().click()
  await page.getByRole("button", { name: /Dönem görevlerini oluştur/ }).click()
  const dialog = page.getByRole("dialog", { name: "Dönem görevlerini oluştur" })
  await dialog.getByLabel("Yükümlülük").click()
  await page.getByRole("option", { name: "Ba-Bs formları" }).click()
  await expect(
    dialog.getByRole("table", { name: "Oluşturulacak görevler" })
  ).toBeVisible()
  const olustur = dialog.getByRole("button", { name: /^\d+ görev oluştur$/ })
  const adet = Number((await olustur.textContent())!.match(/\d+/)![0])
  expect(adet).toBeGreaterThan(0)
  await olustur.click()
  await expect(page.getByText(`${adet} görev oluşturuldu`)).toBeVisible()

  // Yalnızca Ba-Bs görevleri; ilk kartı klavyeyle Yapılacak → Tamam'a taşı
  await page.goto("/gorevler?tip=BA_BS")
  const yapilacak = page.getByRole("region", { name: "Yapılacak sütunu" })
  const tamam = page.getByRole("region", { name: "Tamam sütunu" })
  await expect(yapilacak.getByRole("article")).toHaveCount(adet)
  const kart = yapilacak.getByRole("article").first()
  const kartAdi = (await kart.getAttribute("aria-label"))!
  const duyuru = page.getByRole("status").filter({ hasText: /Ba-Bs/ })
  await kart.getByRole("button", { name: /görevini taşı$/ }).focus()
  await page.keyboard.press("Space")
  await expect(duyuru).toContainText("Yapılacak sütunu üzerinde")
  for (const sutun of ["Devam", "Kontrol", "Tamam"]) {
    await page.keyboard.press("ArrowRight")
    await expect(duyuru).toContainText(`${sutun} sütunu üzerinde`)
  }
  await page.keyboard.press("Space")
  await expect(duyuru).toContainText("Tamam sütununa bırakıldı")
  await expect(tamam.getByRole("article", { name: kartAdi })).toBeVisible()
  await expect(yapilacak.getByRole("article")).toHaveCount(adet - 1)
})
