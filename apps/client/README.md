# @prime/client

Prime Ofis web arayüzü: React 19 · Vite 8 · TypeScript · Tailwind v4 · shadcn/ui (Base UI) · TanStack Query · React Router 8.
Genel kurulum ve monorepo komutları için kök `README.md`'ye bakın.

## Çalışma kipleri

| Kip | Komut | API |
|---|---|---|
| Gerçek API (varsayılan) | `pnpm dev` | Vite proxy `/api` → `API_URL` (varsayılan `http://localhost:3000`) |
| Mock API | `VITE_ENABLE_MOCKS=true pnpm dev` | MSW, tarayıcıda (`src/mocks/handlers`) |

- Vitest testleri her zaman MSW'nin node sunucusuyla çalışır (`src/test/setup.ts`); Playwright testleri mock kipte dev server açar.
- Saf iş kuralları ve tipler `@prime/shared/*`, seed / fixture'lar `@prime/mock-data/*` altından gelir; Vite ve TypeScript bu paketleri
  kaynaktan derler (alias: `vite.config.ts`, `tsconfig.app.json`), ayrı build adımı gerekmez.
- Bağımsız demo (Vercel, yalnızca mock) ayrı repodadır: `demo-client/` (`iCanbolat/prime-client`).

## Komutlar

```bash
pnpm dev
pnpm test           # Vitest (birim + bileşen + akış, MSW)
pnpm test:e2e       # Playwright (mock kip) — ilk kez: pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm build
```
