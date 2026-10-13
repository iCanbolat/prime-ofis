import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import type { TestProject } from "vitest/node"

import { migrationlariUygula } from "../src/db/migrate.js"

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

let kapsayici: StartedPostgreSqlContainer | undefined

/**
 * Testler için Postgres: `TEST_DATABASE_URL` verilirse o kullanılır (hızlı yerel döngü,
 * `pnpm db:up` ile), yoksa Testcontainers ile geçici bir Postgres 17 başlatılır (Docker gerekir).
 */
export async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL
  if (!url) {
    kapsayici = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("prime_test")
      .withEnvironment({ TZ: "Europe/Istanbul" })
      .start()
    url = kapsayici.getConnectionUri()
  }
  await migrationlariUygula(url)
  project.provide("databaseUrl", url)
}

export async function teardown() {
  await kapsayici?.stop()
}
