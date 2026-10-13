import { Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { IceAktarimController } from "./ice-aktarim.controller.js"
import { IceAktarimService } from "./ice-aktarim.service.js"

/** Tahakkuk fişi ve mizan içe aktarımı */
@Module({
  imports: [SeedModule],
  controllers: [IceAktarimController],
  providers: [IceAktarimService],
})
export class IceAktarimModule {}
