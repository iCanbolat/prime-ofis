import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { FastifyReply, FastifyRequest } from "fastify"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { CSRF_MUAF, PUBLIC, ROLLER, type RolKurali } from "./auth.decorators.js"
import { OTURUM_COOKIE, OturumService } from "./oturum.service.js"

const GUVENLI_METOTLAR = new Set(["GET", "HEAD", "OPTIONS"])
const YEREL = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Global guard: CSRF (Origin) kontrolü → oturum çözümü → rol kontrolü.
 * `@Public()` uçlarda oturum zorunlu değildir ama cookie varsa aktör yine çözülür (logout).
 */
@Injectable()
export class OturumGuard implements CanActivate {
  private readonly izinliOrigin: string

  constructor(
    private readonly reflector: Reflector,
    private readonly oturumlar: OturumService,
    @Inject(ENV) private readonly env: Env
  ) {
    this.izinliOrigin = new URL(env.APP_URL).origin
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    const hedefler = [ctx.getHandler(), ctx.getClass()]

    if (!this.reflector.getAllAndOverride<boolean>(CSRF_MUAF, hedefler)) {
      this.csrfKontrol(req)
    }

    const ham = req.cookies[OTURUM_COOKIE]
    if (ham) {
      const sonuc = await this.oturumlar.dogrula(ham)
      if (sonuc) {
        req.aktor = sonuc.personel
        req.oturumId = ham
        if (sonuc.yenilendi) {
          this.oturumlar.cookieYaz(ctx.switchToHttp().getResponse<FastifyReply>(), ham)
        }
      }
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, hedefler)) return true
    if (!req.aktor) {
      throw new UnauthorizedException({
        message: "Oturum bulunamadı, lütfen tekrar giriş yapın",
      })
    }

    const kural = this.reflector.getAllAndOverride<RolKurali | undefined>(
      ROLLER,
      hedefler
    )
    if (kural && !kural.roller.includes(req.aktor.rol)) {
      throw new ForbiddenException({
        message: kural.mesaj ?? "Bu işlem için yetkiniz yok",
      })
    }
    return true
  }

  /**
   * Durum değiştiren isteklerde tarayıcının gönderdiği `Origin` uygulamanın adresi olmalı.
   * Origin yoksa `Sec-Fetch-Site` bakılır; ikisi de yoksa tarayıcı dışı istemcidir (curl, test).
   * Cookie SameSite=Lax zaten başka sitelerden POST'ta gönderilmez; bu ikinci savunma hattıdır.
   */
  private csrfKontrol(req: FastifyRequest) {
    if (GUVENLI_METOTLAR.has(req.method)) return
    const origin = req.headers.origin
    if (origin) {
      if (origin === this.izinliOrigin || this.yerelGelistirme(origin)) return
      throw new ForbiddenException({ message: "İstek kaynağı doğrulanamadı" })
    }
    const site = req.headers["sec-fetch-site"]
    if (site && site !== "same-origin" && site !== "none") {
      throw new ForbiddenException({ message: "İstek kaynağı doğrulanamadı" })
    }
  }

  /** Geliştirmede Vite farklı portta açılabilir (autoPort) */
  private yerelGelistirme(origin: string) {
    if (this.env.NODE_ENV !== "development") return false
    try {
      return YEREL.has(new URL(origin).hostname)
    } catch {
      return false
    }
  }
}
