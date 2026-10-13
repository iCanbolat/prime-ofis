import { Global, Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { ArsivYazici } from "./arsiv-yazici.js"
import { ArsivController } from "./arsiv.controller.js"
import { ArsivService } from "./arsiv.service.js"

@Global()
@Module({
  imports: [SeedModule],
  controllers: [ArsivController],
  providers: [ArsivService, ArsivYazici],
  exports: [ArsivYazici],
})
export class ArsivModule {}
