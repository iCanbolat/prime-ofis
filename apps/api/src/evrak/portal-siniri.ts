import {
  HttpException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"

const PENCERE_MS = 60_000
const GUVENLI = new Set(["GET", "HEAD"])

/**
 * Girişsiz müşteri portalının istek sınırı: IP + token başına dakikada `PORTAL_OKUMA_SINIRI`
 * okuma, `PORTAL_YAZMA_SINIRI` yazma (yükleme / silme / tamamlama). Token tahminini ve dosya
 * yağmurunu keser. `GirisSiniri` gibi bellekte (tek süreç).
 */
@Injectable()
export class PortalSiniri implements CanActivate {
  private readonly istekler = new Map<string, number[]>()

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly saat: Saat
  ) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    const token = (req.params as { token?: string } | undefined)?.token ?? ""
    const yazma = !GUVENLI.has(req.method)
    const sinir = yazma ? this.env.PORTAL_YAZMA_SINIRI : this.env.PORTAL_OKUMA_SINIRI
    const anahtar = `${yazma ? "y" : "o"}|${req.ip}|${token}`

    const simdi = this.saat.simdi().getTime()
    const liste = (this.istekler.get(anahtar) ?? []).filter((t) => t > simdi - PENCERE_MS)
    if (liste.length >= sinir) {
      throw new HttpException(
        { message: "Çok fazla istek gönderildi. Lütfen bir dakika sonra tekrar deneyin." },
        429
      )
    }
    liste.push(simdi)
    this.istekler.set(anahtar, liste)
    if (this.istekler.size > 10_000) this.temizle(simdi)
    return true
  }

  private temizle(simdi: number) {
    for (const [anahtar, liste] of this.istekler) {
      const guncel = liste.filter((t) => t > simdi - PENCERE_MS)
      if (guncel.length) this.istekler.set(anahtar, guncel)
      else this.istekler.delete(anahtar)
    }
  }
}
