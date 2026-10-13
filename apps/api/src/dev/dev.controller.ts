import { Controller, Get, HttpCode, Inject, Post } from "@nestjs/common"
import { sql } from "drizzle-orm"

import { Public } from "../auth/auth.decorators.js"
import { uygulamaTablolari } from "../db/bosalt.js"
import { DB, type Veritabani } from "../db/db.module.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"
import { SeedYukleyici } from "./seed-yukleyici.js"

/** Yalnızca `DEV_ARACLARI=true` iken yüklenir (production'da env doğrulaması yasaklar) */
@Controller("dev")
export class DevController {
  constructor(
    @Inject(DB) private readonly db: Veritabani,
    private readonly seed: SeedYukleyici,
    private readonly isler: IsKuyrugu
  ) {}

  /** Oturum gerektirmez: sıfırlama tüm oturumları da siler (ilk kurulumda kullanıcı yoktur) */
  @Public()
  @Post("reset")
  @HttpCode(204)
  async reset() {
    await this.seed.sifirla()
    // Seed geçmiş tarihli: açılışta çalışan işler (ör. aylık ücret borçları) bugüne yetişsin
    await this.isler.acilisIsleriniGonder()
  }

  /** Tablo başına satır sayısı; client bu uç 200 dönerse Geliştirici sayfasını gösterir */
  @Public()
  @Get("stats")
  async stats() {
    const sonuc: Record<string, number> = {}
    for (const tablo of await uygulamaTablolari(this.db)) {
      const { rows } = await this.db.execute<{ n: number }>(
        sql.raw(`select count(*)::int as n from "public"."${tablo}"`)
      )
      sonuc[tablo] = rows[0]?.n ?? 0
    }
    return sonuc
  }
}
