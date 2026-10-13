/**
 * Tip güvenli fetch sarmalayıcı. Tüm API çağrıları `/api` altına gider: gerçek API'de oturum
 * httpOnly cookie ile taşınır; mock modunda (`VITE_ENABLE_MOCKS`) ve testte MSW karşılar.
 */

export const API_BASE = "/api"

/** Mock API (MSW) mi kullanılıyor: tarayıcıda `VITE_ENABLE_MOCKS=true`, Vitest'te her zaman */
export const MOCK_MODU =
  import.meta.env.VITE_ENABLE_MOCKS === "true" ||
  import.meta.env.MODE === "test"

/**
 * Mock API işlemi yapan personeli bu başlıktan çözer (cookie oturumu yok). Gerçek API bu başlığı
 * yok sayar; aktör oturumdan gelir. Bu yüzden yalnızca mock modunda gönderilir.
 */
export const ACTOR_HEADER = "X-Actor-Id"

let actorIdProvider: () => string | undefined = () => undefined

/** Oturum katmanı (features/auth) kendini kaydeder; lib katmanı feature'a bağımlı olmaz. */
export function setActorIdProvider(provider: () => string | undefined) {
  actorIdProvider = provider
}

let yetkisizIsleyici: (() => void) | null = null

/**
 * Oturum düştüğünde (401) çağrılır: oturum katmanı yerel kullanıcıyı temizler, korumalı
 * sayfa giriş ekranına yönlendirir. Giriş isteğinin 401'i (hatalı şifre) hariç.
 */
export function setYetkisizIsleyici(isleyici: (() => void) | null) {
  yetkisizIsleyici = isleyici
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

interface RequestOptions {
  params?: QueryParams
  body?: unknown
  signal?: AbortSignal
}

export function buildUrl(path: string, params?: QueryParams): string {
  // Göreli URL node (Vitest) ortamında fetch ile çalışmadığı için origin'e bağlanır.
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (v === undefined || v === null || v === "") continue
        url.searchParams.append(key, String(v))
      }
    }
  }
  return url.toString()
}

async function request<T>(
  method: string,
  path: string,
  { params, body, signal }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (MOCK_MODU) {
    const actorId = actorIdProvider()
    if (actorId) headers[ACTOR_HEADER] = actorId
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    signal,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") yetkisizIsleyici?.()
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `İstek başarısız (${response.status})`
    throw new ApiError(response.status, message, data)
  }

  return data as T
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body">) =>
    request<T>("GET", path, options),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "body">
  ) => request<T>("POST", path, { ...options, body }),
  put: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "body">
  ) => request<T>("PUT", path, { ...options, body }),
  patch: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "body">
  ) => request<T>("PATCH", path, { ...options, body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "body">) =>
    request<T>("DELETE", path, options),
}
