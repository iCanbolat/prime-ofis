import { Global, Module } from "@nestjs/common"

import { Saat } from "./saat.js"

@Global()
@Module({ providers: [Saat], exports: [Saat] })
export class CoreModule {}
