import { Global, Module } from "@nestjs/common"

import { Saat } from "./saat.js"
import { SecretBox } from "./secret-box.js"

@Global()
@Module({ providers: [Saat, SecretBox], exports: [Saat, SecretBox] })
export class CoreModule {}
