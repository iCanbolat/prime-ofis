import { Module } from "@nestjs/common"

import { SeedModule } from "../dev/seed.module.js"
import { CariYazici } from "./cari-yazici.js"
import { TahsilatController, UcretController } from "./tahsilat.controller.js"
import { TahsilatService } from "./tahsilat.service.js"
import { UcretBorclari } from "./ucret-borclari.js"

/** Büronun mükelleflerle cari hesabı, aylık ücret borçları ve İVD kesinti kontrolü */
@Module({
  imports: [SeedModule],
  controllers: [TahsilatController, UcretController],
  providers: [TahsilatService, CariYazici, UcretBorclari],
  exports: [UcretBorclari],
})
export class TahsilatModule {}
