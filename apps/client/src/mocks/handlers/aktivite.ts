import { HttpResponse, http } from "msw"

import { db } from "@/mocks/db"
import { api } from "@/mocks/handlers/common"
import type { AktiviteKaydi } from "@prime/shared/types/api"

export const aktiviteHandlers = [
  http.get(api("/aktivite"), ({ request }) => {
    const params = new URL(request.url).searchParams
    const mukellefId = params.get("mukellefId")
    const hedefId = params.get("hedefId")
    const eylemler = params.get("eylem")?.split(",").filter(Boolean)
    const limit = Math.min(Number(params.get("limit")) || 20, 100)

    const items: AktiviteKaydi[] = db.aktivite
      .where(
        (a) =>
          (!mukellefId || a.mukellefId === mukellefId) &&
          (!hedefId || a.hedefId === hedefId) &&
          (!eylemler?.length || eylemler.includes(a.eylem))
      )
      .sort((a, b) => b.zaman.localeCompare(a.zaman))
      .slice(0, limit)
      .map((a) => {
        const p = db.personel.find(a.aktorId)
        return {
          ...a,
          aktor: p
            ? { id: p.id, ad: p.ad, soyad: p.soyad, renk: p.renk }
            : null,
        }
      })

    return HttpResponse.json(items)
  }),
]
