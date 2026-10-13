import { http } from "@/lib/http"
import type {
  DosyaErisimIslemi,
  ArsivAgacParams,
  ArsivAgacResponse,
  ArsivDosyaView,
  ArsivGuncelleRequest,
  ArsivIcerikResponse,
  ArsivListParams,
  ArsivListResponse,
  ArsivOzetParams,
  ArsivOzetResponse,
  ArsivYukleRequest,
} from "@prime/shared/types/api"

export const arsivApi = {
  list: (params: ArsivListParams) =>
    http.get<ArsivListResponse>("/arsiv", { params: { ...params } }),
  agac: (params: ArsivAgacParams = {}) =>
    http.get<ArsivAgacResponse>("/arsiv/agac", { params: { ...params } }),
  ozet: (params: ArsivOzetParams = {}) =>
    http.get<ArsivOzetResponse>("/arsiv/ozet", { params: { ...params } }),
  icerik: (id: string, islem: DosyaErisimIslemi = "onizle") =>
    http.get<ArsivIcerikResponse>(`/arsiv/${id}/icerik`, {
      params: { islem },
    }),
  yukle: (body: ArsivYukleRequest) => http.post<ArsivDosyaView>("/arsiv", body),
  guncelle: (id: string, body: ArsivGuncelleRequest) =>
    http.patch<ArsivDosyaView>(`/arsiv/${id}`, body),
  sil: (id: string) => http.delete<{ id: string }>(`/arsiv/${id}`),
  kaliciSil: (id: string) =>
    http.delete<{ id: string }>(`/arsiv/${id}`, { params: { kalici: true } }),
  geriAl: (id: string) => http.post<ArsivDosyaView>(`/arsiv/${id}/geri-al`),
}
