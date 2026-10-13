import { Module } from "@nestjs/common"

import { BuroModule } from "../buro/buro.module.js"
import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { SeedModule } from "../dev/seed.module.js"
import { TahsilatModule } from "../tahsilat/tahsilat.module.js"
import { BildirimGonderimi } from "./bildirim-gonderimi.js"
import { GercekKanalSaglayici } from "./gercek-saglayici.js"
import { GonderimService } from "./gonderim.service.js"
import {
  BildirimTercihController,
  GonderimController,
  KanalController,
  WhatsappWebhookController,
} from "./kanal.controller.js"
import { KanalService } from "./kanal.service.js"
import { MukellefGonderimi } from "./mukellef-gonderimi.js"
import { KanalSaglayici, MockKanalSaglayici } from "./saglayici.js"

/**
 * Dış gönderim kanalları (e-posta, WhatsApp; Telegram ertelendi), personel bildirim tercihleri,
 * outbox ve mükellefe gönderim.
 */
@Module({
  imports: [SeedModule, BuroModule, TahsilatModule],
  controllers: [
    KanalController,
    BildirimTercihController,
    GonderimController,
    WhatsappWebhookController,
  ],
  providers: [
    {
      provide: KanalSaglayici,
      inject: [ENV],
      useFactory: (env: Env) =>
        (env.KANAL_ADAPTER ?? (env.NODE_ENV === "production" ? "gercek" : "mock")) === "gercek"
          ? new GercekKanalSaglayici()
          : new MockKanalSaglayici(),
    },
    KanalService,
    GonderimService,
    BildirimGonderimi,
    MukellefGonderimi,
  ],
  exports: [GonderimService],
})
export class KanalModule {}
