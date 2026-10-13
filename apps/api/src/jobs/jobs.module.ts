import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common"
import { PgBoss, type Job, type SendOptions, type WorkOptions } from "pg-boss"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"

export const ZAMAN_DILIMI = "Europe/Istanbul"

interface IsTanimi {
  ad: string
  isleyici: (isler: Job<object>[]) => Promise<unknown>
  secenekler: WorkOptions
  cron?: string
}

/**
 * pg-boss üzerinde kuyruk ve zamanlanmış işler (Redis yok; tablolar `pgboss` şemasında).
 *
 * Modüller `onModuleInit` içinde `isler.tanimla(...)` ile iş kaydeder; kayıtlar uygulama
 * açıldıktan sonra (`JOB_WORKERS=true` ise) pg-boss'a bağlanır. `JOB_WORKERS=false` olan süreç
 * (ör. ileride ikinci api kopyası) yalnızca `gonder` ile iş kuyruğa atar.
 */
@Injectable()
export class IsKuyrugu implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("IsKuyrugu")
  private readonly tanimlar: IsTanimi[] = []
  private boss: PgBoss | null = null
  private baslatma: Promise<PgBoss> | null = null

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** İş tanımı; `cron` verilirse İstanbul saatine göre zamanlanır (ör. `"0 3 * * *"`). */
  tanimla<T extends object>(
    ad: string,
    isleyici: (isler: Job<T>[]) => Promise<unknown>,
    secenekler: WorkOptions & { cron?: string } = {}
  ) {
    const { cron, ...workSecenekleri } = secenekler
    this.tanimlar.push({
      ad,
      isleyici: isleyici as IsTanimi["isleyici"],
      secenekler: workSecenekleri,
      cron,
    })
  }

  async gonder(ad: string, veri: object = {}, secenekler?: SendOptions) {
    const boss = await this.baslat()
    return boss.send(ad, veri, secenekler)
  }

  async onApplicationBootstrap() {
    if (!this.env.JOB_WORKERS) return
    const boss = await this.baslat()
    for (const t of this.tanimlar) {
      await boss.createQueue(t.ad)
      await boss.work(t.ad, t.secenekler, t.isleyici)
      if (t.cron) await boss.schedule(t.ad, t.cron, null, { tz: ZAMAN_DILIMI })
    }
    if (this.tanimlar.length) {
      this.logger.log(`${this.tanimlar.length} iş kaydedildi`)
    }
  }

  async onApplicationShutdown() {
    if (!this.baslatma) return
    const boss = await this.baslatma
    await boss.stop({ graceful: true, timeout: 10_000 })
  }

  private baslat(): Promise<PgBoss> {
    this.baslatma ??= (async () => {
      const boss = new PgBoss({
        connectionString: this.env.DATABASE_URL,
        schema: "pgboss",
        max: 3,
        application_name: "prime-jobs",
      })
      boss.on("error", (hata) => this.logger.error(hata))
      await boss.start()
      this.boss = boss
      return boss
    })()
    return this.baslatma
  }

  /** Sağlık kontrolü: pg-boss başlatıldıysa çalışıyor mu */
  get calisiyor() {
    return this.boss !== null
  }
}

@Global()
@Module({ providers: [IsKuyrugu], exports: [IsKuyrugu] })
export class JobsModule {}
