import { http } from "@/lib/http"
import type {
  LoginRequest,
  LoginResponse,
  PersonelGuncelleRequest,
  PersonelOlusturRequest,
  PersonelSifreRequest,
  YoneticiOnayi,
} from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

export const authApi = {
  login: (body: LoginRequest) => http.post<LoginResponse>("/auth/login", body),
  logout: () => http.post<void>("/auth/logout"),
  /** Cookie oturumunun personeli; oturum yoksa 401 */
  me: () => http.get<LoginResponse>("/auth/me"),
  personelList: () => http.get<Personel[]>("/personel"),
  personelOlustur: (body: PersonelOlusturRequest) =>
    http.post<Personel>("/personel", body),
  personelGuncelle: ({
    id,
    ...body
  }: PersonelGuncelleRequest & { id: string }) =>
    http.put<Personel>(`/personel/${id}`, body),
  personelSifre: ({ id, ...body }: PersonelSifreRequest & { id: string }) =>
    http.put<void>(`/personel/${id}/sifre`, body),
  personelSil: ({ id, ...body }: YoneticiOnayi & { id: string }) =>
    http.post<void>(`/personel/${id}/sil`, body),
}
