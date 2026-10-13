import { http } from "@/lib/http"
import type {
  DosyaErisimIslemi,
  ArsivIcerikResponse,
  GelenEvrakView,
  GelenListParams,
  GelenOnaylaRequest,
  GelenReddetRequest,
  GelenSayacResponse,
  MesajSablonlari,
  TalepDetay,
  TalepListParams,
  TalepOlusturRequest,
  TalepView,
} from "@prime/shared/types/api"
import type { Buro, TalepKanal } from "@prime/shared/types/domain"

export const evrakTalebiApi = {
  list: (params: TalepListParams) =>
    http.get<TalepView[]>("/evrak-talepleri", { params: { ...params } }),
  detay: (id: string) => http.get<TalepDetay>(`/evrak-talepleri/${id}`),
  olustur: (body: TalepOlusturRequest) =>
    http.post<TalepView>("/evrak-talepleri", body),
  gonderim: (id: string, kanal: TalepKanal) =>
    http.post<TalepView>(`/evrak-talepleri/${id}/gonderim`, { kanal }),
  uzat: (id: string, gun: number) =>
    http.post<TalepView>(`/evrak-talepleri/${id}/uzat`, { gun }),
  iptal: (id: string) => http.post<TalepView>(`/evrak-talepleri/${id}/iptal`),
  yenidenAc: (id: string) =>
    http.post<TalepView>(`/evrak-talepleri/${id}/yeniden-ac`),

  gelenList: (params: GelenListParams) =>
    http.get<GelenEvrakView[]>("/gelen-evrak", { params: { ...params } }),
  gelenSayac: () => http.get<GelenSayacResponse>("/gelen-evrak/sayac"),
  gelenIcerik: (id: string, islem: DosyaErisimIslemi = "onizle") =>
    http.get<ArsivIcerikResponse>(`/gelen-evrak/${id}/icerik`, {
      params: { islem },
    }),
  onayla: (id: string, body: GelenOnaylaRequest) =>
    http.post<GelenEvrakView>(`/gelen-evrak/${id}/onayla`, body),
  reddet: (id: string, body: GelenReddetRequest) =>
    http.post<GelenEvrakView>(`/gelen-evrak/${id}/reddet`, body),

  sablonlariKaydet: (body: MesajSablonlari) =>
    http.put<Buro>("/buro/sablonlar", body),
}
