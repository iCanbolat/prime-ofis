import { Global, Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"

import { AuthController } from "./auth.controller.js"
import { GirisSiniri } from "./giris-siniri.js"
import { OturumGuard } from "./oturum.guard.js"
import { OturumService } from "./oturum.service.js"
import { SifreService } from "./sifre.service.js"

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SifreService,
    OturumService,
    GirisSiniri,
    { provide: APP_GUARD, useClass: OturumGuard },
  ],
  exports: [SifreService, OturumService],
})
export class AuthModule {}
