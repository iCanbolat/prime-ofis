import { TransactionHost } from "@nestjs-cls/transactional"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { eq, inArray } from "drizzle-orm"

import { turKategorisi } from "@prime/shared/bildirim/kategori"
import { personelKanallari } from "@prime/shared/kanal/kurallar"
import type { Bildirim, KanalTip, Personel } from "@prime/shared/types/domain"

import { BildirimService, type BildirimGonderimKancasi } from "../bildirim/bildirim.service.js"
import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import type { DrizzleTx } from "../db/db.module.js"
import { personel } from "../db/schema/index.js"
import { GonderimService, type YeniGonderim } from "./gonderim.service.js"
import { KanalService } from "./kanal.service.js"

function adres(p: Personel, kanal: KanalTip): string | undefined {
  if (kanal === "EPOSTA") return p.eposta
  if (kanal === "WHATSAPP") return p.telefon
  return undefined // Telegram ertelendi
}

/**
 * Uygulama içi bildirimi personelin tercihine göre dış kanallara dağıtır (mock
 * `bildirimGonderimleri`): kişiye özelse o kişi, yayınsa aktör dışındaki aktif personel.
 * Satırlar bildirimle aynı transaction'da kuyruğa yazılır.
 */
@Injectable()
export class BildirimGonderimi implements BildirimGonderimKancasi, OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    @Inject(ENV) private readonly env: Env,
    private readonly bildirimler: BildirimService,
    private readonly kanallar: KanalService,
    private readonly gonderimler: GonderimService
  ) {}

  onModuleInit() {
    this.bildirimler.gonderimKancasiAyarla(this)
  }

  async eklendi(bildirimler: Bildirim[]) {
    const hazir = await this.kanallar.hazirKanallar()
    if (!hazir.size) return

    const kisiye = [...new Set(bildirimler.flatMap((b) => (b.aliciId ? [b.aliciId] : [])))]
    const yayinVar = bildirimler.some((b) => b.aliciId === null)
    const tx = this.txHost.tx
    const kisiler = yayinVar
      ? await tx.select().from(personel).where(eq(personel.aktif, true))
      : kisiye.length
        ? await tx.select().from(personel).where(inArray(personel.id, kisiye))
        : []
    // Kişiye özel bildirim pasif personele de gidebilir (mock ile aynı); yayın yalnızca aktiflere
    if (yayinVar) {
      const eksik = kisiye.filter((id) => !kisiler.some((p) => p.id === id))
      if (eksik.length)
        kisiler.push(...(await tx.select().from(personel).where(inArray(personel.id, eksik))))
    }
    const kisiMap = new Map(kisiler.map((p) => [p.id, p as Personel]))
    const tercihler = new Map(
      (await this.kanallar.tercihler([...kisiMap.keys()])).map((t) => [t.id, t])
    )

    const yeniler: YeniGonderim[] = []
    for (const b of bildirimler) {
      const alicilar =
        b.aliciId !== null
          ? [kisiMap.get(b.aliciId)].filter((p): p is Personel => Boolean(p))
          : kisiler.filter((p) => p.aktif && p.id !== b.aktorId)
      const kategori = turKategorisi(b.tur)
      const metin = [b.baslik, b.aciklama, b.link && `${this.env.APP_URL}${b.link}`]
        .filter(Boolean)
        .join("\n")
      for (const p of alicilar) {
        for (const tip of personelKanallari(tercihler.get(p.id), kategori)) {
          const hedef = adres(p, tip)
          if (!hazir.has(tip) || !hedef) continue
          yeniler.push({
            kanal: tip,
            aliciTip: "PERSONEL",
            aliciId: p.id,
            aliciAd: `${p.ad} ${p.soyad}`,
            hedefAdres: hedef,
            konu: b.baslik,
            metin,
            sablon: tip === "WHATSAPP" ? "PERSONEL_HATIRLATMA" : undefined,
            parametreler: [b.baslik, b.aciklama ?? ""],
            kaynak: "BILDIRIM",
            kaynakId: b.id,
            anahtar: `BILDIRIM:${b.id}:${p.id}:${tip}`,
          })
        }
      }
    }
    await this.gonderimler.kuyrugaAl(yeniler)
  }
}
