import { http } from "@/lib/http"
import type {
  FisDetay,
  FisGuncelleRequest,
  FisHesapAyariRequest,
  FisHesapAyariResponse,
  FisListParams,
  FisSayacResponse,
  FisView,
  LucaAktarimDetay,
  LucaAktarimRequest,
  LucaAktarimView,
  OkumaView,
} from "@prime/shared/types/api"
import type { LucaSablonAyari } from "@prime/shared/types/domain"

export const fisAktarimiApi = {
  fisler: (params: FisListParams = {}) =>
    http.get<FisView[]>("/fisler", { params: { ...params } }),
  sayac: () => http.get<FisSayacResponse>("/fisler/sayac"),
  fis: (id: string) => http.get<FisDetay>(`/fisler/${id}`),
  guncelle: (id: string, body: FisGuncelleRequest) =>
    http.put<FisView>(`/fisler/${id}`, body),
  onayla: (id: string) => http.post<FisView>(`/fisler/${id}/onayla`),
  taslagaAl: (id: string) => http.post<FisView>(`/fisler/${id}/taslaga-al`),
  okumalar: (params: { mukellefId?: string } = {}) =>
    http.get<OkumaView[]>("/okumalar", { params: { ...params } }),
  yenidenOku: (id: string) =>
    http.post<OkumaView>(`/okumalar/${id}/yeniden-oku`),
  hesaplar: (mukellefId: string) =>
    http.get<FisHesapAyariResponse>(`/mukellefler/${mukellefId}/fis-hesaplari`),
  hesaplariKaydet: (mukellefId: string, body: FisHesapAyariRequest) =>
    http.put<FisHesapAyariResponse>(
      `/mukellefler/${mukellefId}/fis-hesaplari`,
      body
    ),
  sablon: () => http.get<LucaSablonAyari>("/buro/luca-sablonu"),
  sablonKaydet: (body: LucaSablonAyari) =>
    http.put<LucaSablonAyari>("/buro/luca-sablonu", body),
  aktarimlar: (params: { mukellefId?: string } = {}) =>
    http.get<LucaAktarimView[]>("/luca-aktarimlari", { params: { ...params } }),
  aktarim: (id: string) =>
    http.get<LucaAktarimDetay>(`/luca-aktarimlari/${id}`),
  aktar: (body: LucaAktarimRequest) =>
    http.post<LucaAktarimDetay>("/luca-aktarimlari", body),
  geriAl: (id: string) =>
    http.post<LucaAktarimView>(`/luca-aktarimlari/${id}/geri-al`),
}
