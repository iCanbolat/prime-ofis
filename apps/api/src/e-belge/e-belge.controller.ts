import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import type {
  BaglantiKaydetRequest,
  KontorAlimRequest,
  SenkronRequest,
} from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../auth/auth.decorators.js"
import { EBelgeService, type FaturaSorgusu } from "./e-belge.service.js"

const LUCA_YONETICI = "Luca bağlantısını yalnızca yönetici yönetebilir"

@Controller("e-belge")
export class EBelgeController {
  constructor(private readonly ebelge: EBelgeService) {}

  @Get("baglantilar")
  baglantilar() {
    return this.ebelge.baglantilar()
  }

  @Get("baglantilar/:mukellefId")
  baglanti(@Param("mukellefId") mukellefId: string) {
    return this.ebelge.baglanti(mukellefId)
  }

  @Put("baglantilar/:mukellefId")
  @Roller("YONETICI", LUCA_YONETICI)
  baglantiKaydet(
    @Aktor() aktor: Personel,
    @Param("mukellefId") mukellefId: string,
    @Body() body: BaglantiKaydetRequest
  ) {
    return this.ebelge.baglantiKaydet(aktor, mukellefId, body)
  }

  @Delete("baglantilar/:mukellefId")
  @HttpCode(204)
  @Roller("YONETICI", LUCA_YONETICI)
  async baglantiKaldir(@Aktor() aktor: Personel, @Param("mukellefId") mukellefId: string) {
    await this.ebelge.baglantiKaldir(aktor, mukellefId)
  }

  @Post("senkron")
  @HttpCode(200)
  senkron(@Aktor() aktor: Personel, @Body() body?: SenkronRequest) {
    return this.ebelge.senkron(aktor, body?.mukellefId || undefined)
  }

  @Get("faturalar")
  faturalar(@Query() sorgu: FaturaSorgusu) {
    return this.ebelge.faturalar(sorgu)
  }

  @Get("faturalar/:id")
  detay(@Param("id") id: string) {
    return this.ebelge.detay(id)
  }

  @Get("faturalar/:id/icerik")
  icerik(@Req() req: FastifyRequest, @Aktor() aktor: Personel, @Param("id") id: string) {
    return this.ebelge.icerik(req, aktor, id)
  }

  @Post("faturalar/:id/arsive-kaydet")
  @HttpCode(200)
  arsiveKaydet(@Aktor() aktor: Personel, @Param("id") id: string) {
    return this.ebelge.arsiveKaydet(aktor, id)
  }

  @Get("beratlar")
  beratlar(@Query("mukellefId") mukellefId?: string) {
    return this.ebelge.beratlar(mukellefId || undefined)
  }

  @Get("ozet")
  ozet(@Query("sorumlu") sorumlu?: string) {
    return this.ebelge.ozet(sorumlu || undefined)
  }

  @Get("kontor")
  kontor(@Query("donem") donem?: string) {
    return this.ebelge.kontor(donem)
  }

  @Post("kontor/alimlar")
  @Roller("YONETICI", "Kontör alımını yalnızca yönetici kaydedebilir")
  kontorAlim(@Aktor() aktor: Personel, @Body() body: KontorAlimRequest) {
    return this.ebelge.kontorAlimEkle(aktor, body)
  }
}
