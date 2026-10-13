import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { ArsivService, type ArsivListeSorgusu } from "./arsiv.service.js"

@Controller("arsiv")
export class ArsivController {
  constructor(private readonly arsiv: ArsivService) {}

  @Get("agac")
  agac(@Query("sorumlu") sorumlu?: string) {
    return this.arsiv.agac(sorumlu || undefined)
  }

  @Get("ozet")
  ozet(@Query("sorumlu") sorumlu?: string) {
    return this.arsiv.ozet(sorumlu || undefined)
  }

  @Get()
  liste(@Query() sorgu: ArsivListeSorgusu) {
    return this.arsiv.liste(sorgu)
  }

  @Get(":id/icerik")
  icerik(@Req() req: FastifyRequest, @Aktor() aktor: Personel, @Param("id") id: string) {
    return this.arsiv.icerik(req, aktor, id)
  }

  @Post()
  yukle(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.arsiv.yukle(aktor, body)
  }

  @Patch(":id")
  guncelle(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.arsiv.guncelle(aktor, id, body)
  }

  @Post(":id/geri-al")
  @HttpCode(200)
  geriAl(@Aktor() aktor: Personel, @Param("id") id: string) {
    return this.arsiv.geriAl(aktor, id)
  }

  @Delete(":id")
  sil(@Aktor() aktor: Personel, @Param("id") id: string, @Query("kalici") kalici?: string) {
    return this.arsiv.sil(aktor, id, kalici === "true")
  }
}
