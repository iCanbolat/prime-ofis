import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { aktifPortalTokeni, girisYap } from "./helpers"

const SAYFALAR = [
  "/",
  "/mukellefler",
  "/mukellefler/yeni",
  "/kasa",
  "/takvim",
  "/takvim?gorunum=liste",
  "/arsiv",
  "/evrak-talepleri",
  "/evrak-talepleri?sekme=gelen",
  "/gorevler",
  "/gorevler?gorunum=liste",
  "/e-belge/e-fatura",
  "/e-belge/e-arsiv",
  "/e-belge/e-defter",
  "/e-belge/baglantilar",
  "/tebligat",
  "/tebligat?erisim=",
  "/bordro",
  "/bordro?sekme=hareket",
  "/borc-levha",
  "/borc-levha?sekme=levha",
  "/borc-levha?sekme=yazi",
  "/borc-levha?dogrulama=",
  "/borc-levha?erisim=",
  "/tahsilat/ozet",
  "/tahsilat/cari",
  "/tahsilat/kesinti",
  "/fis-aktarimi/taslaklar",
  "/fis-aktarimi/taslaklar?fis=mf_g_fis_1_4_1",
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
  "/olmayan-sayfa",
]
const MUKELLEF_SEKMELERI = [
  "genel",
  "sifreler",
  "takvim",
  "arsiv",
  "evrak-talepleri",
  "gorevler",
  "e-belge",
  "tebligat",
  "bordro",
  "borc",
  "tahsilat",
  "fis-aktarimi",
]

/** Yükleme iskeletleri kaybolana kadar bekler. */
async function yuklenmesiniBekle(page: Page) {
  await page.waitForLoadState("networkidle")
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  await expect(page.getByText(/Yükleniyor/)).toHaveCount(0)
}

async function tara(page: Page) {
  await yuklenmesiniBekle(page)
  const sonuc = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  return sonuc.violations.map((v) => ({
    kural: v.id,
    etki: v.impact,
    ozet: v.help,
    ornekler: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    ...(process.env.AXE_RAPOR && {
      renkler: v.nodes.map((n) => {
        const d = n.any[0]?.data as Record<string, unknown> | undefined
        return `${d?.fgColor} / ${d?.bgColor} = ${d?.contrastRatio} :: ${n.html.slice(0, 140)}`
      }),
    }),
  }))
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`erişilebilirlik (${tema} tema)`, () => {
    test.use({ colorScheme: tema })

    test("uygulama sayfaları WCAG 2.1 AA ihlali içermez", async ({ page }) => {
      test.setTimeout(180_000)
      await girisYap(page)
      await page.goto("/mukellefler")
      await page.getByRole("table").getByRole("link").first().click()
      await expect(page).toHaveURL(/\/genel$/)
      const kart = new URL(page.url()).pathname.replace(/\/genel$/, "")

      const hatalar: Record<string, unknown> = {}
      const yollar = [
        ...SAYFALAR,
        ...MUKELLEF_SEKMELERI.map((s) => `${kart}/${s}`),
      ]
      for (const yol of yollar) {
        await page.goto(yol)
        const ihlaller = await tara(page)
        if (ihlaller.length) hatalar[yol] = ihlaller
      }
      expect(hatalar).toEqual({})
    })

    test("giriş ve müşteri portalı WCAG 2.1 AA ihlali içermez", async ({
      page,
    }) => {
      const token = await aktifPortalTokeni(page) // giriş ekranında kalır
      const hatalar: Record<string, unknown> = {}
      const giris = await tara(page)
      if (giris.length) hatalar["/login"] = giris

      await page.goto(`/p/${token}`)
      await expect(
        page.getByRole("list", { name: "İstenen evraklar" })
      ).toBeVisible()
      const portal = await tara(page)
      if (portal.length) hatalar["/p/:token"] = portal

      expect(hatalar).toEqual({})
    })
  })
}
