import { BadRequestException, Injectable } from "@nestjs/common"
import { fileTypeFromBuffer } from "file-type"

import { KABUL_EDILEN_TURLER, MAKS_DOSYA_BOYUTU } from "@prime/shared/arsiv/kurallar"

import { DosyaDeposu } from "../storage/dosya-deposu.js"

const DATA_URL = /^data:([\w/+.-]*)(;[\w=-]+)*;base64,/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export interface CozulmusDosya {
  icerik: Buffer
  /** Magic byte'lardan tespit edilen tür (istemcinin bildirdiğine güvenilmez) */
  mimeType: string
  boyut: number
}

/** Nesne anahtarları: depo düzeni tek yerde */
export const arsivAnahtari = (mukellefId: string, dosyaId: string) =>
  `arsiv/${mukellefId}/${dosyaId}`
export const gelenAnahtari = (talepId: string, gelenId: string) =>
  `gelen/${talepId}/${gelenId}`

/**
 * Dosya taşıma sözleşmesi: yükleme JSON içinde base64 `dataUrl`, içerik uçları `{ dataUrl }` döner.
 * Sunucu türü ve boyutu yeniden doğrular (PDF, JPEG, PNG, HEIC; en çok 10 MB).
 */
@Injectable()
export class DosyaService {
  constructor(private readonly depo: DosyaDeposu) {}

  async dataUrlCoz(dataUrl: unknown): Promise<CozulmusDosya> {
    const eslesme = typeof dataUrl === "string" ? DATA_URL.exec(dataUrl) : null
    if (!eslesme) throw new BadRequestException({ message: "Dosya içeriği okunamadı" })
    const base64 = (dataUrl as string).slice(eslesme[0].length)
    // Çözmeden önce yaklaşık boyut: 10 MB'ı çok aşan gövde boşuna çözülmesin
    if (Math.floor((base64.length * 3) / 4) > MAKS_DOSYA_BOYUTU + 3) {
      throw new BadRequestException({ message: "Dosya 10 MB sınırını aşıyor." })
    }
    if (!BASE64.test(base64)) {
      throw new BadRequestException({ message: "Dosya içeriği okunamadı" })
    }
    const icerik = Buffer.from(base64, "base64")
    if (icerik.length === 0) {
      throw new BadRequestException({ message: "Dosya boş" })
    }
    if (icerik.length > MAKS_DOSYA_BOYUTU) {
      throw new BadRequestException({ message: "Dosya 10 MB sınırını aşıyor." })
    }

    const tespit = await fileTypeFromBuffer(icerik)
    const mimeType = tespit?.mime === "image/heif" ? "image/heic" : tespit?.mime
    if (!mimeType || !(mimeType in KABUL_EDILEN_TURLER)) {
      throw new BadRequestException({
        message: "Desteklenmeyen dosya türü. PDF, JPG, PNG veya HEIC yükleyin.",
      })
    }
    return { icerik, mimeType, boyut: icerik.length }
  }

  dataUrlYap(icerik: Buffer, mimeType: string) {
    return `data:${mimeType};base64,${icerik.toString("base64")}`
  }

  koy(anahtar: string, dosya: Pick<CozulmusDosya, "icerik" | "mimeType">) {
    return this.depo.koy(anahtar, dosya.icerik, dosya.mimeType)
  }

  getir(anahtar: string) {
    return this.depo.getir(anahtar)
  }

  sil(anahtar: string) {
    return this.depo.sil(anahtar)
  }

  kopyala(kaynak: string, hedef: string) {
    return this.depo.kopyala(kaynak, hedef)
  }
}
