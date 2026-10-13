import { HttpException, Inject, Injectable } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"

const PENCERE_MS = 15 * 60_000

/**
 * Hatalı giriş denemesi sınırı: IP + e-posta başına `GIRIS_DENEME_SINIRI` / 15 dk.
 * Yalnızca başarısız denemeler sayılır; başarılı giriş sayacı sıfırlar. Tek süreç olduğu için
 * bellekte tutulur (yeniden başlatmada sıfırlanması kabul edilebilir).
 */
@Injectable()
export class GirisSiniri {
  private readonly denemeler = new Map<string, number[]>()

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly saat: Saat
  ) {}

  /** Sınır aşıldıysa 429 */
  kontrol(ip: string, eposta: string) {
    const liste = this.guncel(this.anahtar(ip, eposta))
    if (liste.length >= this.env.GIRIS_DENEME_SINIRI) {
      const kalanDk = Math.ceil((liste[0]! + PENCERE_MS - this.saat.simdi().getTime()) / 60_000)
      throw new HttpException(
        {
          message: `Çok fazla hatalı giriş denemesi. ${kalanDk} dakika sonra tekrar deneyin.`,
        },
        429
      )
    }
  }

  basarisiz(ip: string, eposta: string) {
    const anahtar = this.anahtar(ip, eposta)
    this.denemeler.set(anahtar, [...this.guncel(anahtar), this.saat.simdi().getTime()])
    if (this.denemeler.size > 10_000) this.temizle()
  }

  basarili(ip: string, eposta: string) {
    this.denemeler.delete(this.anahtar(ip, eposta))
  }

  private anahtar(ip: string, eposta: string) {
    return `${ip}|${eposta}`
  }

  private guncel(anahtar: string) {
    const sinir = this.saat.simdi().getTime() - PENCERE_MS
    return (this.denemeler.get(anahtar) ?? []).filter((t) => t > sinir)
  }

  private temizle() {
    for (const anahtar of this.denemeler.keys()) {
      const liste = this.guncel(anahtar)
      if (liste.length) this.denemeler.set(anahtar, liste)
      else this.denemeler.delete(anahtar)
    }
  }
}
