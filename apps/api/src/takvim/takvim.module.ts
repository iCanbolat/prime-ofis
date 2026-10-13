import { Global, Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { BeyanDurumuService } from "./beyan-durumu.service.js"
import { TakvimController } from "./takvim.controller.js"
import { TakvimService } from "./takvim.service.js"

@Global()
@Module({
  imports: [SeedModule],
  controllers: [TakvimController],
  providers: [TakvimService, BeyanDurumuService],
  exports: [BeyanDurumuService, TakvimService],
})
export class TakvimModule {}
