import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common"

import type { KamuDogrulamaCozRequest } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { GibOturumService } from "./gib-oturum.service.js"
import { TebligatService, type TebligatSorgusu } from "./tebligat.service.js"

@Controller("tebligat")
export class TebligatController {
  constructor(private readonly tebligat: TebligatService) {}

  @Get("erisim")
  erisimler(@Query("durum") durum?: string) {
    return this.tebligat.erisimler(durum)
  }

  @Get("erisim/:mukellefId")
  erisim(@Param("mukellefId") mukellefId: string) {
    return this.tebligat.erisim(mukellefId)
  }

  @Put("erisim/:mukellefId")
  erisimKaydet(
    @Aktor() aktor: Personel,
    @Param("mukellefId") mukellefId: string,
    @Body() body: unknown
  ) {
    return this.tebligat.erisimKaydet(aktor, mukellefId, body)
  }

  @Delete("erisim/:mukellefId")
  @HttpCode(204)
  async erisimKaldir(@Aktor() aktor: Personel, @Param("mukellefId") mukellefId: string) {
    await this.tebligat.erisimKaldir(aktor, mukellefId)
  }

  @Post("erisim/:mukellefId/tara")
  @HttpCode(200)
  tara(@Aktor() aktor: Personel, @Param("mukellefId") mukellefId: string) {
    return this.tebligat.tara(aktor, mukellefId)
  }

  @Get("ozet")
  ozet(@Query("sorumlu") sorumlu?: string) {
    return this.tebligat.ozet(sorumlu || undefined)
  }

  @Get()
  liste(@Query() sorgu: TebligatSorgusu) {
    return this.tebligat.liste(sorgu)
  }

  @Get(":id")
  detay(@Param("id") id: string) {
    return this.tebligat.detay(id)
  }

  @Post()
  ekle(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.tebligat.ekle(aktor, body)
  }

  @Patch(":id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.tebligat.guncelle(aktor, id, body)
  }

  @Post(":id/gorev")
  gorev(@Aktor() aktor: Personel, @Param("id") id: string) {
    return this.tebligat.gorevOlustur(aktor, id)
  }

  @Post(":id/belge")
  belge(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.tebligat.belgeYukle(aktor, id, body)
  }
}

/** GİB / SGK doğrulama ekranları (CAPTCHA): personel görseldeki kodu girer */
@Controller("kamu-dogrulama")
export class KamuDogrulamaController {
  constructor(private readonly oturum: GibOturumService) {}

  @Get()
  liste(@Query("mukellefId") mukellefId?: string) {
    return this.oturum.liste(mukellefId || undefined)
  }

  @Post(":id")
  @HttpCode(200)
  coz(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: KamuDogrulamaCozRequest) {
    return this.oturum.coz(aktor, id, body)
  }

  @Post(":id/yenile")
  @HttpCode(200)
  yenile(@Param("id") id: string) {
    return this.oturum.yenile(id)
  }
}
