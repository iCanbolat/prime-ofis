import { Inject, Injectable } from "@nestjs/common"

import { DEMO_GIRIS_SIFRESI } from "@prime/mock-data/factories/personel"
import { createSeed, DEFAULT_SEED } from "@prime/mock-data/seed"
import type { DbState } from "@prime/mock-data/state"

import { SifreService } from "../auth/sifre.service.js"
import { Saat } from "../core/saat.js"
import { tablolariBosalt } from "../db/bosalt.js"
import { DB, type Veritabani } from "../db/db.module.js"
import { aktivite, bildirim, buro, personel, personelKimlik } from "../db/schema/index.js"
import { DosyaDeposu } from "../storage/dosya-deposu.js"

/** Bir modülün seed koleksiyonlarını tablolarına yazan adım (FK sırasına göre kaydedilir) */
export type SeedAdimi = (state: DbState, db: Veritabani) => Promise<void>

/**
 * `@prime/mock-data` seed'ini (client MSW ile aynı veri) veritabanına yükler: dev reset ve
 * test fixture'ları. Her faz kendi tablolarının adımını `adimEkle` ile ekler.
 */
@Injectable()
export class SeedYukleyici {
  private readonly adimlar: SeedAdimi[] = []
  private demoOzeti: Promise<string> | null = null

  constructor(
    @Inject(DB) private readonly db: Veritabani,
    private readonly depo: DosyaDeposu,
    private readonly sifreler: SifreService,
    private readonly saat: Saat
  ) {
    this.adimlar.push((state, db) => this.cekirdek(state, db))
  }

  adimEkle(adim: SeedAdimi) {
    this.adimlar.push(adim)
  }

  /** Tabloları ve depoyu boşaltır, seed'i yükler */
  async sifirla(seed = DEFAULT_SEED) {
    await tablolariBosalt(this.db)
    await this.depo.temizle()
    await this.yukle(createSeed(seed))
  }

  async yukle(state: DbState) {
    await this.db.transaction(async (tx) => {
      for (const adim of this.adimlar) await adim(state, tx as unknown as Veritabani)
    })
  }

  /** Faz 1: büro, personel, giriş şifreleri (hepsi `demo1234`), aktivite, bildirim */
  private async cekirdek(state: DbState, db: Veritabani) {
    if (state.buro.length) await db.insert(buro).values(state.buro)
    if (state.personel.length) await db.insert(personel).values(state.personel)
    // Mock'taki PBKDF2 özetleri yerine argon2: hepsi aynı demo şifresi, bir kez hesaplanır
    this.demoOzeti ??= this.sifreler.ozetle(DEMO_GIRIS_SIFRESI)
    const hash = await this.demoOzeti
    const kimlikler = state.kimlik.filter((k) => state.personel.some((p) => p.id === k.id))
    if (kimlikler.length) {
      await db.insert(personelKimlik).values(
        kimlikler.map((k) => ({ personelId: k.id, hash, guncelleme: this.saat.simdiIso() }))
      )
    }
    if (state.aktivite.length) await db.insert(aktivite).values(state.aktivite)
    if (state.bildirim.length) await db.insert(bildirim).values(state.bildirim)
  }
}
