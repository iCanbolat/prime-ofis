import { Global, Module } from "@nestjs/common"

import { BildirimController } from "./bildirim.controller.js"
import {
  BildirimGonderimKancasi,
  BildirimService,
  BosGonderimKancasi,
} from "./bildirim.service.js"

@Global()
@Module({
  controllers: [BildirimController],
  providers: [
    BildirimService,
    { provide: BildirimGonderimKancasi, useClass: BosGonderimKancasi },
  ],
  exports: [BildirimService],
})
export class BildirimModule {}
