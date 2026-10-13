import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { MukellefService, type MukellefListeSorgusu } from "./mukellef.service.js"

@Controller("mukellefler")
export class MukellefController {
  constructor(private readonly mukellefler: MukellefService) {}

  @Get()
  liste(@Query() sorgu: MukellefListeSorgusu) {
    return this.mukellefler.liste(sorgu)
  }

  @Post()
  olustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.mukellefler.olustur(aktor, body)
  }

  @Post("toplu")
  @HttpCode(200)
  toplu(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.mukellefler.toplu(aktor, body)
  }

  @Post("toplu-atama")
  @HttpCode(200)
  topluAtama(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.mukellefler.topluAtama(aktor, body)
  }

  @Get(":id")
  getir(@Param("id") id: string) {
    return this.mukellefler.getir(id)
  }

  @Put(":id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.mukellefler.guncelle(aktor, id, body)
  }
}
