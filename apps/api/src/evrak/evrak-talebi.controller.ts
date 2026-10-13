import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { EvrakTalebiService, type TalepListeSorgusu } from "./evrak-talebi.service.js"
import { GelenEvrakService, type GelenListeSorgusu } from "./gelen-evrak.service.js"

@Controller("evrak-talepleri")
export class EvrakTalebiController {
  constructor(private readonly talepler: EvrakTalebiService) {}

  @Get()
  liste(@Query() sorgu: TalepListeSorgusu) {
    return this.talepler.liste(sorgu)
  }

  @Get(":id")
  detay(@Param("id") id: string) {
    return this.talepler.detay(id)
  }

  @Post()
  olustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.talepler.olustur(aktor, body)
  }

  @Post(":id/gonderim")
  @HttpCode(200)
  gonderim(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.talepler.gonderim(aktor, id, body)
  }

  @Post(":id/uzat")
  @HttpCode(200)
  uzat(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.talepler.uzat(aktor, id, body)
  }

  @Post(":id/iptal")
  @HttpCode(200)
  iptal(@Aktor() aktor: Personel, @Param("id") id: string) {
    return this.talepler.iptal(aktor, id)
  }

  @Post(":id/yeniden-ac")
  @HttpCode(200)
  yenidenAc(@Aktor() aktor: Personel, @Param("id") id: string) {
    return this.talepler.yenidenAc(aktor, id)
  }
}

@Controller("gelen-evrak")
export class GelenEvrakController {
  constructor(private readonly gelenler: GelenEvrakService) {}

  @Get("sayac")
  sayac() {
    return this.gelenler.sayac()
  }

  @Get()
  liste(@Query() sorgu: GelenListeSorgusu) {
    return this.gelenler.liste(sorgu)
  }

  @Get(":id/icerik")
  icerik(@Req() req: FastifyRequest, @Aktor() aktor: Personel, @Param("id") id: string) {
    return this.gelenler.icerik(req, aktor, id)
  }

  @Post(":id/onayla")
  @HttpCode(200)
  onayla(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.gelenler.onayla(aktor, id, body)
  }

  @Post(":id/reddet")
  @HttpCode(200)
  reddet(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.gelenler.reddet(aktor, id, body)
  }
}
