/**
 * Müşteri portalı (girişsiz). Erişim yalnızca URL'deki token ile yapılır; yanıtlar
 * mükellefin yalnızca ilgili talep bilgisini içerir (VKN, telefon vb. dönmez).
 */
import { HttpResponse, http } from "msw"

import { MAKS_DOSYA_BOYUTU, dosyaMimeTuru } from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_DONEM_RE,
  bordroKayitId,
  bordroUygulanirMi,
} from "@prime/shared/bordro/kurallar"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { talepDurumu } from "@prime/shared/evrak-talebi/durum"
import {
  ISTENEN_EVRAKLAR,
  MUSTERI_AKTOR_ID,
} from "@prime/shared/evrak-talebi/sabitler"
import { delBlob, putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import { bordroKaydiYaz } from "@/mocks/handlers/bordro-islemleri"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
} from "@/mocks/handlers/common"
import type {
  PortalResponse,
  PortalTamamlaRequest,
  PortalYukleRequest,
} from "@prime/shared/types/api"
import type { EvrakTalebi } from "@prime/shared/types/domain"

const GECERSIZ = "Bu bağlantı geçersiz"
const MAKS_NOT = 500

function talepBul(token: string) {
  return db.talep.where((t) => t.token === token)[0]
}

function portalYaniti(t: EvrakTalebi): PortalResponse {
  const [buro] = db.buro.all()
  return {
    durum: talepDurumu(t),
    buro: { ad: buro?.ad ?? "", telefon: buro?.telefon ?? "" },
    mukellefUnvan: db.mukellef.find(t.mukellefId)?.unvan ?? "",
    istenenler: t.istenenler,
    donem: t.donem,
    aciklama: t.aciklama,
    sonKullanma: t.sonKullanma,
    degisiklikYokSecilebilir: degisiklikYokSecilebilir(t),
    yuklemeler: db.gelen
      .where((g) => g.talepId === t.id)
      .sort((a, b) => a.yuklemeTarihi.localeCompare(b.yuklemeTarihi))
      .map((g) => ({
        id: g.id,
        istenen: g.istenen,
        ad: g.ad,
        mimeType: g.mimeType,
        boyut: g.boyut,
        durum: g.durum,
        redNedeni: g.redNedeni,
        yuklemeTarihi: g.yuklemeTarihi,
      })),
  }
}

/** Dönemli, puantaj istenen ve mükellefin bordrosu olan talepte "değişiklik yok" seçilebilir */
function degisiklikYokSecilebilir(t: EvrakTalebi) {
  const m = db.mukellef.find(t.mukellefId)
  return (
    t.istenenler.includes("PUANTAJ") &&
    Boolean(t.donem && BORDRO_DONEM_RE.test(t.donem)) &&
    Boolean(m && bordroUygulanirMi(m))
  )
}

/** Aktif değilse uygun hata yanıtı */
function aktifDegilse(t: EvrakTalebi) {
  const durum = talepDurumu(t)
  if (durum === "AKTIF") return null
  const mesaj =
    durum === "SURESI_DOLDU"
      ? "Bu bağlantının süresi dolmuş"
      : durum === "IPTAL"
        ? "Bu talep iptal edilmiş"
        : "Bu talep tamamlanmış"
  return errorResponse(410, mesaj)
}

export const portalHandlers = [
  http.get<{ token: string }>(api("/portal/:token"), ({ params }) => {
    const t = talepBul(params.token)
    if (!t) return notFound(GECERSIZ)
    return HttpResponse.json(portalYaniti(t))
  }),

  http.post<{ token: string }, PortalYukleRequest>(
    api("/portal/:token/yukleme"),
    async ({ request, params }) => {
      const t = talepBul(params.token)
      if (!t) return notFound(GECERSIZ)
      const kapali = aktifDegilse(t)
      if (kapali) return kapali

      const body = await request.json()
      if (!t.istenenler.includes(body.istenen))
        return errorResponse(400, "Bu evrak bu talepte istenmiyor")
      const ad = body.ad?.trim().slice(0, 120)
      if (!ad) return errorResponse(400, "Dosya adı zorunludur")
      const mimeType = dosyaMimeTuru({ name: ad, type: body.mimeType })
      if (!mimeType)
        return errorResponse(
          400,
          "Desteklenmeyen dosya türü. PDF, JPG, PNG veya HEIC yükleyin."
        )
      if (typeof body.dataUrl !== "string" || !body.dataUrl.startsWith("data:"))
        return errorResponse(400, "Dosya içeriği okunamadı")
      const boyut = Math.floor(
        (body.dataUrl.length - body.dataUrl.indexOf(",") - 1) * 0.75
      )
      if (boyut > MAKS_DOSYA_BOYUTU || body.boyut > MAKS_DOSYA_BOYUTU)
        return errorResponse(400, "Dosya 10 MB sınırını aşıyor.")

      const g = db.gelen.insert({
        talepId: t.id,
        mukellefId: t.mukellefId,
        istenen: body.istenen,
        ad,
        mimeType,
        boyut: body.boyut || boyut,
        yuklemeTarihi: new Date().toISOString(),
        durum: "BEKLIYOR",
      })
      await putBlob(g.id, body.dataUrl)
      logActivity({
        aktorId: MUSTERI_AKTOR_ID,
        eylem: "EVRAK_YUKLENDI",
        hedefTip: "EVRAK",
        hedefId: g.id,
        mukellefId: t.mukellefId,
        aciklama: `${ad} (${ISTENEN_EVRAKLAR[g.istenen].ad})`,
      })
      return HttpResponse.json(
        portalYaniti(t).yuklemeler.find((y) => y.id === g.id),
        {
          status: 201,
        }
      )
    }
  ),

  http.delete<{ token: string; id: string }>(
    api("/portal/:token/yukleme/:id"),
    async ({ params }) => {
      const t = talepBul(params.token)
      if (!t) return notFound(GECERSIZ)
      const kapali = aktifDegilse(t)
      if (kapali) return kapali
      const g = db.gelen.find(params.id)
      if (!g || g.talepId !== t.id) return notFound("Dosya bulunamadı")
      if (g.durum !== "BEKLIYOR")
        return errorResponse(409, "İncelenmiş dosyalar silinemez")
      db.gelen.remove(g.id)
      await delBlob(g.id)
      return HttpResponse.json({ id: g.id })
    }
  ),

  http.post<{ token: string }, PortalTamamlaRequest>(
    api("/portal/:token/tamamla"),
    async ({ request, params }) => {
      const t = talepBul(params.token)
      if (!t) return notFound(GECERSIZ)
      const kapali = aktifDegilse(t)
      if (kapali) return kapali
      const bekleyen = db.gelen.count(
        (g) => g.talepId === t.id && g.durum === "BEKLIYOR"
      )
      const body = await request.json()
      const degisiklikYok = body.degisiklikYok === true
      if (degisiklikYok && !degisiklikYokSecilebilir(t))
        return errorResponse(400, "Bu talepte değişiklik yok bildirilemez")
      if (bekleyen === 0 && !degisiklikYok)
        return errorResponse(400, "Göndermeden önce en az bir dosya yükleyin")

      const not = body.not?.trim().slice(0, MAKS_NOT)
      if (degisiklikYok) {
        // Puantaj dosyası yerine "değişiklik yok": bordro dönemi "Girdi geldi" olur. MUHSGK
        // görev maddesi büroda personel tarafından işaretlenir (müşteri personel değildir).
        const kayit = db.bordro.find(bordroKayitId(t.mukellefId, t.donem!))
        bordroKaydiYaz(
          t.mukellefId,
          t.donem!,
          {
            girdiTalepId: t.id,
            degisiklikYok: true,
            ...((!kayit || kayit.durum === "BEKLENIYOR") && {
              durum: "GIRDI_GELDI" as const,
            }),
          },
          { id: MUSTERI_AKTOR_ID },
          "BORDRO_GUNCELLENDI",
          `${donemEtiketi(t.donem!)}: müşteri puantajda değişiklik olmadığını bildirdi`
        )
      }
      const guncel = db.talep.update(t.id, {
        durum: "TAMAMLANDI",
        tamamlanmaTarihi: new Date().toISOString(),
        musteriNotu: not || t.musteriNotu,
      })!
      logActivity({
        aktorId: MUSTERI_AKTOR_ID,
        eylem: "TALEP_TAMAMLANDI",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: t.mukellefId,
        aciklama: degisiklikYok
          ? bekleyen
            ? `${bekleyen} dosya · puantajda değişiklik yok`
            : "Puantajda değişiklik yok"
          : `${bekleyen} dosya`,
      })
      return HttpResponse.json(portalYaniti(guncel))
    }
  ),
]
