import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
// FastifyRequest.cookies / FastifyReply.setCookie tip genişletmesi
import type {} from "@fastify/cookie"

import type { Personel, Rol } from "@prime/shared/types/domain"

declare module "fastify" {
  interface FastifyRequest {
    /** Oturumdan çözülen personel (`OturumGuard`) */
    aktor?: Personel
    /** Cookie'deki ham oturum id'si */
    oturumId?: string
  }
}

export const PUBLIC = Symbol("PUBLIC")
export const ROLLER = Symbol("ROLLER")
export const CSRF_MUAF = Symbol("CSRF_MUAF")

/** Oturum istemeyen uç (login, health, portal, webhook) */
export const Public = () => SetMetadata(PUBLIC, true)

/** Tarayıcı dışı çağrılan uç (webhook): Origin kontrolü yapılmaz */
export const CsrfMuaf = () => SetMetadata(CSRF_MUAF, true)

export interface RolKurali {
  roller: Rol[]
  mesaj?: string
}

/** Yalnızca bu rollerdeki personel; değilse 403 (`mesaj` ya da varsayılan) */
export const Roller = (roller: Rol | Rol[], mesaj?: string) =>
  SetMetadata(ROLLER, {
    roller: Array.isArray(roller) ? roller : [roller],
    mesaj,
  } satisfies RolKurali)

/** İşlemi yapan personel. `@Public()` uçta oturum yoksa `undefined`. */
export const Aktor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<FastifyRequest>().aktor
)
