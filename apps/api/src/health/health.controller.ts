import { Controller, Get, HttpException, Inject } from "@nestjs/common"
import { sql } from "drizzle-orm"

import { Public } from "../auth/auth.decorators.js"
import { DB, type Veritabani } from "../db/db.module.js"
import { DosyaDeposu } from "../storage/dosya-deposu.js"

type Durum = "ok" | "hata"

/** `GET /api/health` — Docker healthcheck ve Caddy için. Bağımlılık hatasında 503. */
@Public()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Veritabani,
    private readonly depo: DosyaDeposu
  ) {}

  @Get()
  async kontrol() {
    const [db, depo] = await Promise.all([
      this.dene(() => this.db.execute(sql`select 1`)),
      this.dene(() => this.depo.ping()),
    ])
    const sonuc = { durum: db === "ok" && depo === "ok" ? "ok" : "hata", db, depo }
    if (sonuc.durum !== "ok") {
      throw new HttpException({ message: "Servis kullanılamıyor", ...sonuc }, 503)
    }
    return sonuc
  }

  private async dene(fn: () => Promise<unknown>): Promise<Durum> {
    try {
      await fn()
      return "ok"
    } catch {
      return "hata"
    }
  }
}
