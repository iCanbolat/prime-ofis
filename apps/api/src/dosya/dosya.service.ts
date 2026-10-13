import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { fileTypeFromBuffer } from "file-type"

import { placeholderIcerik } from "@prime/mock-data/placeholder"
import {
  KABUL_EDILEN_TURLER,
  MAKS_DOSYA_BOYUTU,
  TABLO_DOSYA_TURLERI,
} from "@prime/shared/arsiv/kurallar"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { DosyaDeposu } from "../storage/dosya-deposu.js"

const DATA_URL = /^data:([\w/+.-]*)(;[\w=-]+)*;base64,/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export interface DataUrlSecenekleri {
  /** Tablo dosyaları (XLSX, XLS, CSV) kabul edilir; PDF / görsel kabul edilmez (mizan) */
  tablo?: boolean
}

export interface CozulmusDosya {
  icerik: Buffer
  /** Magic byte'lardan tespit edilen tür (istemcinin bildirdiğine güvenilmez) */
  mimeType: string
  boyut: number
}

/**
 * Tablo dosyasının türü: XLSX imzasından, XLS genel OLE kabından (`x-cfb`). İmzası olmayan içerik
 * metin kontrol karakteri içermiyorsa CSV sayılır (Excel'in Türkçe CSV'si Windows-1254 olabilir;
 * kodlama denetlenmez).
 */
function tabloTuru(tespit: string | undefined, icerik: Buffer): string | null {
  if (tespit === "application/x-cfb") return "application/vnd.ms-excel"
  if (tespit) return tespit in TABLO_DOSYA_TURLERI ? tespit : null
  const ikili = icerik.some((b) => b < 0x09 || (b > 0x0d && b < 0x20))
  return ikili ? null : "text/csv"
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
  constructor(
    private readonly depo: DosyaDeposu,
    @Inject(ENV) private readonly env: Env
  ) {}

  async dataUrlCoz(
    dataUrl: unknown,
    { tablo = false }: DataUrlSecenekleri = {}
  ): Promise<CozulmusDosya> {
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
    if (tablo) {
      const mimeType = tabloTuru(tespit?.mime, icerik)
      if (!mimeType) {
        throw new BadRequestException({
          message: "Desteklenmeyen dosya türü. XLSX, XLS veya CSV yükleyin.",
        })
      }
      return { icerik, mimeType, boyut: icerik.length }
    }
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

  /**
   * Seed kayıtlarının (dev reset, testler) nesnesi yoktur: production dışında dosya adını
   * gösteren örnek içerik üretilir (mock ile aynı). Production'da `null`.
   */
  yedekDataUrl(dosya: { ad: string; mimeType: string }): string | null {
    return this.uretimde ? null : placeholderIcerik(dosya)
  }

  get uretimde() {
    return this.env.NODE_ENV === "production"
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
