import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common"

import { Public } from "../auth/auth.decorators.js"
import { PortalSiniri } from "./portal-siniri.js"
import { PortalService } from "./portal.service.js"

/** Girişsiz müşteri portalı: erişim yalnızca token ile, IP + token başına istek sınırı */
@Public()
@UseGuards(PortalSiniri)
@Controller("portal/:token")
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get()
  getir(@Param("token") token: string) {
    return this.portal.getir(token)
  }

  @Post("yukleme")
  yukle(@Param("token") token: string, @Body() body: unknown) {
    return this.portal.yukle(token, body)
  }

  @Delete("yukleme/:id")
  sil(@Param("token") token: string, @Param("id") id: string) {
    return this.portal.sil(token, id)
  }

  @Post("tamamla")
  @HttpCode(200)
  tamamla(@Param("token") token: string, @Body() body: unknown) {
    return this.portal.tamamla(token, body)
  }
}
