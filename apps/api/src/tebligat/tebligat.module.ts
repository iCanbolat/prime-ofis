import { Module } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"
import { SeedModule } from "../dev/seed.module.js"
import { GorevModule } from "../gorev/gorev.module.js"
import {
  apiMockGibTebligat,
  apiMockKamuGiris,
  GibTebligat,
  HttpGibTebligat,
  HttpKamuGiris,
  KamuGiris,
} from "./gib-adapter.js"
import { GibOturumService } from "./gib-oturum.service.js"
import { KamuDogrulamaController, TebligatController } from "./tebligat.controller.js"
import { TebligatService } from "./tebligat.service.js"

/** e-Tebligat, GİB İnteraktif VD oturumu ve kamu doğrulama ekranları; gece işi `gece-gib` */
@Module({
  imports: [SeedModule, GorevModule],
  controllers: [TebligatController, KamuDogrulamaController],
  providers: [
    {
      provide: KamuGiris,
      inject: [ENV, Saat],
      useFactory: (env: Env, saat: Saat) =>
        env.GIB_ADAPTER === "http" ? new HttpKamuGiris() : apiMockKamuGiris(saat),
    },
    {
      provide: GibTebligat,
      inject: [ENV, Saat],
      useFactory: (env: Env, saat: Saat) =>
        env.GIB_ADAPTER === "http" ? new HttpGibTebligat() : apiMockGibTebligat(saat),
    },
    GibOturumService,
    TebligatService,
  ],
  exports: [GibOturumService],
})
export class TebligatModule {}
