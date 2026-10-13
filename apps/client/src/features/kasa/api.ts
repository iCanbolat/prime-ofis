import { http } from "@/lib/http"
import type {
  CredentialCreateRequest,
  CredentialErisimRequest,
  CredentialKaydi,
  CredentialListParams,
  CredentialUpdateRequest,
  KasaMetaResponse,
  SonErisim,
} from "@prime/shared/types/api"

export const kasaApi = {
  meta: () => http.get<KasaMetaResponse>("/kasa/meta"),
  list: (params: CredentialListParams = {}) =>
    http.get<CredentialKaydi[]>("/kasa/credentials", { params: { ...params } }),
  create: (body: CredentialCreateRequest) =>
    http.post<CredentialKaydi>("/kasa/credentials", body),
  update: (id: string, body: CredentialUpdateRequest) =>
    http.put<CredentialKaydi>(`/kasa/credentials/${id}`, body),
  remove: (id: string) => http.delete<void>(`/kasa/credentials/${id}`),
  erisim: (id: string, body: CredentialErisimRequest) =>
    http.post<{ sonErisim: SonErisim }>(`/kasa/credentials/${id}/erisim`, body),
}
