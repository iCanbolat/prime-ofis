import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"

// Nest DI, decorator metadata'sına ihtiyaç duyar; Vitest'in varsayılan dönüştürücüsü bunu üretmez.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Testler aynı Postgres veritabanını paylaşır ve her testten önce tablolar boşaltılır
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
})
