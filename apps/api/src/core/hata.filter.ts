import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common"
import type { FastifyReply } from "fastify"

const VARSAYILAN_MESAJ: Record<number, string> = {
  400: "Geçersiz istek",
  401: "Oturum bulunamadı, lütfen tekrar giriş yapın",
  403: "Bu işlem için yetkiniz yok",
  404: "Kayıt bulunamadı",
  409: "Kayıt çakışması",
  410: "Bu kaynak artık kullanılamıyor",
  413: "İstek çok büyük",
  422: "İşlem yapılamadı",
  429: "Çok fazla istek, lütfen biraz sonra tekrar deneyin",
  500: "Sunucu hatası",
}

/**
 * Tüm hatalar client'ın beklediği biçimde döner: `{ message: string, ...ek }`
 * (`lib/http.ts → ApiError`, `body.message` okur). Nest'in `{ statusCode, message: string[], error }`
 * biçimi kullanılmaz. Ek alanlar korunur (ör. e-Belge arşive kaydet 409 → `arsivDosyaId`).
 */
@Catch()
export class HataFiltresi implements ExceptionFilter {
  catch(hata: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    const { status, govde } = HataFiltresi.govde(hata)
    void reply.status(status).send(govde)
  }

  /** Hata → `{ status, govde }`; 5xx loglanır. Fastify hata işleyicisi de bunu kullanır. */
  static govde(hata: unknown) {
    const sonuc = hataGovdesi(hata)
    if (sonuc.status >= 500) HataFiltresi.logger.error(hata)
    return sonuc
  }

  private static readonly logger = new Logger("Hata")
}

export function hataGovdesi(hata: unknown): {
  status: number
  govde: Record<string, unknown> & { message: string }
} {
  if (hata instanceof HttpException) {
    const status = hata.getStatus()
    const yanit = hata.getResponse()
    if (typeof yanit === "object" && yanit !== null) {
      const { statusCode: _s, error: _e, message, ...ek } = yanit as Record<
        string,
        unknown
      >
      return { status, govde: { ...ek, message: mesajMetni(message, status) } }
    }
    return { status, govde: { message: mesajMetni(yanit, status) } }
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    govde: { message: VARSAYILAN_MESAJ[500] },
  }
}

function mesajMetni(message: unknown, status: number): string {
  // Nest'in eşleşmeyen yol mesajı ("Cannot GET /api/…")
  if (status === 404 && typeof message === "string" && message.startsWith("Cannot ")) {
    return "İstenen adres bulunamadı"
  }
  if (typeof message === "string" && message) return message
  if (Array.isArray(message) && message.length) return message.join(". ")
  return varsayilanMesaj(status)
}

export function varsayilanMesaj(status: number): string {
  return VARSAYILAN_MESAJ[status] ?? `İstek başarısız (${status})`
}
