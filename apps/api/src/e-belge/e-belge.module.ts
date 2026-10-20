import { TransactionHost } from "@nestjs-cls/transactional"
import { Module } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { SeedModule } from "../dev/seed.module.js"
import { MukellefModule } from "../mukellef/mukellef.module.js"
import { EBelgeController } from "./e-belge.controller.js"
import { EBelgeService } from "./e-belge.service.js"
import { Entegrator } from "./entegrator.js"
import { LucaHesapController } from "./luca-portal/luca-hesap.controller.js"
import { LucaOturumService } from "./luca-portal/luca-oturum.service.js"
import { LucaPortalEntegrator } from "./luca-portal/luca-portal.entegrator.js"
import { HttpLucaPortal, LucaPortal } from "./luca-portal/luca-portal.js"
import { apiMockLucaPortal } from "./luca-portal/mock-portal.js"

/** e-Fatura / e-Arşiv / e-Defter (Luca portalı), Luca hesabı ve kontör */
@Module({
  imports: [SeedModule, MukellefModule],
  controllers: [EBelgeController, LucaHesapController],
  providers: [
    {
      provide: LucaPortal,
      inject: [ENV, TransactionHost, Saat],
      useFactory: (env: Env, txHost: TransactionHost<DrizzleTx>, saat: Saat) =>
        env.LUCA_PORTAL === "http" ? new HttpLucaPortal() : apiMockLucaPortal(txHost, saat),
    },
    LucaOturumService,
    {
      provide: Entegrator,
      inject: [LucaOturumService, LucaPortal, Saat],
      useFactory: (oturum: LucaOturumService, portal: LucaPortal, saat: Saat) =>
        new LucaPortalEntegrator(oturum, portal, saat),
    },
    EBelgeService,
  ],
})
export class EBelgeModule {}
