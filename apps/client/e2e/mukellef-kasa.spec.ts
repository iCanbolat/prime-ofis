import { expect, test, type Page } from "@playwright/test"

import { girisYap, kasaKilidiniAc, rastgeleVkn } from "./helpers"

const UNVAN = "Deniz Lojistik Ltd. Şti."

async function ltdMukellefEkle(page: Page) {
  await page.getByRole("link", { name: "Mükellefler" }).first().click()
  await page.getByRole("link", { name: /Yeni mükellef/ }).click()

  const form = page.getByRole("form", { name: "Mükellef formu" })
  const ileri = form.getByRole("button", { name: /İleri/ })

  await expect(
    form.getByRole("heading", { name: "Tür ve kimlik" })
  ).toBeVisible()
  await form.getByRole("radio", { name: /Ltd\. Şti\./ }).click()
  await form.getByLabel("Unvan", { exact: true }).fill(UNVAN)
  await form.getByLabel("VKN", { exact: true }).fill(rastgeleVkn())
  await form.getByLabel("Vergi dairesi", { exact: true }).fill("Kozyatağı")
  await ileri.click()

  await expect(form.getByRole("heading", { name: "İletişim" })).toBeVisible()
  await form
    .getByLabel("Telefon (WhatsApp)", { exact: true })
    .fill("0532 111 22 33")
  await form.getByLabel("İl", { exact: true }).fill("İstanbul")
  await form.getByLabel("İlçe", { exact: true }).fill("Ataşehir")
  await ileri.click()

  await expect(
    form.getByRole("heading", { name: "Vergi yükümlülükleri" })
  ).toBeVisible()
  await form.getByLabel("NACE kodu", { exact: true }).fill("52.29.01")
  await form.getByLabel("Faaliyet konusu", { exact: true }).fill("Lojistik")
  await ileri.click()

  await expect(
    form.getByRole("heading", { name: "Sorumlu ve etiketler" })
  ).toBeVisible()
  await form.getByRole("button", { name: "Mükellefi kaydet" }).click()

  await expect(page).toHaveURL(/\/mukellefler\/m_\w+\/genel$/)
  await expect(
    page.getByRole("heading", { level: 1, name: UNVAN })
  ).toBeVisible()
}

test("mükellef ekle (Ltd) → takvimde yükümlülükleri görünür", async ({
  page,
}) => {
  await girisYap(page)
  await ltdMukellefEkle(page)

  await page
    .getByRole("navigation", { name: "Mükellef bölümleri" })
    .getByRole("link", { name: "Takvim" })
    .click()

  const tabi = page.getByText("Tabi olduğu yükümlülükler").locator("../..")
  for (const ad of [
    "KDV beyannamesi",
    "Muhtasar ve prim hizmet",
    "Geçici vergi",
    "Kurumlar vergisi",
  ]) {
    await expect(tabi.getByText(ad)).toBeVisible()
  }
  await expect(tabi.getByText("Yıllık gelir vergisi")).toHaveCount(0)

  // Yaklaşan listede yeni mükellefin KDV beyanı üretilmiş olmalı
  await expect(
    page
      .getByRole("listitem", { name: new RegExp(`^${UNVAN} KDV beyannamesi`) })
      .first()
  ).toBeVisible()
})

test("kasa aç → GİB şifresi ekle → göster → aktivite logunda görünür", async ({
  page,
}) => {
  await girisYap(page)
  await ltdMukellefEkle(page)

  await page
    .getByRole("navigation", { name: "Mükellef bölümleri" })
    .getByRole("link", { name: "Şifreler" })
    .click()

  const gib = page.getByRole("region", { name: "GİB şifresi" })
  await expect(gib.getByText("Eksik")).toBeVisible()
  await gib.getByRole("button", { name: "Şifre ekle" }).click()

  // Kasa kilitli: önce kilit penceresi, ardından bekleyen "ekle" işlemi
  await kasaKilidiniAc(page)
  const form = page.getByRole("dialog", { name: "GİB şifresi ekle" })
  await form.getByLabel("Kullanıcı kodu", { exact: true }).fill("12345678901")
  await form.getByLabel("Parola", { exact: true }).fill("Gib!E2e2026")
  await form.getByLabel("Şifre", { exact: true }).fill("sifre-99")
  await form.getByRole("button", { name: "Kaydet" }).click()
  await expect(page.getByText("GİB şifresi eklendi")).toBeVisible()

  await gib.getByRole("button", { name: "GİB şifresini göster" }).click()
  await expect(gib.getByTestId("GIB-sifre")).toHaveText("Gib!E2e2026")

  await page
    .getByRole("navigation", { name: "Mükellef bölümleri" })
    .getByRole("link", { name: "Genel" })
    .click()
  const aktivite = page.getByRole("list", { name: "Aktivite geçmişi" })
  await expect(aktivite.getByText(/şifreyi görüntüledi/)).toBeVisible()
  await expect(aktivite.getByText(/şifre ekledi/)).toBeVisible()
})
