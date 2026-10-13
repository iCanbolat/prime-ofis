import { defineConfig, mergeConfig } from "vitest/config"

import viteConfig from "./vite.config.ts"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
      // Çok adımlı kullanıcı akışı testleri tek başına ~2 sn sürer; tüm dosyalar paralel koşarken
      // CPU yükü bunu varsayılan 5 sn sınırının üstüne çıkarabiliyor
      testTimeout: 15_000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/components/ui/**",
          "src/test/**",
          "src/**/*.test.{ts,tsx}",
          "src/main.tsx",
        ],
      },
    },
  })
)
