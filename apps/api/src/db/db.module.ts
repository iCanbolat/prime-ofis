import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common"
import { ClsPluginTransactional } from "@nestjs-cls/transactional"
import { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { ClsModule } from "nestjs-cls"
import pg from "pg"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import * as schema from "./schema/index.js"

export type Veritabani = NodePgDatabase<typeof schema>
/** `TransactionHost<DrizzleTx>` — `@Transactional()` içindeki çağrılar aynı transaction'ı kullanır */
export type DrizzleTx = TransactionalAdapterDrizzleOrm<Veritabani>

export const PG_POOL = Symbol("PG_POOL")
export const DB = Symbol("DB")

/** `numeric` kolonlar JS number, `date` kolonlar `yyyy-MM-dd` metni olarak döner */
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)

@Injectable()
class PoolKapatici implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}
  async onApplicationShutdown() {
    await this.pool.end()
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) =>
        new pg.Pool({
          connectionString: env.DATABASE_URL,
          max: env.DB_POOL_MAX,
          application_name: "prime-api",
        }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Veritabani =>
        drizzle({ client: pool, schema, casing: "snake_case" }),
    },
    PoolKapatici,
  ],
  exports: [PG_POOL, DB],
})
class DbCekirdekModule {}

/** Veritabanı + `@Transactional()` desteği (nestjs-cls, AsyncLocalStorage) */
@Module({
  imports: [
    DbCekirdekModule,
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [DbCekirdekModule],
          adapter: new TransactionalAdapterDrizzleOrm<Veritabani>({
            drizzleInstanceToken: DB,
          }),
        }),
      ],
    }),
  ],
  exports: [DbCekirdekModule],
})
export class DbModule {}
