import { Controller, Get, Query } from "@nestjs/common"

import { AktiviteService } from "./aktivite.service.js"

@Controller("aktivite")
export class AktiviteController {
  constructor(private readonly aktiviteler: AktiviteService) {}

  /** `eylem` virgülle ayrılmış liste (`?eylem=GIRIS,CIKIS`) */
  @Get()
  liste(
    @Query("mukellefId") mukellefId?: string,
    @Query("hedefId") hedefId?: string,
    @Query("eylem") eylem?: string,
    @Query("limit") limit?: string
  ) {
    return this.aktiviteler.liste({
      mukellefId: mukellefId || undefined,
      hedefId: hedefId || undefined,
      eylemler: eylem?.split(",").filter(Boolean),
      limit: Number(limit) || undefined,
    })
  }
}
