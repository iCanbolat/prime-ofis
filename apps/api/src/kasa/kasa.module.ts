import { Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { KasaController } from "./kasa.controller.js"
import { KasaService } from "./kasa.service.js"

@Module({
  imports: [SeedModule],
  controllers: [KasaController],
  providers: [KasaService],
})
export class KasaModule {}
