import { Global, Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { MukellefController } from "./mukellef.controller.js"
import { MukellefService } from "./mukellef.service.js"

@Global()
@Module({
  imports: [SeedModule],
  controllers: [MukellefController],
  providers: [MukellefService],
  exports: [MukellefService],
})
export class MukellefModule {}
