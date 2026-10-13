import { HttpResponse, delay, http } from "msw"

import { ACTOR_HEADER, API_BASE } from "@/lib/http"
import { getMockErrorPattern, isMockDelayEnabled } from "@/mocks/config"
import {
  bildirimUret,
  type BildirimSecenekleri,
} from "@/mocks/bildirim-kurallari"
import { db } from "@/mocks/db"
import type { AktiviteLog, Personel } from "@prime/shared/types/domain"

export const api = (path: string) => `${API_BASE}${path}`

export const errorResponse = (status: number, message: string) =>
  HttpResponse.json({ message }, { status })

export const notFound = (message = "Kayıt bulunamadı") =>
  errorResponse(404, message)

/**
 * Tüm /api isteklerinden önce çalışır: gecikme ve hata simülasyonu.
 * Bir şey döndürmezse MSW eşleşen asıl handler'a devam eder.
 */
export const simulationHandler = http.all(api("/*"), async ({ request }) => {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith(api("/dev/"))) return

  if (isMockDelayEnabled()) {
    await delay(200 + Math.floor(Math.random() * 400))
  }

  const pattern = getMockErrorPattern()
  if (pattern && pathname.startsWith(pattern)) {
    return errorResponse(500, "Simüle edilmiş sunucu hatası")
  }
})

export function turkishIncludes(
  haystack: string | undefined,
  needle: string
): boolean {
  if (!haystack) return false
  return haystack
    .toLocaleLowerCase("tr-TR")
    .includes(needle.toLocaleLowerCase("tr-TR"))
}

/**
 * İşlemi yapan personeli `X-Actor-Id` başlığından çözer. Bulunamazsa 401 yanıtı döner;
 * handler'lar `if (actor instanceof Response) return actor` ile erken çıkar.
 */
export function requireActor(request: Request): Personel | Response {
  const actorId = request.headers.get(ACTOR_HEADER)
  const actor = actorId ? db.personel.find(actorId) : undefined
  return (
    actor ?? errorResponse(401, "Oturum bulunamadı, lütfen tekrar giriş yapın")
  )
}

/** `?islem=indir` ise indirme, aksi halde görüntüleme sayılır */
export function dosyaErisimIslemi(request: Request): "onizle" | "indir" {
  return new URL(request.url).searchParams.get("islem") === "indir"
    ? "indir"
    : "onizle"
}

/**
 * Dosya içeriği her okunduğunda sunucu tarafında erişim kaydı yazar (bildirim üretmez).
 * Bordro gibi hassas dosyaların kimin tarafından açıldığı bu kayıttan izlenir.
 */
export function logDosyaErisimi(
  request: Request,
  actor: Personel,
  dosya: {
    hedefTip: "ARSIV" | "EVRAK" | "EBELGE"
    hedefId: string
    mukellefId: string
    ad: string
  }
) {
  logActivity(
    {
      aktorId: actor.id,
      eylem:
        dosyaErisimIslemi(request) === "indir"
          ? "DOSYA_INDIRILDI"
          : "DOSYA_GORUNTULENDI",
      hedefTip: dosya.hedefTip,
      hedefId: dosya.hedefId,
      mukellefId: dosya.mukellefId,
      aciklama: dosya.ad,
    },
    false
  )
}

/**
 * Aktiviteye yazar ve kurallara göre bildirim üretir (`bildirim-kurallari.ts`).
 * `bildirim` ile alıcılar / tür kural dışında belirlenebilir; `false` bildirimi kapatır.
 */
export function logActivity(
  entry: Omit<AktiviteLog, "id" | "zaman">,
  bildirim: BildirimSecenekleri | false = {}
) {
  const log = db.aktivite.insert({ ...entry, zaman: new Date().toISOString() })
  if (bildirim !== false) bildirimUret(log, bildirim)
  return log
}
