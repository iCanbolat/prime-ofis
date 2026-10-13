import { Body, Controller, Get, Patch, Put } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../auth/auth.decorators.js"
import { BuroService } from "./buro.service.js"

@Controller("buro")
export class BuroController {
  constructor(private readonly burolar: BuroService) {}

  @Get()
  getir() {
    return this.burolar.getir()
  }

  @Patch()
  @Roller("YONETICI", "Büro bilgilerini yalnızca yönetici değiştirebilir")
  guncelle(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.burolar.ibanGuncelle(aktor, body)
  }

  @Put("sablonlar")
  @Roller("YONETICI", "Mesaj şablonlarını yalnızca yönetici değiştirebilir")
  sablonlar(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.burolar.sablonlariGuncelle(aktor, body)
  }
}
