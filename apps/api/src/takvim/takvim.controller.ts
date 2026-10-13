import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { TakvimService, type TakvimSorgusu } from "./takvim.service.js"

@Controller("takvim")
export class TakvimController {
  constructor(private readonly takvim: TakvimService) {}

  @Get("ozet")
  ozet(@Query("sorumlu") sorumlu?: string) {
    return this.takvim.ozet(sorumlu || undefined)
  }

  @Get()
  liste(@Query() sorgu: TakvimSorgusu) {
    return this.takvim.liste(sorgu)
  }

  @Patch(":id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.takvim.durumGuncelle(aktor, id, body)
  }
}
