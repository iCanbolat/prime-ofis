import { HttpResponse, http } from "msw"

import { SABLON_TIPLERI, sablonHatasi } from "@prime/shared/evrak-talebi/mesaj"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import type { MesajSablonlari } from "@prime/shared/types/api"

export const buroHandlers = [
  http.get(api("/buro"), () => {
    const [buro] = db.buro.all()
    return buro ? HttpResponse.json(buro) : notFound("Büro bilgisi bulunamadı")
  }),

  http.put<never, MesajSablonlari>(
    api("/buro/sablonlar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Mesaj şablonlarını yalnızca yönetici değiştirebilir"
        )
      const [buro] = db.buro.all()
      if (!buro) return notFound("Büro bilgisi bulunamadı")

      const body = await request.json()
      const sablonlar = { ...buro.mesajSablonlari }
      for (const tip of SABLON_TIPLERI) {
        // Eski istemciler yalnızca TALEP/RED gönderebilir; gönderilmeyen tür korunur
        if (body[tip] === undefined && sablonlar[tip]) continue
        const hata = sablonHatasi(tip, body[tip])
        if (hata) return errorResponse(400, hata)
        sablonlar[tip] = body[tip].trim()
      }
      const guncel = db.buro.update(buro.id, { mesajSablonlari: sablonlar })!
      logActivity({ aktorId: actor.id, eylem: "SABLON_GUNCELLENDI" })
      return HttpResponse.json(guncel)
    }
  ),
]
