import { Module, RequestMethod, type DynamicModule } from "@nestjs/common"
import { LoggerModule } from "nestjs-pino"

import { ConfigModule, ENV } from "./config/config.module.js"
import type { Env } from "./config/env.js"
import { CoreModule } from "./core/core.module.js"
import { DbModule } from "./db/db.module.js"
import { HealthController } from "./health/health.controller.js"
import { JobsModule } from "./jobs/jobs.module.js"
import { StorageModule } from "./storage/storage.module.js"

/** Loglarda asla görünmemesi gerekenler (gövde zaten loglanmaz; başlıklar ve hata nesneleri için) */
const REDAKSIYON = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.sifre",
  "*.yoneticiSifresi",
  "*.dataUrl",
  "*.gorselDataUrl",
]

@Module({})
export class AppModule {
  /** `ortam`: ham ortam değişkenleri, `process.env` üzerine yazılır (testler için) */
  static forRoot(ortam?: Record<string, string | undefined>): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(ortam),
        LoggerModule.forRootAsync({
          inject: [ENV],
          useFactory: (env: Env) => ({
            // Docker healthcheck her 15 sn'de bir çağırır; log kirliliği olmasın
            exclude: [{ method: RequestMethod.GET, path: "health" }],
            pinoHttp: {
              level: env.LOG_LEVEL,
              redact: { paths: REDAKSIYON, censor: "[gizli]" },
              // Başlıklar loglanmaz; istek satırı ve süre yeterli
              serializers: {
                req: (req: { id: unknown; method: string; url: string }) => ({
                  id: req.id,
                  method: req.method,
                  url: req.url,
                }),
                res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
              },
              transport:
                env.NODE_ENV === "development"
                  ? { target: "pino-pretty", options: { singleLine: true } }
                  : undefined,
            },
          }),
        }),
        CoreModule,
        DbModule,
        StorageModule,
        JobsModule,
      ],
      controllers: [HealthController],
    }
  }
}
