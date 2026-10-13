import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor } from "../auth/auth.decorators.js"
import { BildirimService } from "./bildirim.service.js"

@Controller("bildirim")
export class BildirimController {
  constructor(private readonly bildirimler: BildirimService) {}

  @Get()
  liste(
    @Aktor() aktor: Personel,
    @Query("sadeceOkunmamis") sadeceOkunmamis?: string,
    @Query("limit") limit?: string
  ) {
    return this.bildirimler.liste(aktor.id, {
      sadeceOkunmamis: sadeceOkunmamis === "true",
      limit: Number(limit) || undefined,
    })
  }

  @Post("okundu")
  @HttpCode(204)
  async tumunuOkundu(@Aktor() aktor: Personel) {
    await this.bildirimler.tumunuOkundu(aktor.id)
  }

  @Post(":id/okundu")
  @HttpCode(204)
  async okundu(@Aktor() aktor: Personel, @Param("id") id: string) {
    await this.bildirimler.okundu(aktor.id, id)
  }
}
