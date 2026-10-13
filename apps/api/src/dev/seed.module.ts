import { Global, Module } from "@nestjs/common"

import { SeedYukleyici } from "./seed-yukleyici.js"

/** Seed yükleyici her zaman var (testler kullanır); HTTP uçları ayrı `DevModule`'de */
@Global()
@Module({ providers: [SeedYukleyici], exports: [SeedYukleyici] })
export class SeedModule {}
