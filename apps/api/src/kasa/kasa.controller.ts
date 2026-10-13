import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../auth/auth.decorators.js"
import { KasaService } from "./kasa.service.js"

const YALNIZ_YONETICI = "Kasa ana şifresini yalnızca yönetici yönetebilir"

@Controller("kasa")
export class KasaController {
  constructor(private readonly kasa: KasaService) {}

  @Get("meta")
  meta() {
    return this.kasa.meta()
  }

  @Post("kurulum")
  @Roller("YONETICI", YALNIZ_YONETICI)
  kurulum(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.kasa.kurulum(aktor, body)
  }

  @Post("anahtar-degistir")
  @Roller("YONETICI", YALNIZ_YONETICI)
  @HttpCode(200)
  anahtarDegistir(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.kasa.anahtarDegistir(aktor, body)
  }

  @Get("credentials")
  liste(@Query("mukellefId") mukellefId?: string) {
    return this.kasa.liste(mukellefId || undefined)
  }

  @Post("credentials")
  olustur(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.kasa.olustur(aktor, body)
  }

  @Post("credentials/toplu")
  @HttpCode(200)
  toplu(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.kasa.toplu(aktor, body)
  }

  @Put("credentials/:id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.kasa.guncelle(aktor, id, body)
  }

  @Delete("credentials/:id")
  @HttpCode(204)
  async sil(@Aktor() aktor: Personel, @Param("id") id: string) {
    await this.kasa.sil(aktor, id)
  }

  @Post("credentials/:id/erisim")
  @HttpCode(200)
  erisim(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.kasa.erisim(aktor, id, body)
  }
}
