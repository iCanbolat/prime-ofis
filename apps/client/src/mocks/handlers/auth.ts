import { HttpResponse, http } from "msw"

import { db } from "@/mocks/db"
import { api, errorResponse } from "@/mocks/handlers/common"
import { sifreDogrula } from "@/mocks/personel-sifre"
import type { LoginRequest, LoginResponse } from "@prime/shared/types/api"

export const authHandlers = [
  http.post<never, LoginRequest>(api("/auth/login"), async ({ request }) => {
    const { personelId, sifre } = await request.json()
    const personel = db.personel.find(personelId)
    // Kullanıcı yok / şifre yanlış aynı yanıtı verir: hangi hesabın var olduğu sızmasın
    if (!personel || !(await sifreDogrula(personelId, sifre ?? "")))
      return errorResponse(401, "Kullanıcı veya şifre hatalı")
    if (!personel.aktif) return errorResponse(403, "Bu kullanıcı pasif durumda")

    db.aktivite.insert({
      aktorId: personel.id,
      eylem: "GIRIS",
      zaman: new Date().toISOString(),
    })
    return HttpResponse.json<LoginResponse>({ personel })
  }),

  http.post<never, LoginRequest>(api("/auth/logout"), async ({ request }) => {
    const { personelId } = await request.json()
    if (db.personel.find(personelId)) {
      db.aktivite.insert({
        aktorId: personelId,
        eylem: "CIKIS",
        zaman: new Date().toISOString(),
      })
    }
    return new HttpResponse(null, { status: 204 })
  }),
]
