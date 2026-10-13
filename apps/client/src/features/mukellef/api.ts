import { http } from "@/lib/http"
import type {
  MukellefInput,
  MukellefListParams,
  MukellefListResponse,
  TopluAtamaRequest,
} from "@prime/shared/types/api"
import type { Mukellef } from "@prime/shared/types/domain"

export const mukellefApi = {
  list: (params: MukellefListParams = {}) =>
    http.get<MukellefListResponse>("/mukellefler", { params: { ...params } }),
  detail: (id: string) => http.get<Mukellef>(`/mukellefler/${id}`),
  create: (input: MukellefInput) => http.post<Mukellef>("/mukellefler", input),
  update: (id: string, input: MukellefInput) =>
    http.put<Mukellef>(`/mukellefler/${id}`, input),
  topluAtama: (body: TopluAtamaRequest) =>
    http.post<{ guncellenen: number }>("/mukellefler/toplu-atama", body),
}
