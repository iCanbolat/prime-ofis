import { Global, Module } from "@nestjs/common"

import { HatirlatmaService } from "./hatirlatma.service.js"

/** Zamana bağlı hatırlatmalar; modüller `HatirlatmaService.ureticiEkle` ile kural ekler */
@Global()
@Module({ providers: [HatirlatmaService], exports: [HatirlatmaService] })
export class HatirlatmaModule {}
