import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common"
import type { FastifyReply } from "fastify"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { IceAktarimService } from "./ice-aktarim.service.js"

@Controller("ice-aktarim")
export class IceAktarimController {
  constructor(private readonly iceAktarim: IceAktarimService) {}

  @Get("tahakkuklar")
  tahakkuklar(@Query("mukellefId") mukellefId?: string) {
    return this.iceAktarim.tahakkuklar(mukellefId || undefined)
  }

  /** Gövde sınırı 60 MB (`app.factory.ts` → `BUYUK_GOVDE_YOLLARI`) */
  @Post("tahakkuklar")
  @HttpCode(200)
  tahakkukAktar(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.iceAktarim.tahakkukAktar(aktor, body)
  }

  @Get("mizanlar")
  mizanlar(@Query("mukellefId") mukellefId?: string) {
    return this.iceAktarim.mizanlar(mukellefId || undefined)
  }

  @Get("mizanlar/:id")
  mizan(@Param("id") id: string) {
    return this.iceAktarim.mizanDetay(id)
  }

  /** Yeni dönem 201, aynı dönemin yeniden yüklenmesi 200 */
  @Post("mizanlar")
  async mizanAktar(
    @Aktor() aktor: Personel,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const { yanit, yeni } = await this.iceAktarim.mizanAktar(aktor, body)
    reply.status(yeni ? 201 : 200)
    return yanit
  }
}
