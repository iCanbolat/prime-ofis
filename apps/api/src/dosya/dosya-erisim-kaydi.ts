import { Injectable } from "@nestjs/common"
import type { FastifyRequest } from "fastify"

import type { AktiviteLog, Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"

export type ErisimIslemi = "onizle" | "indir"

/** `?islem=indir` ise indirme, aksi halde görüntüleme sayılır */
export function dosyaErisimIslemi(req: FastifyRequest): ErisimIslemi {
  return (req.query as Record<string, unknown> | undefined)?.islem === "indir"
    ? "indir"
    : "onizle"
}

/**
 * Dosya içeriği her okunduğunda erişim kaydı yazar (bildirim üretmez, silinemez).
 * Bordro gibi hassas dosyaların kimin tarafından açıldığı bu kayıttan izlenir.
 */
@Injectable()
export class DosyaErisimKaydi {
  constructor(private readonly aktiviteler: AktiviteService) {}

  kaydet(
    req: FastifyRequest,
    aktor: Personel,
    dosya: {
      hedefTip: Extract<AktiviteLog["hedefTip"], "ARSIV" | "EVRAK" | "EBELGE">
      hedefId: string
      mukellefId: string
      ad: string
    }
  ) {
    return this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem:
          dosyaErisimIslemi(req) === "indir" ? "DOSYA_INDIRILDI" : "DOSYA_GORUNTULENDI",
        hedefTip: dosya.hedefTip,
        hedefId: dosya.hedefId,
        mukellefId: dosya.mukellefId,
        aciklama: dosya.ad,
      },
      false
    )
  }
}
