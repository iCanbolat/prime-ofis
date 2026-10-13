import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5173,
    // Gerçek API (apps/api). MSW açıkken (`VITE_ENABLE_MOCKS=true`) istekler tarayıcıda karşılanır.
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:3000",
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Nadiren değişen kütüphaneler ayrı chunk'larda: uygulama kodu değişince
        // tarayıcı önbelleğindeki vendor dosyaları geçerli kalır. Base UI bilinçli olarak
        // gruplanmadı: tek chunk'ta toplanınca tembel sayfaların bileşenleri (select, menü…)
        // ilk yüklemeye çekiliyor (+~9 kB gzip).
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-data",
              test: /node_modules[\\/](@tanstack[\\/]query-core|@tanstack[\\/]react-query|zustand|date-fns)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    // Paylaşılan paketler kaynaktan derlenir (build adımı beklenmez, HMR çalışır).
    // api derlenmiş `dist`'i kullanır.
    alias: {
      "@prime/shared": path.resolve(import.meta.dirname, "../../packages/shared/src"),
      "@prime/mock-data": path.resolve(
        import.meta.dirname,
        "../../packages/mock-data/src"
      ),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["zod", "date-fns", "@faker-js/faker"],
  },
})
