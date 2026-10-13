import { http } from "@/lib/http"
import type {
  BorcDetay,
  BorcListParams,
  BorcListResponse,
  BorcOzetResponse,
  BorcuYokturIslemSonucu,
  BorcuYokturListParams,
  BorcuYokturListResponse,
  BorcuYokturTalepRequest,
  KamuDogrulamaCozResponse,
  KamuDogrulamaView,
  KamuIslemSonucu,
  LevhaListParams,
  LevhaListResponse,
  MukellefBorcResponse,
  SgkErisimKaydetRequest,
  SgkErisimSatiri,
  SgkErisimSatirDurumu,
} from "@prime/shared/types/api"
import type { KamuKurum } from "@prime/shared/types/domain"

export const borcApi = {
  ozet: (params: { sorumlu?: string } = {}) =>
    http.get<BorcOzetResponse>("/borc/ozet", { params }),
  liste: (params: BorcListParams) =>
    http.get<BorcListResponse>("/borc", { params: { ...params } }),
  detay: (mukellefId: string, kurum: KamuKurum) =>
    http.get<BorcDetay>(`/borc/${mukellefId}/${kurum}`),
  sorgula: (mukellefId: string, kurum: KamuKurum) =>
    http.post<KamuIslemSonucu>(`/borc/${mukellefId}/${kurum}/sorgula`),
  mukellef: (mukellefId: string) =>
    http.get<MukellefBorcResponse>(`/mukellefler/${mukellefId}/borc`),
  levhalar: (params: LevhaListParams = {}) =>
    http.get<LevhaListResponse>("/vergi-levhasi", { params: { ...params } }),
  levhaSorgula: (mukellefId: string) =>
    http.post<KamuIslemSonucu>(`/vergi-levhasi/${mukellefId}/sorgula`),
  borcuYokturListe: (params: BorcuYokturListParams = {}) =>
    http.get<BorcuYokturListResponse>("/borcu-yoktur", {
      params: { ...params },
    }),
  borcuYokturTalep: (body: BorcuYokturTalepRequest) =>
    http.post<BorcuYokturIslemSonucu>("/borcu-yoktur", body),
  borcuYokturKontrol: (id: string) =>
    http.post<BorcuYokturIslemSonucu>(`/borcu-yoktur/${id}/kontrol`),
  sgkErisimler: (params: { durum?: SgkErisimSatirDurumu } = {}) =>
    http.get<SgkErisimSatiri[]>("/sgk-erisim", { params: { ...params } }),
  sgkErisim: (mukellefId: string) =>
    http.get<SgkErisimSatiri>(`/sgk-erisim/${mukellefId}`),
  sgkErisimKaydet: (mukellefId: string, body: SgkErisimKaydetRequest) =>
    http.put<SgkErisimSatiri>(`/sgk-erisim/${mukellefId}`, body),
  sgkErisimKaldir: (mukellefId: string) =>
    http.delete<void>(`/sgk-erisim/${mukellefId}`),
  dogrulamalar: (params: { mukellefId?: string } = {}) =>
    http.get<KamuDogrulamaView[]>("/kamu-dogrulama", { params }),
  dogrulamaCoz: (id: string, kod: string) =>
    http.post<KamuDogrulamaCozResponse>(`/kamu-dogrulama/${id}`, { kod }),
  dogrulamaYenile: (id: string) =>
    http.post<KamuDogrulamaView>(`/kamu-dogrulama/${id}/yenile`),
}
