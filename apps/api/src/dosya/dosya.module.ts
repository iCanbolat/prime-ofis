import { Global, Module } from "@nestjs/common"

import { DosyaErisimKaydi } from "./dosya-erisim-kaydi.js"
import { DosyaService } from "./dosya.service.js"

@Global()
@Module({
  providers: [DosyaService, DosyaErisimKaydi],
  exports: [DosyaService, DosyaErisimKaydi],
})
export class DosyaModule {}
