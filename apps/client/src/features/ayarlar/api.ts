import { http } from "@/lib/http"
import type { DevStatsResponse } from "@prime/shared/types/api"
import type { Buro } from "@prime/shared/types/domain"

export const ayarlarApi = {
  buro: () => http.get<Buro>("/buro"),
  resetMockDb: () => http.post<void>("/dev/reset"),
  mockDbStats: () => http.get<DevStatsResponse>("/dev/stats"),
}
