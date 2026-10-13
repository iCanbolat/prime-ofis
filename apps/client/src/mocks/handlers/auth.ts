import { HttpResponse, http } from "msw"

import { db } from "@/mocks/db"
import { api, errorResponse, requireActor } from "@/mocks/handlers/common"
import { sifreDogrula } from "@/mocks/personel-sifre"
import type { LoginRequest, LoginResponse } from "@prime/shared/types/api"

/**
 * Mock oturum: gerçek API httpOnly cookie kullanır; MSW'de cookie yerine istemcinin gönderdiği
 * `X-Actor-Id` başlığı oturum yerine geçer (`lib/http.ts`, yalnızca mock modunda).
 */
export const authHandlers = [
  http.post<never, Partial<LoginRequest>>(
    api("/auth/login"),
    async ({ request }) => {
      const { eposta, sifre } = await request.json()
      const aranan = eposta?.trim().toLowerCase() ?? ""
      const personel = db.personel.where(
        (p) => p.eposta.toLowerCase() === aranan
      )[0]
      // Kullanıcı yok / şifre yanlış aynı yanıtı verir: hangi hesabın var olduğu sızmasın
      if (!personel || !(await sifreDogrula(personel.id, sifre ?? "")))
        return errorResponse(401, "Kullanıcı veya şifre hatalı")
      if (!personel.aktif)
        return errorResponse(403, "Bu kullanıcı pasif durumda")

      db.aktivite.insert({
        aktorId: personel.id,
        eylem: "GIRIS",
        zaman: new Date().toISOString(),
      })
      return HttpResponse.json<LoginResponse>({ personel })
    }
  ),

  http.post(api("/auth/logout"), ({ request }) => {
    const actor = requireActor(request)
    if (!(actor instanceof Response)) {
      db.aktivite.insert({
        aktorId: actor.id,
        eylem: "CIKIS",
        zaman: new Date().toISOString(),
      })
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api("/auth/me"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    if (!actor.aktif)
      return errorResponse(401, "Oturum bulunamadı, lütfen tekrar giriş yapın")
    return HttpResponse.json<LoginResponse>({ personel: actor })
  }),
]
