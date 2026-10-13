import { Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { EvrakTalebiController, GelenEvrakController } from "./evrak-talebi.controller.js"
import { EvrakTalebiService } from "./evrak-talebi.service.js"
import { GelenEvrakService } from "./gelen-evrak.service.js"

/** Evrak talepleri, gelen evrak incelemesi ve müşteri portalı */
@Module({
  imports: [SeedModule],
  controllers: [EvrakTalebiController, GelenEvrakController],
  providers: [EvrakTalebiService, GelenEvrakService],
})
export class EvrakModule {}
