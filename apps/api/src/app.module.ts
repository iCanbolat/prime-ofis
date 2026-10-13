import { Module, RequestMethod, type DynamicModule } from "@nestjs/common"
import { LoggerModule } from "nestjs-pino"

import { AktiviteModule } from "./aktivite/aktivite.module.js"
import { AuthModule } from "./auth/auth.module.js"
import { BildirimModule } from "./bildirim/bildirim.module.js"
import { BuroModule } from "./buro/buro.module.js"
import { ConfigModule, ENV } from "./config/config.module.js"
import { envOku, type Env } from "./config/env.js"
import { CoreModule } from "./core/core.module.js"
import { DbModule } from "./db/db.module.js"
import { DevModule } from "./dev/dev.module.js"
import { SeedModule } from "./dev/seed.module.js"
import { DosyaModule } from "./dosya/dosya.module.js"
import { HealthController } from "./health/health.controller.js"
import { JobsModule } from "./jobs/jobs.module.js"
import { KasaModule } from "./kasa/kasa.module.js"
import { MukellefModule } from "./mukellef/mukellef.module.js"
import { PersonelModule } from "./personel/personel.module.js"
import { StorageModule } from "./storage/storage.module.js"
import { TakvimModule } from "./takvim/takvim.module.js"

/** Loglarda asla görünmemesi gerekenler (gövde zaten loglanmaz; başlıklar ve hata nesneleri için) */
const REDAKSIYON = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.sifre",
  "*.yoneticiSifresi",
  "*.eposta",
  "*.dataUrl",
  "*.gorselDataUrl",
]

@Module({})
export class AppModule {
  /** `ortam`: ham ortam değişkenleri, `process.env` üzerine yazılır (testler için) */
  static forRoot(ortam?: Record<string, string | undefined>): DynamicModule {
    const env = envOku({ ...process.env, ...ortam })
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
        AuthModule,
        BildirimModule,
        AktiviteModule,
        PersonelModule,
        BuroModule,
        MukellefModule,
        KasaModule,
        TakvimModule,
        DosyaModule,
        SeedModule,
        ...(env.DEV_ARACLARI ? [DevModule] : []),
      ],
      controllers: [HealthController],
    }
  }
}
