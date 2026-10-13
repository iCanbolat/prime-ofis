import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT) || 5173

/**
 * Uçtan uca testler MSW mock API'si açık dev server üzerinde koşar (`VITE_ENABLE_MOCKS=true`).
 * İlk kurulum: `pnpm exec playwright install chromium`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    locale: "tr-TR",
  },
  projects: [
    // Masaüstü: iş akışları, erişilebilirlik, klavye
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobil\.spec\.ts/,
    },
    // Mobil: responsive düzen, menü, portal
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /(mobil|smoke)\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_ENABLE_MOCKS: "true" },
  },
})
