import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../auth/auth.decorators.js"
import { PersonelService } from "./personel.service.js"

const YALNIZ_YONETICI = "Personeli yalnızca yönetici yönetebilir"

@Controller("personel")
export class PersonelController {
  constructor(private readonly personeller: PersonelService) {}

  @Get()
  liste() {
    return this.personeller.liste()
  }

  @Post()
  @Roller("YONETICI", YALNIZ_YONETICI)
  olustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.personeller.olustur(aktor, body)
  }

  @Put(":id")
  @Roller("YONETICI", YALNIZ_YONETICI)
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.personeller.guncelle(aktor, id, body)
  }

  @Put(":id/sifre")
  @Roller("YONETICI", YALNIZ_YONETICI)
  @HttpCode(204)
  async sifre(
    @Aktor() aktor: Personel,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    await this.personeller.sifreDegistir(aktor, id, body, req.oturumId)
  }

  /** Şifre gövdede gider: DELETE yerine POST (bazı proxy'ler DELETE gövdesini düşürür) */
  @Post(":id/sil")
  @Roller("YONETICI", YALNIZ_YONETICI)
  @HttpCode(204)
  async sil(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    await this.personeller.sil(aktor, id, body)
  }
}
