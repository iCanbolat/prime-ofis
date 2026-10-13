import { Global, Module } from "@nestjs/common"

import { BuroController } from "./buro.controller.js"
import { BuroService } from "./buro.service.js"

@Global()
@Module({
  controllers: [BuroController],
  providers: [BuroService],
  exports: [BuroService],
})
export class BuroModule {}
