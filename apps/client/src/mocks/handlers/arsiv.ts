import { HttpResponse, http } from "msw"

import {
  GECERLILIK_GEREKEN,
  KATEGORI_SIRASI,
  MAKS_DOSYA_BOYUTU,
  agacOlustur,
  dosyaMimeTuru,
  eksikZorunlu,
  gecerlilikDurumu,
  kalanGun,
} from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_BELGE_SIRASI,
  BORDRO_DONEM_RE,
  DONEMLI_KATEGORILER,
} from "@prime/shared/bordro/kurallar"
import { BORDRO_BELGE_ETIKET } from "@prime/shared/bordro/sabitler"
import { formatDonem } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { delBlob, getBlob, putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  logDosyaErisimi,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { placeholderIcerik } from "@prime/mock-data/placeholder"
import type {
  ArsivDosyaView,
  ArsivListResponse,
  ArsivGecerlilikKaydi,
  ArsivGuncelleRequest,
  ArsivOzetResponse,
  ArsivSiralama,
  ArsivYukleRequest,
} from "@prime/shared/types/api"
import {
  ARSIV_KATEGORI_ETIKET,
  type ArsivDosya,
  type ArsivKategori,
  type BordroBelgeTur,
} from "@prime/shared/types/domain"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Arşiv kaydının dönem / bordro belge alanlarını doğrular */
function donemAlanlariHatasi(
  donem: unknown,
  bordroBelge: unknown
): string | undefined {
  if (
    donem !== undefined &&
    (typeof donem !== "string" || !BORDRO_DONEM_RE.test(donem))
  )
    return "Geçersiz dönem"
  if (
    bordroBelge !== undefined &&
    !BORDRO_BELGE_SIRASI.includes(bordroBelge as BordroBelgeTur)
  )
    return "Geçersiz belge türü"
}
const SIRALAMALAR: ArsivSiralama[] = [
  "ad",
  "yuklemeTarihi",
  "boyut",
  "gecerlilikTarihi",
]

function gecerliKategori(value: unknown): value is ArsivKategori {
  return KATEGORI_SIRASI.includes(value as ArsivKategori)
}

function toView(d: ArsivDosya): ArsivDosyaView {
  const p = db.personel.find(d.yukleyenId)
  return {
    ...d,
    mukellefUnvan: db.mukellef.find(d.mukellefId)?.unvan ?? "",
    yukleyen: p ? { id: p.id, ad: p.ad, soyad: p.soyad, renk: p.renk } : null,
  }
}

/** Sorumlu filtresine uyan aktif mükellefler */
function mukellefler(sorumlu: string | null) {
  return db.mukellef.where(
    (m) => m.aktif && (!sorumlu || m.sorumluPersonelId === sorumlu)
  )
}

function siralaFn(sirala: ArsivSiralama, yon: "asc" | "desc") {
  const carpan = yon === "desc" ? -1 : 1
  return (a: ArsivDosya, b: ArsivDosya) => {
    let fark: number
    switch (sirala) {
      case "boyut":
        fark = a.boyut - b.boyut
        break
      case "yuklemeTarihi":
        fark = a.yuklemeTarihi.localeCompare(b.yuklemeTarihi)
        break
      case "gecerlilikTarihi":
        // Tarihsizler her zaman sona
        if (!a.gecerlilikTarihi || !b.gecerlilikTarihi)
          return a.gecerlilikTarihi ? -1 : b.gecerlilikTarihi ? 1 : 0
        fark = a.gecerlilikTarihi.localeCompare(b.gecerlilikTarihi)
        break
      default:
        fark = a.ad.localeCompare(b.ad, "tr-TR")
    }
    return fark * carpan || a.id.localeCompare(b.id)
  }
}

export const arsivHandlers = [
  http.get(api("/arsiv/agac"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const liste = mukellefler(sorumlu)
    const ids = new Set(liste.map((m) => m.id))
    const dosyalar = db.arsiv.where((d) => ids.has(d.mukellefId))
    return HttpResponse.json({
      mukellefler: agacOlustur(liste, dosyalar),
      copSayisi: dosyalar.filter((d) => d.silindi).length,
    })
  }),

  http.get(api("/arsiv/ozet"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const bugunYmd = bugun()
    const liste = mukellefler(sorumlu)
    const ids = new Set(liste.map((m) => m.id))
    const dosyalar = db.arsiv.where((d) => ids.has(d.mukellefId))

    const gecerlilik: ArsivGecerlilikKaydi[] = []
    for (const d of dosyalar) {
      if (d.silindi || !d.gecerlilikTarihi) continue
      const durum = gecerlilikDurumu(d.gecerlilikTarihi, bugunYmd)
      if (durum === "GECERLI") continue
      gecerlilik.push({
        ...toView(d),
        gecerlilik: durum,
        kalanGun: kalanGun(d.gecerlilikTarihi, bugunYmd),
      })
    }
    gecerlilik.sort((a, b) => a.kalanGun - b.kalanGun)

    const eksikZorunluListe = liste
      .map((m) => ({
        mukellefId: m.id,
        unvan: m.unvan,
        eksik: eksikZorunlu(m, dosyalar),
      }))
      .filter((x) => x.eksik.length > 0)
      .sort(
        (a, b) =>
          b.eksik.length - a.eksik.length ||
          a.unvan.localeCompare(b.unvan, "tr-TR")
      )

    return HttpResponse.json<ArsivOzetResponse>({
      gecerlilik,
      eksikZorunlu: eksikZorunluListe,
    })
  }),

  http.get(api("/arsiv"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const mukellefId = p.get("mukellefId")
    const kategori = p.get("kategori")
    const q = p.get("q")?.trim()
    const cop = p.get("cop") === "true"
    const sorumlu = p.get("sorumlu")
    const gecerlilik = p.get("gecerlilik")
    const donem = p.get("donem")
    const bugunYmd = bugun()
    const siralaParam = p.get("sirala") as ArsivSiralama | null
    const sirala =
      siralaParam && SIRALAMALAR.includes(siralaParam) ? siralaParam : "ad"
    const yon = p.get("yon") === "desc" ? "desc" : "asc"

    // Tek mükellef istenirse (mükellef kartı) pasif mükellefin arşivi de görünür
    const ids = mukellefId
      ? new Set([mukellefId])
      : new Set(mukellefler(sorumlu).map((m) => m.id))
    const items = db.arsiv
      .where(
        (d) =>
          d.silindi === cop &&
          ids.has(d.mukellefId) &&
          (!kategori || d.kategori === kategori) &&
          (!donem || d.donem === donem) &&
          (!gecerlilik ||
            (d.gecerlilikTarihi !== undefined &&
              gecerlilikDurumu(d.gecerlilikTarihi, bugunYmd) === gecerlilik))
      )
      .map(toView)
      .filter(
        (d) =>
          !q ||
          turkishIncludes(d.ad, q) ||
          turkishIncludes(d.mukellefUnvan, q) ||
          turkishIncludes(ARSIV_KATEGORI_ETIKET[d.kategori], q)
      )
      .sort(siralaFn(sirala, yon))

    const sayfa = Number(p.get("sayfa"))
    if (!Number.isInteger(sayfa) || sayfa < 1)
      return HttpResponse.json<ArsivListResponse>({
        items,
        total: items.length,
        sayfa: 1,
        sayfaBoyutu: items.length,
      })
    const sayfaBoyutu = Math.min(Number(p.get("sayfaBoyutu")) || 24, 100)
    // Son sayfadan sonrası istenirse (silme sonrası) son sayfaya dönülür
    const sonSayfa = Math.max(Math.ceil(items.length / sayfaBoyutu), 1)
    const gecerliSayfa = Math.min(sayfa, sonSayfa)
    return HttpResponse.json<ArsivListResponse>({
      items: items.slice(
        (gecerliSayfa - 1) * sayfaBoyutu,
        gecerliSayfa * sayfaBoyutu
      ),
      total: items.length,
      sayfa: gecerliSayfa,
      sayfaBoyutu,
    })
  }),

  http.get<{ id: string }>(
    api("/arsiv/:id/icerik"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const dosya = db.arsiv.find(params.id)
      if (!dosya) return notFound("Dosya bulunamadı")
      logDosyaErisimi(request, actor, {
        hedefTip: "ARSIV",
        hedefId: dosya.id,
        mukellefId: dosya.mukellefId,
        ad: dosya.ad,
      })
      const dataUrl = (await getBlob(dosya.id)) ?? placeholderIcerik(dosya)
      return HttpResponse.json({ dataUrl })
    }
  ),

  http.post<never, ArsivYukleRequest>(api("/arsiv"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor

    const body = await request.json()
    const mukellef = db.mukellef.find(body.mukellefId)
    if (!mukellef) return notFound("Mükellef bulunamadı")
    if (!gecerliKategori(body.kategori))
      return errorResponse(400, "Geçersiz kategori")
    const ad = body.ad?.trim()
    if (!ad) return errorResponse(400, "Dosya adı zorunludur")
    const mimeType = dosyaMimeTuru({ name: ad, type: body.mimeType })
    if (!mimeType)
      return errorResponse(
        400,
        "Desteklenmeyen dosya türü. PDF, JPG, PNG veya HEIC yükleyin."
      )
    if (typeof body.dataUrl !== "string" || !body.dataUrl.startsWith("data:"))
      return errorResponse(400, "Dosya içeriği okunamadı")
    // base64 → byte (yaklaşık); istemcinin bildirdiği boyuta güvenilmez
    const base64 = body.dataUrl.slice(body.dataUrl.indexOf(",") + 1)
    const boyut = Math.floor((base64.length * 3) / 4)
    if (boyut > MAKS_DOSYA_BOYUTU || body.boyut > MAKS_DOSYA_BOYUTU)
      return errorResponse(400, "Dosya 10 MB sınırını aşıyor.")
    if (body.gecerlilikTarihi && !YMD_RE.test(body.gecerlilikTarihi))
      return errorResponse(400, "Geçersiz geçerlilik tarihi")
    const donemHata = donemAlanlariHatasi(body.donem, body.bordroBelge)
    if (donemHata) return errorResponse(400, donemHata)
    const donemli = DONEMLI_KATEGORILER.includes(body.kategori)

    const dosya = db.arsiv.insert({
      mukellefId: mukellef.id,
      kategori: body.kategori,
      ad,
      mimeType,
      boyut: body.boyut || boyut,
      yukleyenId: actor.id,
      yuklemeTarihi: new Date().toISOString(),
      gecerlilikTarihi: GECERLILIK_GEREKEN.includes(body.kategori)
        ? body.gecerlilikTarihi || undefined
        : undefined,
      ...(donemli &&
        body.donem && {
          donem: body.donem,
          bordroBelge: body.bordroBelge,
        }),
      silindi: false,
    })
    await putBlob(dosya.id, body.dataUrl)

    logActivity({
      aktorId: actor.id,
      eylem: "ARSIV_YUKLENDI",
      hedefTip: "ARSIV",
      hedefId: dosya.id,
      mukellefId: mukellef.id,
      aciklama: `${dosya.ad} (${ARSIV_KATEGORI_ETIKET[dosya.kategori]})`,
    })
    return HttpResponse.json(toView(dosya), { status: 201 })
  }),

  http.patch<{ id: string }, ArsivGuncelleRequest>(
    api("/arsiv/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const dosya = db.arsiv.find(params.id)
      if (!dosya) return notFound("Dosya bulunamadı")

      const body = await request.json()
      const patch: Partial<ArsivDosya> = {}
      const degisiklikler: string[] = []

      if (body.ad !== undefined) {
        const ad = body.ad.trim()
        if (!ad) return errorResponse(400, "Dosya adı zorunludur")
        if (ad !== dosya.ad) {
          patch.ad = ad
          degisiklikler.push(`adı "${ad}" olarak değiştirildi`)
        }
      }
      if (body.kategori !== undefined) {
        if (!gecerliKategori(body.kategori))
          return errorResponse(400, "Geçersiz kategori")
        if (body.kategori !== dosya.kategori) {
          patch.kategori = body.kategori
          degisiklikler.push(
            `${ARSIV_KATEGORI_ETIKET[body.kategori]} kategorisine taşındı`
          )
        }
      }
      const kategori = patch.kategori ?? dosya.kategori
      if (body.gecerlilikTarihi !== undefined) {
        if (
          body.gecerlilikTarihi !== null &&
          !YMD_RE.test(body.gecerlilikTarihi)
        )
          return errorResponse(400, "Geçersiz geçerlilik tarihi")
        patch.gecerlilikTarihi = body.gecerlilikTarihi ?? undefined
        degisiklikler.push("geçerlilik tarihi güncellendi")
      }
      if (!GECERLILIK_GEREKEN.includes(kategori))
        patch.gecerlilikTarihi = undefined

      if (body.donem !== undefined || body.bordroBelge !== undefined) {
        const donemHata = donemAlanlariHatasi(
          body.donem ?? undefined,
          body.bordroBelge ?? undefined
        )
        if (donemHata) return errorResponse(400, donemHata)
        if (
          body.donem !== undefined &&
          (body.donem ?? undefined) !== dosya.donem
        ) {
          patch.donem = body.donem ?? undefined
          degisiklikler.push(
            body.donem
              ? `dönemi ${formatDonem(body.donem)}`
              : "dönemi kaldırıldı"
          )
        }
        if (
          body.bordroBelge !== undefined &&
          (body.bordroBelge ?? undefined) !== dosya.bordroBelge
        ) {
          patch.bordroBelge = body.bordroBelge ?? undefined
          degisiklikler.push(
            body.bordroBelge
              ? `belge türü ${BORDRO_BELGE_ETIKET[body.bordroBelge]}`
              : "belge türü kaldırıldı"
          )
        }
      }
      // Dönem yalnızca bordro / SGK belgelerinde anlamlı; başka kategoriye taşınınca silinir
      if (!DONEMLI_KATEGORILER.includes(kategori)) {
        patch.donem = undefined
        patch.bordroBelge = undefined
      }
      // Türsüz dönem olabilir (SGK belgesi), dönemsiz tür olamaz
      if (!("donem" in patch ? patch.donem : dosya.donem))
        patch.bordroBelge = undefined

      const guncel = db.arsiv.update(dosya.id, patch)!
      if (degisiklikler.length) {
        logActivity({
          aktorId: actor.id,
          eylem: "ARSIV_GUNCELLENDI",
          hedefTip: "ARSIV",
          hedefId: dosya.id,
          mukellefId: dosya.mukellefId,
          aciklama: `${dosya.ad}: ${degisiklikler.join(", ")}`,
        })
      }
      return HttpResponse.json(toView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/arsiv/:id/geri-al"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const dosya = db.arsiv.find(params.id)
      if (!dosya) return notFound("Dosya bulunamadı")
      if (!dosya.silindi) return errorResponse(400, "Dosya çöp kutusunda değil")

      const guncel = db.arsiv.update(dosya.id, {
        silindi: false,
        silinmeTarihi: undefined,
      })!
      logActivity({
        aktorId: actor.id,
        eylem: "ARSIV_GERI_ALINDI",
        hedefTip: "ARSIV",
        hedefId: dosya.id,
        mukellefId: dosya.mukellefId,
        aciklama: dosya.ad,
      })
      return HttpResponse.json(toView(guncel))
    }
  ),

  http.delete<{ id: string }>(
    api("/arsiv/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const dosya = db.arsiv.find(params.id)
      if (!dosya) return notFound("Dosya bulunamadı")
      const kalici = new URL(request.url).searchParams.get("kalici") === "true"

      if (kalici) {
        if (!dosya.silindi)
          return errorResponse(
            400,
            "Kalıcı silme yalnızca çöp kutusundaki dosyalar için yapılabilir"
          )
        db.arsiv.remove(dosya.id)
        await delBlob(dosya.id)
      } else {
        if (dosya.silindi)
          return errorResponse(400, "Dosya zaten çöp kutusunda")
        db.arsiv.update(dosya.id, {
          silindi: true,
          silinmeTarihi: new Date().toISOString(),
        })
      }

      logActivity({
        aktorId: actor.id,
        eylem: kalici ? "ARSIV_KALICI_SILINDI" : "ARSIV_SILINDI",
        hedefTip: "ARSIV",
        hedefId: dosya.id,
        mukellefId: dosya.mukellefId,
        aciklama: dosya.ad,
      })
      return HttpResponse.json({ id: dosya.id })
    }
  ),
]
