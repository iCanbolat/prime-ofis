import { TransactionHost } from "@nestjs-cls/transactional"
import { Module } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { SeedModule } from "../dev/seed.module.js"
import { EBelgeController } from "./e-belge.controller.js"
import { EBelgeService } from "./e-belge.service.js"
import { Entegrator, LucaEntegrator, MockEntegrator } from "./entegrator.js"

/** e-Fatura / e-Arşiv / e-Defter (Luca e-Entegratör) ve kontör */
@Module({
  imports: [SeedModule],
  controllers: [EBelgeController],
  providers: [
    {
      provide: Entegrator,
      inject: [ENV, TransactionHost, Saat],
      useFactory: (env: Env, txHost: TransactionHost<DrizzleTx>, saat: Saat) =>
        env.ENTEGRATOR === "luca" ? new LucaEntegrator() : new MockEntegrator(txHost, saat),
    },
    EBelgeService,
  ],
})
export class EBelgeModule {}
