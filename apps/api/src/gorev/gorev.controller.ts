import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { GorevService, type GorevListeSorgusu } from "./gorev.service.js"

@Controller("gorevler")
export class GorevController {
  constructor(private readonly gorevler: GorevService) {}

  @Get("ozet")
  ozet(@Query("atanan") atanan?: string) {
    return this.gorevler.ozet(atanan || undefined)
  }

  @Get()
  liste(@Query() sorgu: GorevListeSorgusu) {
    return this.gorevler.liste(sorgu)
  }

  @Post()
  olustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.gorevler.olustur(aktor, body)
  }

  @Post("toplu")
  @HttpCode(200)
  toplu(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.gorevler.toplu(aktor, body)
  }

  @Post("donem/onizleme")
  @HttpCode(200)
  donemOnizleme(@Body() body: unknown) {
    return this.gorevler.donemOnizleme(body)
  }

  @Post("donem")
  @HttpCode(200)
  donemOlustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.gorevler.donemOlustur(aktor, body)
  }

  @Get(":id")
  detay(@Param("id") id: string) {
    return this.gorevler.detay(id)
  }

  @Patch(":id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.gorevler.guncelle(aktor, id, body)
  }

  @Post(":id/tasi")
  @HttpCode(200)
  tasi(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.gorevler.tasi(aktor, id, body)
  }

  @Post(":id/yorum")
  @HttpCode(200)
  yorum(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.gorevler.yorum(aktor, id, body)
  }

  @Delete(":id")
  @HttpCode(204)
  async sil(@Aktor() aktor: Personel, @Param("id") id: string) {
    await this.gorevler.sil(aktor, id)
  }
}
