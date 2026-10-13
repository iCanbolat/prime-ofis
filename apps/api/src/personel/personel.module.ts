import { Global, Module } from "@nestjs/common"

import { PersonelController } from "./personel.controller.js"
import { PersonelService } from "./personel.service.js"

@Global()
@Module({
  controllers: [PersonelController],
  providers: [PersonelService],
  exports: [PersonelService],
})
export class PersonelModule {}
