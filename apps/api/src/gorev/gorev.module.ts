import { Global, Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { GorevMaddesiService } from "./gorev-maddesi.service.js"
import { GorevController } from "./gorev.controller.js"
import { GorevService } from "./gorev.service.js"

@Global()
@Module({
  imports: [SeedModule],
  controllers: [GorevController],
  providers: [GorevService, GorevMaddesiService],
  exports: [GorevService, GorevMaddesiService],
})
export class GorevModule {}
