import { http } from "@/lib/http"
import type {
  BordroBelgeEkleRequest,
  BordroDetay,
  BordroGuncelleRequest,
  BordroListParams,
  BordroListResponse,
  BordroOkuRequest,
  BordroOkuResponse,
  BordroOzetResponse,
  BordroOzetiKaydetRequest,
  BordroSatiri,
  IsHareketiEkleRequest,
  IsHareketiGuncelleRequest,
  IsHareketiListParams,
  IsHareketiView,
} from "@prime/shared/types/api"

export const bordroApi = {
  liste: (params: BordroListParams) =>
    http.get<BordroListResponse>("/bordro", { params: { ...params } }),
  ozet: (params: { sorumlu?: string } = {}) =>
    http.get<BordroOzetResponse>("/bordro/ozet", { params: { ...params } }),
  mukellef: (mukellefId: string, adet = 12) =>
    http.get<BordroSatiri[]>(`/mukellefler/${mukellefId}/bordro`, {
      params: { adet },
    }),
  detay: (mukellefId: string, donem: string) =>
    http.get<BordroDetay>(`/bordro/${mukellefId}/${donem}`),
  guncelle: (mukellefId: string, donem: string, body: BordroGuncelleRequest) =>
    http.patch<BordroSatiri>(`/bordro/${mukellefId}/${donem}`, body),
  /** PDF bordro dökümünü backend'de okutur (Claude); sonuç personel onayına sunulur */
  oku: (body: BordroOkuRequest) =>
    http.post<BordroOkuResponse>("/bordro/oku", body),
  ozetiKaydet: (
    mukellefId: string,
    donem: string,
    body: BordroOzetiKaydetRequest
  ) => http.post<BordroDetay>(`/bordro/${mukellefId}/${donem}/ozet`, body),
  /** Özetsiz belge ekleme (pusula, imzalı bordro, dekont…); arşive dönemle yazılır */
  belgeEkle: (
    mukellefId: string,
    donem: string,
    body: BordroBelgeEkleRequest
  ) => http.post<BordroDetay>(`/bordro/${mukellefId}/${donem}/belgeler`, body),
  hareketler: (params: IsHareketiListParams = {}) =>
    http.get<IsHareketiView[]>("/is-hareketleri", { params: { ...params } }),
  hareketEkle: (body: IsHareketiEkleRequest) =>
    http.post<IsHareketiView>("/is-hareketleri", body),
  hareketGuncelle: (id: string, body: IsHareketiGuncelleRequest) =>
    http.patch<IsHareketiView>(`/is-hareketleri/${id}`, body),
  hareketSil: (id: string) =>
    http.delete<{ id: string }>(`/is-hareketleri/${id}`),
  calisanUygula: (mukellefId: string, donem: string) =>
    http.post<BordroDetay>(`/bordro/${mukellefId}/${donem}/calisan-uygula`),
}
