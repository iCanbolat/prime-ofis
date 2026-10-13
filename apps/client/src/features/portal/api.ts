/**
 * Müşteri portalı API'si. Girişsizdir: erişim yalnızca URL'deki token ile yapılır.
 * Dosya yüklemede ilerleme göstermek için XMLHttpRequest kullanılır (fetch upload ilerlemesi vermez).
 */
import { ApiError, buildUrl, http } from "@/lib/http"
import type {
  PortalResponse,
  PortalTamamlaRequest,
  PortalYukleRequest,
  PortalYukleme,
} from "@prime/shared/types/api"

function yukleXhr(
  token: string,
  body: PortalYukleRequest,
  onIlerleme: (yuzde: number) => void
): Promise<PortalYukleme> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", buildUrl(`/portal/${encodeURIComponent(token)}/yukleme`))
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onIlerleme(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      let data: unknown
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined
      } catch {
        data = undefined
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onIlerleme(100)
        resolve(data as PortalYukleme)
      } else {
        const mesaj =
          data &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : `Yükleme başarısız (${xhr.status})`
        reject(new ApiError(xhr.status, mesaj, data))
      }
    }
    xhr.onerror = () =>
      reject(
        new ApiError(
          0,
          "Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin."
        )
      )
    xhr.send(JSON.stringify(body))
  })
}

export const portalApi = {
  get: (token: string) =>
    http.get<PortalResponse>(`/portal/${encodeURIComponent(token)}`),
  yukle: yukleXhr,
  sil: (token: string, id: string) =>
    http.delete<{ id: string }>(
      `/portal/${encodeURIComponent(token)}/yukleme/${id}`
    ),
  tamamla: (token: string, body: PortalTamamlaRequest) =>
    http.post<PortalResponse>(
      `/portal/${encodeURIComponent(token)}/tamamla`,
      body
    ),
}
