import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import { HttpException } from "@nestjs/common"
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify"
import { Logger } from "nestjs-pino"

import { HataFiltresi, varsayilanMesaj } from "./core/hata.filter.js"

/**
 * Tek dosyanın sınırı 10 MB; base64 JSON'da ≈ 13.4 MB eder. Toplu dosya uçları (tahakkuk,
 * bordro) ilgili fazda route bazında daha yüksek sınır alır.
 */
export const GOVDE_SINIRI = 15 * 1024 * 1024
export const BUYUK_GOVDE_SINIRI = 60 * 1024 * 1024

/** Toplu dosya yükleyen uçlar (`METOT yol`): gövde sınırı `BUYUK_GOVDE_SINIRI` */
const BUYUK_GOVDE_YOLLARI = new Set(["POST /api/ice-aktarim/tahakkuklar"])

/**
 * Fastify'ın kendi hataları (bozuk JSON, çok büyük gövde, desteklenmeyen içerik türü …) Nest
 * tarafından İngilizce mesajla `HttpException`'a çevrilir; burada Türkçe `{ message }` olur.
 */
class PrimeFastifyAdapter extends FastifyAdapter {
  override mapException(hata: unknown) {
    if (hata instanceof Error && hata.name === "FastifyError") {
      const status = (hata as Error & { statusCode?: number }).statusCode ?? 400
      return new HttpException({ message: varsayilanMesaj(status) }, status)
    }
    return super.mapException(hata)
  }
}

export function fastifyAdapter() {
  return new PrimeFastifyAdapter({
    bodyLimit: GOVDE_SINIRI,
    // Caddy arkasında: istemci IP'si X-Forwarded-For'dan (rate limit, oturum kaydı)
    trustProxy: true,
    // pino-http (nestjs-pino) loglar; Fastify'ın kendi logger'ı kapalı
    logger: false,
  })
}

/** main.ts ve testler aynı yapılandırmayı kullanır */
export async function uygulamayiYapilandir(app: NestFastifyApplication) {
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix("api")
  // Route'lar `init`'te kaydolur; kanca ondan önce eklenmeli
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRoute", (route) => {
      const metotlar = [route.method].flat()
      if (metotlar.some((m) => BUYUK_GOVDE_YOLLARI.has(`${m} ${route.url}`))) {
        route.bodyLimit = BUYUK_GOVDE_SINIRI
      }
    })
  app.useGlobalFilters(new HataFiltresi())
  app.enableShutdownHooks()

  await app.register(helmet, {
    // Yalnızca JSON döner; SPA başlıklarını Caddy verir
    contentSecurityPolicy: false,
  })
  await app.register(cookie)
  // Global değil: login, portal gibi uçlar `config.rateLimit` ile açar (Faz 1+)
  await app.register(rateLimit, { global: false })
  return app
}
