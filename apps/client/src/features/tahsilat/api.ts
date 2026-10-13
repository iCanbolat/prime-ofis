import { http } from "@/lib/http"
import type {
  BuroGuncelleRequest,
  CariEkstreResponse,
  CariListParams,
  CariListResponse,
  HareketEkleRequest,
  KesintiIceAktarRequest,
  KesintiIceAktarimView,
  KesintiRaporResponse,
  TahsilatOzetResponse,
  UcretKaydetRequest,
} from "@prime/shared/types/api"
import type { Buro, CariHareket, Mukellef } from "@prime/shared/types/domain"

export const tahsilatApi = {
  ozet: (params: { sorumlu?: string } = {}) =>
    http.get<TahsilatOzetResponse>("/tahsilat/ozet", { params }),
  cari: (params: CariListParams = {}) =>
    http.get<CariListResponse>("/tahsilat/cari", { params: { ...params } }),
  ekstre: (mukellefId: string) =>
    http.get<CariEkstreResponse>(`/tahsilat/cari/${mukellefId}`),
  hareketEkle: (body: HareketEkleRequest) =>
    http.post<CariHareket>("/tahsilat/hareketler", body),
  hareketSil: (id: string) => http.delete<void>(`/tahsilat/hareketler/${id}`),
  ucretKaydet: (mukellefId: string, body: UcretKaydetRequest) =>
    http.put<Mukellef>(`/mukellefler/${mukellefId}/ucret`, body),
  kesinti: (yil?: number) =>
    http.get<KesintiRaporResponse>("/tahsilat/kesinti", { params: { yil } }),
  kesintiIceAktar: (body: KesintiIceAktarRequest) =>
    http.post<KesintiIceAktarimView>("/tahsilat/kesinti/ice-aktar", body),
  buroGuncelle: (body: BuroGuncelleRequest) => http.patch<Buro>("/buro", body),
}
