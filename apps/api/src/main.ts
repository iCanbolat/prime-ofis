import "reflect-metadata"

import { existsSync } from "node:fs"

import { NestFactory } from "@nestjs/core"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"

import { fastifyAdapter, uygulamayiYapilandir } from "./app.factory.js"
import { AppModule } from "./app.module.js"
import { envOku } from "./config/env.js"

async function bootstrap() {
  // Geliştirmede apps/api/.env; container'larda değişkenler compose'dan gelir
  if (existsSync(".env")) process.loadEnvFile(".env")
  const env = envOku()
  if (process.env.TZ !== "Europe/Istanbul") {
    // Takvim ve süre kuralları (packages/shared/lib/tarih) yerel saat kullanır
    console.warn(`TZ=Europe/Istanbul olmalı (şu an: ${process.env.TZ ?? "tanımsız"})`)
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(),
    fastifyAdapter(),
    { bufferLogs: true }
  )
  await uygulamayiYapilandir(app)
  await app.listen(env.PORT, env.HOST)
}

void bootstrap()
