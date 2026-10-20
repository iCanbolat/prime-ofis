import { http } from "@/lib/http"
import type {
  AcilisTopluRequest,
  CredentialTopluRequest,
  MizanDetay,
  MizanIceAktarRequest,
  MizanView,
  TahakkukIceAktarRequest,
  TahakkukIceAktarResponse,
  TahakkukView,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"

export const iceAktarimApi = {
  tahakkuklar: (params: { mukellefId?: string } = {}) =>
    http.get<TahakkukView[]>("/ice-aktarim/tahakkuklar", {
      params: { ...params },
    }),
  tahakkukAktar: (body: TahakkukIceAktarRequest) =>
    http.post<TahakkukIceAktarResponse>("/ice-aktarim/tahakkuklar", body),
  mizanlar: (params: { mukellefId?: string } = {}) =>
    http.get<MizanView[]>("/ice-aktarim/mizanlar", { params: { ...params } }),
  mizan: (id: string) => http.get<MizanDetay>(`/ice-aktarim/mizanlar/${id}`),
  mizanAktar: (body: MizanIceAktarRequest) =>
    http.post<MizanView>("/ice-aktarim/mizanlar", body),
  sifreToplu: (body: CredentialTopluRequest) =>
    http.post<TopluAktarimSonucu>("/kasa/credentials/toplu", body),
  acilisToplu: (body: AcilisTopluRequest) =>
    http.post<TopluAktarimSonucu>("/tahsilat/acilis-toplu", body),
}
