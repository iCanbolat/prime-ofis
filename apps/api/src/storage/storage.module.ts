import { Global, Module } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { DosyaDeposu } from "./dosya-deposu.js"
import { S3DosyaDeposu } from "./s3-dosya-deposu.js"

@Global()
@Module({
  providers: [
    {
      provide: DosyaDeposu,
      inject: [ENV],
      useFactory: (env: Env) => new S3DosyaDeposu(env),
    },
  ],
  exports: [DosyaDeposu],
})
export class StorageModule {}
