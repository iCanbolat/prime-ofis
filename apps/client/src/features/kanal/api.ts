import { MOCK_MODU, http } from "@/lib/http"
import type {
  BildirimTercihKaydetRequest,
  BildirimTercihView,
  GonderimListParams,
  GonderimListResponse,
  KanalKaydetRequest,
  KanalTestResponse,
  KanallarResponse,
  MukellefGonderRequest,
  MukellefGonderResponse,
  TelegramBaglamaResponse,
} from "@prime/shared/types/api"
import type { Gonderim, KanalAyari, KanalTip } from "@prime/shared/types/domain"

/** Kullanılabilen kanallar: Telegram gerçek backend'de henüz yok (yalnızca mock / demo) */
export const KULLANILAN_KANALLAR: KanalTip[] = MOCK_MODU
  ? ["EPOSTA", "TELEGRAM", "WHATSAPP"]
  : ["EPOSTA", "WHATSAPP"]

export const kanalApi = {
  kanallar: () => http.get<KanallarResponse>("/kanallar"),
  kaydet: (body: KanalKaydetRequest) =>
    http.put<KanalAyari>(`/kanallar/${body.tip}`, body),
  kaldir: (tip: KanalTip) => http.delete<void>(`/kanallar/${tip}`),
  test: (tip: KanalTip) =>
    http.post<KanalTestResponse>(`/kanallar/${tip}/test`),
  tercih: () => http.get<BildirimTercihView>("/bildirim-tercihleri/ben"),
  tercihKaydet: (body: BildirimTercihKaydetRequest) =>
    http.put<BildirimTercihView>("/bildirim-tercihleri/ben", body),
  telegramBaglantisi: () =>
    http.post<TelegramBaglamaResponse>("/bildirim-tercihleri/ben/telegram"),
  telegramDogrula: () =>
    http.post<BildirimTercihView>("/bildirim-tercihleri/ben/telegram/dogrula"),
  telegramKaldir: () =>
    http.delete<BildirimTercihView>("/bildirim-tercihleri/ben/telegram"),
  gonderimler: (params: GonderimListParams = {}) =>
    http.get<GonderimListResponse>("/gonderimler", { params: { ...params } }),
  tekrar: (id: string) => http.post<Gonderim>(`/gonderimler/${id}/tekrar`),
  mukellefeGonder: (body: MukellefGonderRequest) =>
    http.post<MukellefGonderResponse>("/gonderim/mukellef", body),
}
