import { expect, test } from "@playwright/test"

import { girisYap } from "./helpers"

const CSV = [
  "Ad Soyad;Brüt Ücret;Net Ücret;SGK İşçi Payı;SGK İşveren Payı;Gelir Vergisi;Damga Vergisi",
  "Ali Veli;33030,00;28075,50;4624,20;7184,03;0;250,70",
  "Ayşe Kaya;50000;38500;7000;10875;3250,50;379,50",
].join("\n")

test("bordro takibi: liste → detay → Excel/CSV özeti içe aktar → kontroller", async ({
  page,
}) => {
  await girisYap(page)
  await page.locator('a[href="/bordro"]').first().click()
  await expect(page).toHaveURL(/\/bordro/)
  const tablo = page.getByRole("table", { name: "Bordro takibi" })
  await expect(tablo.locator("tbody tr").first()).toBeVisible()

  await tablo.locator("tbody tr").first().locator("button").first().click()
  const panel = page.getByRole("dialog")
  await expect(
    panel.getByRole("combobox", { name: "Bordro durumu" })
  ).toBeVisible()

  await panel
    .getByRole("button", { name: /Bordro dökümünü yükle|Dökümü yeniden yükle/ })
    .click()
  const yukle = page.getByRole("dialog", { name: "Bordro dökümünü yükle" })
  await yukle.getByLabel("Dosya seç").setInputFiles({
    name: "bordro.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf-8"),
  })
  await expect(yukle.getByLabel("Çalışan sayısı")).toHaveValue("2")
  await expect(yukle.getByLabel("Brüt toplam (TL)")).toHaveValue("83030")
  await yukle.getByRole("button", { name: "İçe aktar" }).click()
  await expect(page.getByText("Bordro özeti içe aktarıldı")).toBeVisible()
  await expect(
    page.getByRole("list", { name: "Mizan kontrolleri" })
  ).toContainText("Net ücret brütü aşmıyor")
  // Yüklenen döküm dönem belgelerinde (arşiv bağlantısı) listelenir
  await expect(
    page.getByRole("list", { name: "Dönem belgeleri" })
  ).toContainText("bordro.csv")
})

test("bordro takibi: durum select filtresi, ızgara görünümü ve sayfalama", async ({
  page,
}) => {
  await girisYap(page)
  await page.goto("/bordro")
  await expect(
    page.getByRole("navigation", { name: "Sayfalama" })
  ).toBeVisible()

  await page.getByRole("combobox", { name: "Durum filtresi" }).click()
  await page.getByRole("option", { name: /^Girdi bekleniyor/ }).click()
  await expect(page).toHaveURL(/durum=BEKLENIYOR/)

  await page.getByRole("button", { name: "Izgara görünümü" }).click()
  const kartlar = page.getByRole("list", { name: "Bordro takibi" })
  await expect(kartlar.getByRole("listitem").first()).toContainText(
    "Girdi bekleniyor"
  )
})

test("işe giriş / çıkış bildirimi eklenir ve bildirildi işaretlenir", async ({
  page,
}) => {
  await girisYap(page)
  await page.goto("/bordro?sekme=hareket")
  await page.getByRole("button", { name: "Bildirim ekle" }).click()
  const dialog = page.getByRole("dialog", { name: "İşe giriş / çıkış ekle" })
  await dialog.getByRole("combobox", { name: "Mükellef" }).click()
  await page.getByRole("option").first().click()
  await dialog.getByLabel("Ad soyad").fill("Deneme Çalışan")
  await dialog.getByRole("button", { name: "Ekle" }).click()

  const satir = page.getByRole("row", { name: /Deneme Çalışan/ })
  await expect(satir).toBeVisible()
  await satir.getByRole("button", { name: "Bildirildi" }).click()
  await expect(satir.getByText("Bildirildi").first()).toBeVisible()
})

test("hassas evrak talebinde bağlantı süresi 3 güne iner", async ({ page }) => {
  await girisYap(page)
  await page.goto("/evrak-talepleri")
  await page.getByRole("button", { name: "Evrak iste" }).click()
  const dialog = page.getByRole("dialog", { name: "Evrak iste" })
  await dialog
    .getByRole("checkbox", { name: "Puantaj / ek ödeme-kesinti bilgisi" })
    .click()
  await expect(
    dialog.getByRole("combobox", { name: "Bağlantı geçerliliği" })
  ).toContainText("3 gün")
})
