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
  EntegratorBaglantiView,
  KontorAlimRequest,
  KontorAlimView,
  KontorOzetResponse,
  LucaDogrulamaView,
  LucaFirma,
  LucaFirmaAktarimRequest,
  LucaFirmaAktarimSonucu,
  LucaHesapRequest,
  LucaHesapView,
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

/** Büronun Luca portal hesabı (`ENTEGRATOR=luca-portal`) */
export const lucaApi = {
  hesap: () => http.get<LucaHesapView>("/luca-hesap"),
  kaydet: (body: LucaHesapRequest) =>
    http.put<LucaHesapView>("/luca-hesap", body),
  kaldir: () => http.delete<void>("/luca-hesap"),
  firmalar: () => http.get<LucaFirma[]>("/luca-hesap/firmalar"),
  firmaAktar: (body: LucaFirmaAktarimRequest) =>
    http.post<LucaFirmaAktarimSonucu>("/luca-hesap/firmalar/aktar", body),
  dogrulama: () => http.get<LucaDogrulamaView>("/luca-dogrulama"),
  dogrula: (kod: string) =>
    http.post<LucaHesapView>("/luca-dogrulama", { kod }),
  dogrulamaYenile: () => http.post<LucaDogrulamaView>("/luca-dogrulama/yenile"),
}
