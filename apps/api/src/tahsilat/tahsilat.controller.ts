import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common"

import type { Personel } from "@prime/shared/types/domain"

import { Aktor, Roller } from "../auth/auth.decorators.js"
import { TahsilatService, type CariListeSorgusu } from "./tahsilat.service.js"

@Controller("tahsilat")
export class TahsilatController {
  constructor(private readonly tahsilat: TahsilatService) {}

  @Get("ozet")
  ozet(@Query("sorumlu") sorumlu?: string) {
    return this.tahsilat.ozet(sorumlu || undefined)
  }

  @Get("cari")
  cari(@Query() sorgu: CariListeSorgusu) {
    return this.tahsilat.cariListe(sorgu)
  }

  @Get("cari/:mukellefId")
  ekstre(@Param("mukellefId") mukellefId: string) {
    return this.tahsilat.ekstre(mukellefId)
  }

  @Post("hareketler")
  hareketEkle(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.tahsilat.hareketEkle(aktor, body)
  }

  @Delete("hareketler/:id")
  @HttpCode(204)
  @Roller("YONETICI", "Cari hareketleri yalnızca yönetici silebilir")
  async hareketSil(@Aktor() aktor: Personel, @Param("id") id: string) {
    await this.tahsilat.hareketSil(aktor, id)
  }

  @Post("acilis-toplu")
  @HttpCode(200)
  @Roller("YONETICI", "Ücret ve bakiyeleri yalnızca yönetici aktarabilir")
  acilisToplu(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.tahsilat.acilisToplu(aktor, body)
  }

  @Get("kesinti")
  kesinti(@Query("yil") yil?: string) {
    return this.tahsilat.kesinti(yil)
  }

  @Post("kesinti/ice-aktar")
  kesintiIceAktar(@Aktor() aktor: Personel, @Body() body: unknown) {
    return this.tahsilat.kesintiIceAktar(aktor, body)
  }
}

/** `PUT /mukellefler/:id/ucret` — ücret borç üretimini tetiklediği için tahsilat modülünde */
@Controller("mukellefler")
export class UcretController {
  constructor(private readonly tahsilat: TahsilatService) {}

  @Put(":id/ucret")
  @Roller("YONETICI", "Ücreti yalnızca yönetici değiştirebilir")
  ucret(@Aktor() aktor: Personel, @Param("id") id: string, @Body() body: unknown) {
    return this.tahsilat.ucretKaydet(aktor, id, body)
  }
}
