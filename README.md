# Prime Ofis

2-5 kişilik muhasebe büroları için mükellef, evrak ve görev takibi. Monorepo:

| Klasör | İçerik |
|---|---|
| `apps/client` | React 19 + Vite 8 SPA. Varsayılan olarak gerçek API'ye bağlanır; `VITE_ENABLE_MOCKS=true` ile MSW mock API |
| `apps/api` | NestJS 12 (Fastify) + Drizzle ORM + PostgreSQL + MinIO (S3) + pg-boss |
| `packages/shared` | Domain / API tipleri ve saf iş kuralları (takvim motoru, tahsilat, bordro kuralları …) — client ve api ortak |
| `packages/mock-data` | Deterministik seed (42), factory'ler, test fixture'ları — client MSW ve api testleri ortak |
| `docker/` | Dockerfile'lar (api, client = Caddy, minio), Caddyfile |
| `demo-client/` | **Ayrı repo** (`iCanbolat/prime-client`): MSW'li bağımsız demo. Bu repoya dahil değildir |

Planlar: `.claude/FRONTEND_PLAN.md` (frontend, tamamlandı) ve `.claude/backend.md` (backend fazları).

## Geliştirme

Gerekenler: Node 24 (en az 22.12), pnpm 10, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # SECRET_KEY: openssl rand -base64 32
pnpm db:up                                  # Postgres (127.0.0.1:5433) + MinIO (9000, konsol 9001)
pnpm --filter @prime/api db:migrate
pnpm dev                                    # shared/mock-data watch + api (3000) + client (5173, /api → 3000)
```

- Mock API ile (backend olmadan): `VITE_ENABLE_MOCKS=true pnpm --filter @prime/client dev`
- Postgres 5433'te çalışır (yerelde 5432 dolu olabilir); değiştirmek için `DEV_DB_PORT`.
- MinIO imajı kaynaktan derlenir (`docker/minio.Dockerfile`; resmi imajlar artık herkese açık değil).
  Yerelde eski resmi imaj varsa: `MINIO_IMAGE=minio/minio:latest pnpm db:up`.

## Komutlar

```bash
pnpm typecheck      # tüm paketler
pnpm lint
pnpm test           # client: Vitest + MSW · api: Vitest + Testcontainers Postgres (Docker gerekir)
pnpm build
pnpm --filter @prime/client test:e2e        # Playwright (mock API ile)
pnpm --filter @prime/api db:generate        # şema değişince SQL migration üret (git'e eklenir)
```

API testleri için hızlı yerel döngü: `TEST_DATABASE_URL=postgres://prime:prime@localhost:5433/prime_test` verilirse
Testcontainers yerine o veritabanı kullanılır (tablolar her testte boşaltılır).

## Üretim (Docker, 2 çekirdek / 4 GB VPS)

```bash
cp .env.example .env        # parolaları ve SECRET_KEY'i doldurun
docker compose up -d --build
```

Servisler: `client` (Caddy: SPA + `/api` proxy + otomatik HTTPS, 128 MB), `api` (1 GB), `migrate` (tek seferlik),
`db` (Postgres 17, 1 GB), `minio` (512 MB). Ayrıntı: `.claude/backend.md` § 4.
