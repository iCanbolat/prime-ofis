import { http } from "@/lib/http"
import type { BildirimListParams, BildirimListResponse } from "@prime/shared/types/api"

export const bildirimApi = {
  list: (params: BildirimListParams = {}) =>
    http.get<BildirimListResponse>("/bildirim", { params: { ...params } }),
  okundu: (id: string) => http.post<void>(`/bildirim/${id}/okundu`),
  tumunuOkundu: () => http.post<void>("/bildirim/okundu"),
}
