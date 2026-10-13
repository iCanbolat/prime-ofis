import { createHmac, timingSafeEqual } from "node:crypto"

import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  type RawBodyRequest,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import { KANAL_ETIKET } from "@prime/shared/kanal/sabitler"
import type {
  BildirimTercihKaydetRequest,
  KanalKaydetRequest,
  KanalTestResponse,
  MukellefGonderRequest,
} from "@prime/shared/types/api"
import type { KanalTip, Personel } from "@prime/shared/types/domain"

import { Aktor, CsrfMuaf, Public, Roller } from "../auth/auth.decorators.js"
import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { GonderimService, type GonderimListeSorgusu } from "./gonderim.service.js"
import { KanalService } from "./kanal.service.js"
import { MukellefGonderimi } from "./mukellef-gonderimi.js"

@Controller("kanallar")
export class KanalController {
  constructor(
    private readonly kanallar: KanalService,
    private readonly gonderimler: GonderimService
  ) {}

  @Get()
  liste() {
    return this.kanallar.liste()
  }

  @Put(":tip")
  @Roller("YONETICI", "Kanalları yalnızca yönetici yapılandırabilir")
  kaydet(@Aktor() aktor: Personel, @Param("tip") tip: KanalTip, @Body() body: KanalKaydetRequest) {
    return this.kanallar.kaydet(aktor, tip, body)
  }

  @Delete(":tip")
  @HttpCode(204)
  @Roller("YONETICI", "Kanalları yalnızca yönetici kaldırabilir")
  async kaldir(@Aktor() aktor: Personel, @Param("tip") tip: KanalTip) {
    await this.kanallar.kaldir(aktor, tip)
  }

  /** Kullanıcının kendi adresine test mesajı (senkron gönderilir) */
  @Post(":tip/test")
  @HttpCode(200)
  async test(@Aktor() aktor: Personel, @Param("tip") tip: KanalTip): Promise<KanalTestResponse> {
    const ayar = await this.kanallar.bul(tip)
    if (!ayar) throw new ConflictException({ message: "Kanal yapılandırılmamış" })
    const adres = ayar.tip === "EPOSTA" ? aktor.eposta : aktor.telefon
    if (!adres)
      throw new ConflictException({ message: "Profilinizde bu kanal için adres yok" })
    const gizli = (await this.kanallar.hazirKanallar()).get(tip)?.gizli
    const gonderim = await this.gonderimler.hemenGonder(
      {
        kanal: tip,
        aliciTip: "PERSONEL",
        aliciId: aktor.id,
        aliciAd: `${aktor.ad} ${aktor.soyad}`,
        hedefAdres: adres,
        konu: "Prime Ofis test mesajı",
        metin: `${KANAL_ETIKET[tip]} kanalı çalışıyor.`,
        sablon: tip === "WHATSAPP" ? "PERSONEL_HATIRLATMA" : undefined,
        parametreler: ["Test mesajı", "Kanal çalışıyor"],
        kaynak: "TEST",
        gonderenId: aktor.id,
      },
      { ayar, gizli }
    )
    await this.kanallar.sonTestYaz(tip)
    return { gonderim }
  }
}

@Controller("bildirim-tercihleri/ben")
export class BildirimTercihController {
  constructor(private readonly kanallar: KanalService) {}

  @Get()
  getir(@Aktor() aktor: Personel) {
    return this.kanallar.tercih(aktor)
  }

  @Put()
  kaydet(@Aktor() aktor: Personel, @Body() body: BildirimTercihKaydetRequest) {
    return this.kanallar.tercihKaydet(aktor, body)
  }
}

@Controller()
export class GonderimController {
  constructor(
    private readonly gonderimler: GonderimService,
    private readonly mukellefe: MukellefGonderimi
  ) {}

  @Get("gonderimler")
  @Roller("YONETICI", "Gönderim geçmişini yalnızca yönetici görebilir")
  liste(@Query() sorgu: GonderimListeSorgusu) {
    return this.gonderimler.liste(sorgu)
  }

  @Post("gonderimler/:id/tekrar")
  @HttpCode(200)
  @Roller("YONETICI", "Gönderimi yalnızca yönetici yeniden deneyebilir")
  tekrar(@Param("id") id: string) {
    return this.gonderimler.tekrar(id)
  }

  @Post("gonderim/mukellef")
  @HttpCode(200)
  mukellef(@Aktor() aktor: Personel, @Body() body: MukellefGonderRequest) {
    return this.mukellefe.gonder(aktor, body)
  }
}

interface MetaDurum {
  id?: string
  status?: string
  errors?: { title?: string; message?: string; code?: number }[]
}

/**
 * Meta WhatsApp Cloud API webhook'u: abonelik doğrulaması (GET) ve teslim durumları (POST,
 * `X-Hub-Signature-256` = HMAC-SHA256(uygulama gizli anahtarı, ham gövde)).
 */
@Public()
@CsrfMuaf()
@Controller("webhooks/whatsapp")
export class WhatsappWebhookController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly gonderimler: GonderimService
  ) {}

  @Get()
  abonelik(
    @Query("hub.mode") mod?: string,
    @Query("hub.verify_token") anahtar?: string,
    @Query("hub.challenge") meydanOkuma?: string
  ) {
    const beklenen = this.env.WHATSAPP_VERIFY_TOKEN
    if (mod !== "subscribe" || !beklenen || !anahtar || !esit(anahtar, beklenen))
      throw new ForbiddenException({ message: "Doğrulama başarısız" })
    return meydanOkuma ?? ""
  }

  @Post()
  @HttpCode(200)
  async durum(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Body() body: { entry?: { changes?: { value?: { statuses?: MetaDurum[] } }[] }[] }
  ) {
    const gizli = this.env.WHATSAPP_APP_SECRET
    const imza = req.headers["x-hub-signature-256"]
    if (!gizli || typeof imza !== "string" || !req.rawBody)
      throw new ForbiddenException({ message: "İmza doğrulanamadı" })
    const beklenen = `sha256=${createHmac("sha256", gizli).update(req.rawBody).digest("hex")}`
    if (!esit(imza, beklenen)) throw new ForbiddenException({ message: "İmza doğrulanamadı" })

    const durumlar = (body?.entry ?? []).flatMap((e) =>
      (e.changes ?? []).flatMap((c) => c.value?.statuses ?? [])
    )
    for (const d of durumlar) {
      if (!d.id) continue
      if (d.status === "failed") {
        const h = d.errors?.[0]
        const mesaj = h ? `${h.message ?? h.title ?? "WhatsApp teslim hatası"}${h.code ? ` (${h.code})` : ""}` : "WhatsApp teslim hatası"
        await this.gonderimler.saglayiciDurumu(d.id, "HATA", mesaj)
      } else if (d.status === "delivered" || d.status === "read") {
        await this.gonderimler.saglayiciDurumu(d.id, "GONDERILDI")
      }
    }
    return { ok: true }
  }
}

function esit(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
