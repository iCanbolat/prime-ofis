import { http } from "@/lib/http"
import type {
  TebligatBelgeRequest,
  TebligatEkleRequest,
  TebligatErisimKaydetRequest,
  TebligatErisimListParams,
  TebligatErisimSatiri,
  TebligatGuncelleRequest,
  TebligatListParams,
  TebligatListResponse,
  TebligatMukellefTaraResponse,
  TebligatOzetResponse,
  TebligatView,
} from "@prime/shared/types/api"
import type { Gorev } from "@prime/shared/types/domain"

export const tebligatApi = {
  liste: (params: TebligatListParams = {}) =>
    http.get<TebligatListResponse>("/tebligat", { params: { ...params } }),
  ozet: (params: { sorumlu?: string } = {}) =>
    http.get<TebligatOzetResponse>("/tebligat/ozet", { params }),
  detay: (id: string) => http.get<TebligatView>(`/tebligat/${id}`),
  ekle: (body: TebligatEkleRequest) =>
    http.post<TebligatView>("/tebligat", body),
  guncelle: (id: string, body: TebligatGuncelleRequest) =>
    http.patch<TebligatView>(`/tebligat/${id}`, body),
  gorevOlustur: (id: string) => http.post<Gorev>(`/tebligat/${id}/gorev`),
  belgeYukle: (id: string, body: TebligatBelgeRequest) =>
    http.post<TebligatView>(`/tebligat/${id}/belge`, body),
  erisimler: (params: TebligatErisimListParams = {}) =>
    http.get<TebligatErisimSatiri[]>("/tebligat/erisim", {
      params: { ...params },
    }),
  erisim: (mukellefId: string) =>
    http.get<TebligatErisimSatiri>(`/tebligat/erisim/${mukellefId}`),
  erisimKaydet: (mukellefId: string, body: TebligatErisimKaydetRequest) =>
    http.put<TebligatErisimSatiri>(`/tebligat/erisim/${mukellefId}`, body),
  erisimKaldir: (mukellefId: string) =>
    http.delete<void>(`/tebligat/erisim/${mukellefId}`),
  mukellefTara: (mukellefId: string) =>
    http.post<TebligatMukellefTaraResponse>(
      `/tebligat/erisim/${mukellefId}/tara`
    ),
}
