import { Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { EvrakTalebiController, GelenEvrakController } from "./evrak-talebi.controller.js"
import { EvrakTalebiService } from "./evrak-talebi.service.js"
import { GelenEvrakService } from "./gelen-evrak.service.js"
import { PortalSiniri } from "./portal-siniri.js"
import { PortalController } from "./portal.controller.js"
import { PortalService } from "./portal.service.js"

/** Evrak talepleri, gelen evrak incelemesi ve müşteri portalı */
@Module({
  imports: [SeedModule],
  controllers: [EvrakTalebiController, GelenEvrakController, PortalController],
  providers: [EvrakTalebiService, GelenEvrakService, PortalService, PortalSiniri],
})
export class EvrakModule {}
