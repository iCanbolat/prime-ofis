import { Global, Module, type DynamicModule } from "@nestjs/common"

import { envOku, type Env } from "./env.js"

/** Doğrulanmış ortam değişkenleri: `@Inject(ENV) env: Env` */
export const ENV = Symbol("ENV")

@Global()
@Module({})
export class ConfigModule {
  /** `ortam` verilirse `process.env` üzerine yazılır (testler kendi değerlerini verir). */
  static forRoot(ortam?: Record<string, string | undefined>): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: ENV,
          useFactory: (): Env => envOku({ ...process.env, ...ortam }),
        },
      ],
      exports: [ENV],
    }
  }
}
