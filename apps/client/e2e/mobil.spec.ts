import { expect, test, type Page } from "@playwright/test"

import { aktifPortalTokeni, girisYap } from "./helpers"

// En dar hedef ekran (iPhone SE / 12 mini); proje cihazının dokunmatik ayarları korunur
test.use({ viewport: { width: 375, height: 812 } })

const SAYFALAR = [
  "/",
  "/mukellefler",
  "/mukellefler/yeni",
  "/kasa",
  "/takvim",
  "/arsiv",
  "/evrak-talepleri",
  "/gorevler",
  "/e-belge/e-fatura",
  "/e-belge/e-defter",
  "/e-belge/baglantilar",
  "/tebligat",
  "/tahsilat/ozet",
  "/tahsilat/cari",
  "/tahsilat/kesinti",
  "/fis-aktarimi/taslaklar",
  "/fis-aktarimi/hazir",
  "/fis-aktarimi/aktarimlar",
  "/ayarlar/luca",
  "/ayarlar/kanallar",
  "/ayarlar/bildirimler",
  "/ayarlar/gonderimler",
  "/ayarlar/buro",
  "/ayarlar/personel",
  "/ayarlar/sablonlar",
  "/ayarlar/gelistirici",
]

/** Sayfa yatay kaymaz; listelenen tablolar da kapsayıcısına sığar. */
async function tasmaYok(page: Page, yol: string) {
  await page.waitForLoadState("networkidle")
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  const olcum = await page.evaluate(() => ({
    sayfa: document.documentElement.scrollWidth - window.innerWidth,
    tablolar: [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="table-container"]'
      ),
    ].map((t) => t.scrollWidth - t.clientWidth),
  }))
  expect(olcum.sayfa, `${yol} sayfası yatay kayıyor`).toBeLessThanOrEqual(0)
  return olcum.tablolar
}

test("375 px'te hiçbir sayfa yatay kaymaz; ana listeler kart gibi sığar", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await girisYap(page)
  for (const yol of SAYFALAR) {
    await page.goto(yol)
    const tablolar = await tasmaYok(page, yol)
    // Kasa ve berat matrisleri (mükellef × sistem / dönem) bilinçli olarak kendi içinde kayar
    if (
      [
        "/mukellefler",
        "/evrak-talepleri",
        "/e-belge/e-fatura",
        "/ayarlar/personel",
      ].includes(yol)
    ) {
      expect(
        tablolar.every((f) => f <= 0),
        `${yol} tablosu taşıyor`
      ).toBe(true)
    }
  }

  await page.goto("/mukellefler")
  // Dar ekranda mükellefler varsayılan olarak kart ızgarasında listelenir
  await page
    .getByRole("list", { name: "Mükellefler" })
    .getByRole("link")
    .first()
    .click()
  await expect(page).toHaveURL(/\/genel$/)
  const kart = new URL(page.url()).pathname.replace(/\/genel$/, "")
  for (const sekme of ["genel", "sifreler", "takvim", "arsiv", "gorevler"]) {
    await page.goto(`${kart}/${sekme}`)
    await tasmaYok(page, `${kart}/${sekme}`)
  }
})

test("menü mobilde gizlidir; tetikleyiciyle açılır, gezinince kapanır", async ({
  page,
}) => {
  await girisYap(page)
  const gorevlerLinki = page.getByRole("link", { name: "Görevler" })
  await expect(gorevlerLinki).toBeHidden()

  await page.getByRole("button", { name: "Kenar çubuğunu aç/kapat" }).click()
  const menu = page.getByRole("dialog", { name: "Menü" })
  await expect(menu).toBeVisible()
  await menu.getByRole("link", { name: "Görevler" }).click()
  await expect(page).toHaveURL("/gorevler")
  await expect(menu).toBeHidden()
})

test("müşteri portalı 375 px'te kullanılabilir: kamera ve dosya seçimi görünür", async ({
  page,
}) => {
  const token = await aktifPortalTokeni(page)
  await page.goto(`/p/${token}`)
  const liste = page.getByRole("list", { name: "İstenen evraklar" })
  await expect(liste).toBeVisible()
  const ilk = liste.getByRole("listitem").first()
  await expect(ilk.getByText("Fotoğraf çek")).toBeInViewport({ ratio: 1 })
  await expect(ilk.getByText("Dosya seç")).toBeInViewport({ ratio: 1 })
  await tasmaYok(page, "/p/:token")
})
