import { http } from "@/lib/http"
import type {
  DosyaErisimIslemi,
  BaglantiKaydetRequest,
  BeratListParams,
  BeratListResponse,
  EBelgeDetay,
  EBelgeIcerikResponse,
  EBelgeListParams,
  EBelgeListResponse,
  EBelgeOzetResponse,
  EBelgeView,
  EFaturaYanitRequest,
  EntegratorBaglantiView,
  KontorAlimRequest,
  KontorAlimView,
  KontorOzetResponse,
  SenkronRequest,
  SenkronResponse,
} from "@prime/shared/types/api"

export const eBelgeApi = {
  baglantilar: () => http.get<EntegratorBaglantiView[]>("/e-belge/baglantilar"),
  baglanti: (mukellefId: string) =>
    http.get<EntegratorBaglantiView>(`/e-belge/baglantilar/${mukellefId}`),
  baglantiKaydet: (mukellefId: string, body: BaglantiKaydetRequest) =>
    http.put<EntegratorBaglantiView>(
      `/e-belge/baglantilar/${mukellefId}`,
      body
    ),
  baglantiKaldir: (mukellefId: string) =>
    http.delete<void>(`/e-belge/baglantilar/${mukellefId}`),
  senkron: (body: SenkronRequest = {}) =>
    http.post<SenkronResponse>("/e-belge/senkron", body),
  faturalar: (params: EBelgeListParams) =>
    http.get<EBelgeListResponse>("/e-belge/faturalar", {
      params: { ...params },
    }),
  fatura: (id: string) => http.get<EBelgeDetay>(`/e-belge/faturalar/${id}`),
  icerik: (id: string, islem: DosyaErisimIslemi = "onizle") =>
    http.get<EBelgeIcerikResponse>(`/e-belge/faturalar/${id}/icerik`, {
      params: { islem },
    }),
  yanit: (id: string, body: EFaturaYanitRequest) =>
    http.post<EBelgeView>(`/e-belge/faturalar/${id}/yanit`, body),
  arsiveKaydet: (id: string) =>
    http.post<EBelgeView>(`/e-belge/faturalar/${id}/arsive-kaydet`),
  beratlar: (params: BeratListParams = {}) =>
    http.get<BeratListResponse>("/e-belge/beratlar", { params: { ...params } }),
  kontor: (params: { donem?: string } = {}) =>
    http.get<KontorOzetResponse>("/e-belge/kontor", { params: { ...params } }),
  kontorAlimEkle: (body: KontorAlimRequest) =>
    http.post<KontorAlimView>("/e-belge/kontor/alimlar", body),
  ozet: (params: { sorumlu?: string } = {}) =>
    http.get<EBelgeOzetResponse>("/e-belge/ozet", { params: { ...params } }),
}
