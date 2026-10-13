import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { eq } from "drizzle-orm"

import { SABLON_TIPLERI, sablonHatasi } from "@prime/shared/evrak-talebi/mesaj"
import type { Buro, Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { nullsuz } from "../core/nullsuz.js"
import type { DrizzleTx } from "../db/db.module.js"
import { buro } from "../db/schema/index.js"

@Injectable()
export class BuroService {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService
  ) {}

  /** Kurulum başına tek büro; yoksa (kurulum yapılmadı) 404 */
  async getir(): Promise<Buro> {
    const [b] = await this.txHost.tx.select().from(buro).limit(1)
    if (!b) throw new NotFoundException({ message: "Büro bilgisi bulunamadı" })
    return nullsuz(b)
  }

  @Transactional()
  async sablonlariGuncelle(aktor: Personel, body: unknown): Promise<Buro> {
    const mevcut = await this.getir()
    const gelen = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    const sablonlar = { ...mevcut.mesajSablonlari }
    for (const tip of SABLON_TIPLERI) {
      // Eski istemciler yalnızca TALEP/RED gönderebilir; gönderilmeyen tür korunur
      if (gelen[tip] === undefined && sablonlar[tip]) continue
      const metin = typeof gelen[tip] === "string" ? gelen[tip] : undefined
      const hata = sablonHatasi(tip, metin)
      if (hata) throw new BadRequestException({ message: hata })
      sablonlar[tip] = metin!.trim()
    }
    const [guncel] = await this.txHost.tx
      .update(buro)
      .set({ mesajSablonlari: sablonlar })
      .where(eq(buro.id, mevcut.id))
      .returning()
    await this.aktiviteler.log({ aktorId: aktor.id, eylem: "SABLON_GUNCELLENDI" })
    return nullsuz(guncel!)
  }

  /** Tahsilat hatırlatmalarında gösterilen IBAN; boş değer kaldırır */
  @Transactional()
  async ibanGuncelle(aktor: Personel, body: unknown): Promise<Buro> {
    const mevcut = await this.getir()
    const ham = (body && typeof body === "object" ? body : {}) as { iban?: unknown }
    if (ham.iban !== undefined && ham.iban !== null && typeof ham.iban !== "string")
      throw new BadRequestException({ message: "Geçerli bir TR IBAN girin" })
    const temiz = ham.iban?.replace(/\s/g, "").toUpperCase() || null
    if (temiz && !/^TR\d{24}$/.test(temiz))
      throw new BadRequestException({ message: "Geçerli bir TR IBAN girin" })
    const [guncel] = await this.txHost.tx
      .update(buro)
      .set({ iban: temiz })
      .where(eq(buro.id, mevcut.id))
      .returning()
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "BURO_GUNCELLENDI", aciklama: "IBAN" },
      false
    )
    return nullsuz(guncel!)
  }
}
