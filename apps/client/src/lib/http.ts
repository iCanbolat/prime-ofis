/**
 * Tip güvenli fetch sarmalayıcı. Tüm API çağrıları `/api` altına gider;
 * geliştirmede ve testte MSW tarafından karşılanır, backend geldiğinde aynı katman kullanılır.
 */

export const API_BASE = "/api"

/** İşlemi yapan personelin id'si bu başlıkla gönderilir (aktivite kaydı için). */
export const ACTOR_HEADER = "X-Actor-Id"

let actorIdProvider: () => string | undefined = () => undefined

/** Oturum katmanı (features/auth) kendini kaydeder; lib katmanı feature'a bağımlı olmaz. */
export function setActorIdProvider(provider: () => string | undefined) {
  actorIdProvider = provider
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
  const actorId = actorIdProvider()
  if (actorId) headers[ACTOR_HEADER] = actorId

  const response = await fetch(buildUrl(path, params), {
    method,
    signal,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : undefined

  if (!response.ok) {
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
