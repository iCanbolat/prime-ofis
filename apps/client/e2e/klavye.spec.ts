import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "@playwright/test"

import { girisYap } from "./helpers"

async function axeTemiz(page: Page, kapsam: string) {
  // Yükleme göstergesi (yarı saydam açılış animasyonu sırasında) taranmasın
  await expect(page.locator(`${kapsam} [aria-busy="true"]`)).toHaveCount(0)
  const sonuc = await new AxeBuilder({ page })
    .include(kapsam)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(
    sonuc.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)
  ).toEqual([])
}

/** Tab ile dolaşıldığında odak pencere dışına çıkmaz. */
async function odakIcerideKalir(page: Page, pencere: Locator, adim = 12) {
  for (let i = 0; i < adim; i++) {
    await page.keyboard.press("Tab")
    expect(
      await pencere.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true)
  }
}

test.beforeEach(async ({ page }) => {
  await girisYap(page)
})

test("'İçeriğe geç' bağlantısı ilk Tab durağıdır ve odağı içeriğe taşır", async ({
  page,
}) => {
  await page.goto("/mukellefler")
  await expect(page.getByRole("table")).toBeVisible()
  await page.keyboard.press("Tab")
  const atla = page.getByRole("link", { name: "İçeriğe geç" })
  await expect(atla).toBeFocused()
  await expect(atla).toBeInViewport()
  await page.keyboard.press("Enter")
  await expect(page.locator("#icerik")).toBeFocused()
  // Bir sonraki Tab menüyü atlayıp sayfa içeriğine gider
  await page.keyboard.press("Tab")
  expect(
    await page.evaluate(() =>
      document.getElementById("icerik")!.contains(document.activeElement)
    )
  ).toBe(true)
})

test("diyalog: klavyeyle açılır, odak içeride tutulur, Escape ile tetikleyiciye döner", async ({
  page,
}) => {
  await page.goto("/mukellefler")
  await page.getByRole("table").getByRole("link").first().click()
  const tetik = page.getByRole("button", { name: "Evrak iste" })
  await tetik.focus()
  await page.keyboard.press("Enter")

  const dialog = page.getByRole("dialog", { name: "Evrak iste" })
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement))
  ).toBe(true)
  await axeTemiz(page, '[role="dialog"]')
  await odakIcerideKalir(page, dialog)

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(tetik).toBeFocused()
})

test("görev detay sheet'i: klavyeyle açılır, erişilebilir, kapanınca odak karta döner", async ({
  page,
}) => {
  await page.goto("/gorevler")
  const kart = page
    .getByRole("region", { name: "Devam sütunu" })
    .getByRole("article")
    .first()
  const baslik = kart.getByRole("button").nth(1)
  await baslik.focus()
  await page.keyboard.press("Enter")

  const sheet = page.getByRole("dialog")
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/gorev=o_/)
  await axeTemiz(page, '[role="dialog"]')
  await odakIcerideKalir(page, sheet)

  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await expect(page).not.toHaveURL(/gorev=/)
  await expect(baslik).toBeFocused()
})

test("evrak talebi detay sheet'i: satırdaki butondan açılır, kapanınca odak geri döner", async ({
  page,
}) => {
  await page.goto("/evrak-talepleri")
  const satir = page
    .getByRole("table", { name: "Evrak talepleri" })
    .getByRole("row")
    .nth(1)
  const ac = satir.getByRole("button").first()
  await ac.focus()
  await page.keyboard.press("Enter")

  const sheet = page.getByRole("dialog")
  await expect(sheet).toBeVisible()
  await axeTemiz(page, '[role="dialog"]')

  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await expect(ac).toBeFocused()
})

test("kasa kilit penceresi ve ⌘K araması erişilebilir; arama klavyeyle gezinir", async ({
  page,
}) => {
  await page.goto("/kasa")
  await page.getByRole("button", { name: "Kilidi aç" }).click()
  const kilit = page.getByRole("dialog", { name: /kilidini aç/ })
  await expect(kilit.getByLabel("Ana şifre")).toBeFocused()
  await axeTemiz(page, '[role="dialog"]')
  await page.keyboard.press("Escape")
  await expect(kilit).toBeHidden()

  // Palet ilk açılışta tembel yüklenir
  await page.keyboard.press("ControlOrMeta+k")
  const arama = page.getByRole("dialog", { name: "Arama" })
  await expect(arama.getByRole("combobox")).toBeFocused()
  await axeTemiz(page, '[role="dialog"]')
  await page.keyboard.type("Görev")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/gorevler/)
})
