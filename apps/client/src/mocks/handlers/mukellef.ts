import { HttpResponse, http } from "msw"

import {
  MUKELLEF_TURLERI,
  kimlikCakismaMesaji,
  mukellefGirdiSemasi,
  mukellefKimlikHatasi,
  mukellefNormalize,
} from "@prime/shared/mukellef/girdi"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { ensureVault } from "@/mocks/vault"
import type {
  MukellefDurumFiltre,
  MukellefInput,
  MukellefListResponse,
  MukellefTopluRequest,
  TopluAktarimSonucu,
  TopluAtamaRequest,
} from "@prime/shared/types/api"
import type { Mukellef, MukellefTur } from "@prime/shared/types/domain"

const TURLER: readonly MukellefTur[] = MUKELLEF_TURLERI
const DURUMLAR: MukellefDurumFiltre[] = ["aktif", "pasif", "tumu"]

type Girdi = ReturnType<typeof mukellefNormalize>

/**
 * Sunucu tarafı doğrulama (`@prime/shared/mukellef/girdi`, gerçek API ile ortak): yapı ve kimlik
 * kontrolü, ardından sorumlu personel ve VKN/TCKN çakışması. Hata yanıtı ya da normalize girdi döner.
 */
function validateMukellef(body: unknown, currentId?: string): Response | Girdi {
  const parsed = mukellefGirdiSemasi.safeParse(body)
  if (!parsed.success)
    return errorResponse(
      400,
      parsed.error.issues[0]?.message ?? "Geçersiz istek"
    )
  const input = mukellefNormalize(parsed.data)
  if (!db.personel.find(input.sorumluPersonelId)) {
    return errorResponse(400, "Sorumlu personel bulunamadı")
  }
  const kimlikHatasi = mukellefKimlikHatasi(input)
  if (kimlikHatasi) return errorResponse(400, kimlikHatasi)

  const duplicate = db.mukellef.where(
    (m) =>
      m.id !== currentId &&
      (input.tur === "SAHIS" ? m.tckn === input.tckn : m.vkn === input.vkn)
  )[0]
  if (duplicate) {
    return errorResponse(409, kimlikCakismaMesaji(input.tur, duplicate.unvan))
  }
  return input
}

/** Sorumlu değişince yeni sorumluya giden bildirim */
const SORUMLU_BILDIRIMI = {
  baslik: "Bir mükellefin sorumlusu oldunuz",
} as const

export const mukellefHandlers = [
  http.get(api("/mukellefler"), ({ request }) => {
    const params = new URL(request.url).searchParams
    const q = params.get("q")?.trim() ?? ""
    const turler = params
      .getAll("tur")
      .filter((t): t is MukellefTur => TURLER.includes(t as MukellefTur))
    const sorumlu = params.get("sorumlu")
    const durumParam = params.get("durum") as MukellefDurumFiltre | null
    const durum =
      durumParam && DURUMLAR.includes(durumParam) ? durumParam : "tumu"
    const sirala =
      params.get("sirala") === "olusturmaTarihi" ? "olusturmaTarihi" : "unvan"
    const yon = params.get("yon") === "desc" ? -1 : 1

    const matchesQuery = (m: Mukellef) =>
      !q ||
      turkishIncludes(m.unvan, q) ||
      Boolean(m.vkn?.includes(q)) ||
      Boolean(m.tckn?.includes(q))

    const filtered = db.mukellef
      .where(
        (m) =>
          matchesQuery(m) &&
          (turler.length === 0 || turler.includes(m.tur)) &&
          (!sorumlu || m.sorumluPersonelId === sorumlu) &&
          (durum === "tumu" || m.aktif === (durum === "aktif"))
      )
      .sort((a, b) =>
        sirala === "unvan"
          ? yon * a.unvan.localeCompare(b.unvan, "tr-TR")
          : yon * a.olusturmaTarihi.localeCompare(b.olusturmaTarihi)
      )

    const sayfaParam = Number(params.get("sayfa"))
    if (!sayfaParam) {
      return HttpResponse.json<MukellefListResponse>({
        items: filtered,
        total: filtered.length,
        sayfa: 1,
        sayfaBoyutu: filtered.length,
      })
    }

    const sayfaBoyutu = Math.min(
      Math.max(Number(params.get("sayfaBoyutu")) || 20, 1),
      100
    )
    const sonSayfa = Math.max(Math.ceil(filtered.length / sayfaBoyutu), 1)
    const sayfa = Math.min(Math.max(sayfaParam, 1), sonSayfa)
    return HttpResponse.json<MukellefListResponse>({
      items: filtered.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtered.length,
      sayfa,
      sayfaBoyutu,
    })
  }),

  http.get<{ id: string }>(api("/mukellefler/:id"), ({ params }) => {
    const mukellef = db.mukellef.find(params.id)
    return mukellef
      ? HttpResponse.json(mukellef)
      : notFound("Mükellef bulunamadı")
  }),

  http.post<never, MukellefInput>(api("/mukellefler"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor

    const input = validateMukellef(await request.json())
    if (input instanceof Response) return input

    // Demo kasa ilk istekte o anki tüm mükellefler için örnek şifre üretir; kasa henüz
    // oluşmadıysa yeni mükellef de sahte şifre almasın diye önce kasayı hazırla.
    await ensureVault()

    const created = db.mukellef.insert({
      ...input,
      olusturmaTarihi: new Date().toISOString(),
    })
    logActivity({
      aktorId: actor.id,
      eylem: "MUKELLEF_OLUSTURULDU",
      hedefTip: "MUKELLEF",
      hedefId: created.id,
      mukellefId: created.id,
      aciklama: created.unvan,
    })
    return HttpResponse.json(created, { status: 201 })
  }),

  /** Hızlı başlangıç: Excel'den mükellefler. Kayıtlı VKN/TCKN atlanır, geçersiz satır raporlanır. */
  http.post<never, MukellefTopluRequest>(
    api("/mukellefler/toplu"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { kayitlar } = await request.json()
      if (!Array.isArray(kayitlar) || kayitlar.length === 0)
        return errorResponse(400, "Aktarılacak kayıt yok")
      await ensureVault()

      const sonuc: TopluAktarimSonucu = {
        olusturulan: 0,
        guncellenen: 0,
        atlanan: 0,
        hatalar: [],
      }
      for (const { satir, mukellef } of kayitlar) {
        const input = validateMukellef(mukellef)
        if (input instanceof Response) {
          if (input.status === 409) sonuc.atlanan++
          else
            sonuc.hatalar.push({
              satir,
              mesaj: ((await input.json()) as { message: string }).message,
            })
          continue
        }
        const created = db.mukellef.insert({
          ...input,
          olusturmaTarihi: new Date().toISOString(),
        })
        logActivity(
          {
            aktorId: actor.id,
            eylem: "MUKELLEF_OLUSTURULDU",
            hedefTip: "MUKELLEF",
            hedefId: created.id,
            mukellefId: created.id,
            aciklama: `${created.unvan} (içe aktarım)`,
          },
          false
        )
        sonuc.olusturulan++
      }
      return HttpResponse.json(sonuc)
    }
  ),

  http.post<never, TopluAtamaRequest>(
    api("/mukellefler/toplu-atama"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor

      const { ids, sorumluPersonelId } = await request.json()
      const personel = db.personel.find(sorumluPersonelId)
      if (!personel) return errorResponse(400, "Sorumlu personel bulunamadı")
      if (!Array.isArray(ids) || ids.length === 0) {
        return errorResponse(400, "En az bir mükellef seçiniz")
      }

      let guncellenen = 0
      for (const id of ids) {
        if (!db.mukellef.update(id, { sorumluPersonelId })) continue
        guncellenen++
        logActivity(
          {
            aktorId: actor.id,
            eylem: "MUKELLEF_GUNCELLENDI",
            hedefTip: "MUKELLEF",
            hedefId: id,
            mukellefId: id,
            aciklama: `Sorumlu: ${personel.ad} ${personel.soyad}`,
          },
          SORUMLU_BILDIRIMI
        )
      }
      return HttpResponse.json({ guncellenen })
    }
  ),

  http.put<{ id: string }, MukellefInput>(
    api("/mukellefler/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const onceki = db.mukellef.find(params.id)
      if (!onceki) return notFound("Mükellef bulunamadı")

      const input = validateMukellef(await request.json(), params.id)
      if (input instanceof Response) return input

      const updated = db.mukellef.update(params.id, input)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "MUKELLEF_GUNCELLENDI",
          hedefTip: "MUKELLEF",
          hedefId: params.id,
          mukellefId: params.id,
        },
        onceki.sorumluPersonelId !== input.sorumluPersonelId
          ? SORUMLU_BILDIRIMI
          : {}
      )
      return HttpResponse.json(updated)
    }
  ),
]
