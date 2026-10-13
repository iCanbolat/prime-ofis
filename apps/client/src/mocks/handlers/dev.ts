import { HttpResponse, http } from "msw"

import { getDbSnapshot, resetDb } from "@/mocks/db"
import { api } from "@/mocks/handlers/common"

export const devHandlers = [
  http.post(api("/dev/reset"), () => {
    resetDb()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api("/dev/stats"), () => {
    const snapshot = getDbSnapshot()
    return HttpResponse.json(
      Object.fromEntries(
        Object.entries(snapshot).map(([key, rows]) => [key, rows.length])
      )
    )
  }),
]
