import { http } from "@/lib/http"
import type {
  DonemOlusturRequest,
  DonemOlusturResponse,
  DonemPlanRequest,
  DonemPlanSatiri,
  GorevDetay,
  GorevGuncelleRequest,
  GorevListParams,
  GorevOlusturRequest,
  GorevOzetParams,
  GorevOzetResponse,
  GorevTopluRequest,
  GorevTopluResponse,
  GorevView,
} from "@prime/shared/types/api"
import type { GorevDurum } from "@prime/shared/types/domain"

export const gorevApi = {
  list: (params: GorevListParams) =>
    http.get<GorevView[]>("/gorevler", { params: { ...params } }),
  ozet: (params: GorevOzetParams = {}) =>
    http.get<GorevOzetResponse>("/gorevler/ozet", { params: { ...params } }),
  detay: (id: string) => http.get<GorevDetay>(`/gorevler/${id}`),
  olustur: (body: GorevOlusturRequest) =>
    http.post<GorevView>("/gorevler", body),
  guncelle: (id: string, body: GorevGuncelleRequest) =>
    http.patch<GorevDetay>(`/gorevler/${id}`, body),
  tasi: (id: string, durum: GorevDurum) =>
    http.post<GorevView>(`/gorevler/${id}/tasi`, { durum }),
  toplu: (body: GorevTopluRequest) =>
    http.post<GorevTopluResponse>("/gorevler/toplu", body),
  yorum: (id: string, metin: string) =>
    http.post<GorevDetay>(`/gorevler/${id}/yorum`, { metin }),
  sil: (id: string) => http.delete<void>(`/gorevler/${id}`),
  donemOnizleme: (body: DonemPlanRequest) =>
    http.post<DonemPlanSatiri[]>("/gorevler/donem/onizleme", body),
  donemOlustur: (body: DonemOlusturRequest) =>
    http.post<DonemOlusturResponse>("/gorevler/donem", body),
}
