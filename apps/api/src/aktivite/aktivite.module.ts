import { Global, Module } from "@nestjs/common"

import { AktiviteController } from "./aktivite.controller.js"
import { AktiviteService } from "./aktivite.service.js"

@Global()
@Module({
  controllers: [AktiviteController],
  providers: [AktiviteService],
  exports: [AktiviteService],
})
export class AktiviteModule {}
