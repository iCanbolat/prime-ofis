import { Global, Module } from "@nestjs/common"

import { BildirimController } from "./bildirim.controller.js"
import { BildirimService } from "./bildirim.service.js"

@Global()
@Module({
  controllers: [BildirimController],
  providers: [BildirimService],
  exports: [BildirimService],
})
export class BildirimModule {}
