import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common"
import { eq, sql } from "drizzle-orm"
import type { FastifyReply, FastifyRequest } from "fastify"

import type { LoginResponse } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { DB, type Veritabani } from "../db/db.module.js"
import { personel, personelKimlik } from "../db/schema/index.js"
import { Aktor, Public } from "./auth.decorators.js"
import { GirisSiniri } from "./giris-siniri.js"
import { OturumService } from "./oturum.service.js"
import { SifreService } from "./sifre.service.js"

const HATALI_GIRIS = "Kullanıcı veya şifre hatalı"

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Veritabani,
    private readonly sifreler: SifreService,
    private readonly oturumlar: OturumService,
    private readonly sinir: GirisSiniri,
    private readonly aktiviteler: AktiviteService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<LoginResponse> {
    const girdi = (body ?? {}) as { eposta?: unknown; sifre?: unknown }
    const eposta = typeof girdi.eposta === "string" ? girdi.eposta.trim().toLowerCase() : ""
    const sifre = typeof girdi.sifre === "string" ? girdi.sifre : ""
    this.sinir.kontrol(req.ip, eposta)

    const [kayit] = eposta
      ? await this.db
          .select({ personel, hash: personelKimlik.hash })
          .from(personel)
          .leftJoin(personelKimlik, eq(personelKimlik.personelId, personel.id))
          .where(eq(sql`lower(${personel.eposta})`, eposta))
      : []

    // Kullanıcı yok / şifre yanlış aynı yanıtı (ve yaklaşık aynı süreyi) verir
    if (!(await this.sifreler.dogrula(kayit?.hash, sifre)) || !kayit) {
      this.sinir.basarisiz(req.ip, eposta)
      throw new UnauthorizedException({ message: HATALI_GIRIS })
    }
    if (!kayit.personel.aktif) {
      throw new ForbiddenException({ message: "Bu kullanıcı pasif durumda" })
    }
    this.sinir.basarili(req.ip, eposta)

    const ham = await this.oturumlar.olustur(
      kayit.personel.id,
      req.ip,
      req.headers["user-agent"]
    )
    this.oturumlar.cookieYaz(reply, ham)
    await this.aktiviteler.log({ aktorId: kayit.personel.id, eylem: "GIRIS" })
    return { personel: kayit.personel }
  }

  /** Oturum yoksa da 204 (istemci her durumda yerel oturumu temizler) */
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    if (req.aktor && req.oturumId) {
      await this.oturumlar.sil(req.oturumId)
      await this.aktiviteler.log({ aktorId: req.aktor.id, eylem: "CIKIS" })
    }
    this.oturumlar.cookieTemizle(reply)
  }

  @Get("me")
  me(@Aktor() aktor: Personel): LoginResponse {
    return { personel: aktor }
  }
}
