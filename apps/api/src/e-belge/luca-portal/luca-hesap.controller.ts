import { Body, Controller, Delete, Get, HttpCode, Post, Put } from "@nestjs/common"

import type { LucaHesapRequest } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../../auth/auth.decorators.js"
import { EBelgeService } from "../e-belge.service.js"
import { LucaOturumService } from "./luca-oturum.service.js"

const LUCA_YONETICI = "Luca hesabını yalnızca yönetici yönetebilir"

/**
 * Büronun Luca portal hesabı. Hesap yönetimi ve firmalardan mükellef aktarımı yönetici
 * yetkisinde; doğrulama kodunu senkronu başlatan her personel girebilir.
 */
@Controller()
export class LucaHesapController {
  constructor(
    private readonly oturum: LucaOturumService,
    private readonly ebelge: EBelgeService
  ) {}

  @Get("luca-hesap")
  hesap() {
    return this.oturum.hesap()
  }

  @Put("luca-hesap")
  @Roller("YONETICI", LUCA_YONETICI)
  kaydet(@Aktor() aktor: Personel, @Body() body: LucaHesapRequest) {
    return this.oturum.kaydet(aktor, body)
  }

  @Delete("luca-hesap")
  @HttpCode(204)
  @Roller("YONETICI", LUCA_YONETICI)
  async kaldir(@Aktor() aktor: Personel) {
    await this.oturum.kaldir(aktor)
  }

  @Get("luca-hesap/firmalar")
  firmalar() {
    return this.oturum.firmalar()
  }

  @Post("luca-hesap/firmalar/aktar")
  @HttpCode(200)
  @Roller("YONETICI", "Luca firmalarını yalnızca yönetici aktarabilir")
  aktar(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.ebelge.lucaFirmalariniAktar(aktor, body)
  }

  @Get("luca-dogrulama")
  dogrulama() {
    return this.oturum.dogrulama()
  }

  @Post("luca-dogrulama")
  @HttpCode(200)
  dogrula(@Body() body: unknown) {
    return this.oturum.dogrula(body)
  }

  @Post("luca-dogrulama/yenile")
  @HttpCode(200)
  dogrulamaYenile() {
    return this.oturum.dogrulamaYenile()
  }
}
