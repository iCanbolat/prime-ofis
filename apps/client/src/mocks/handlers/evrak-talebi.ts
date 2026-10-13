import { addDays } from "date-fns"
import { HttpResponse, http } from "msw"

import { GECERLILIK_GEREKEN, KATEGORI_SIRASI } from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_DONEM_RE,
  DONEMLI_KATEGORILER,
  ISTENEN_BORDRO_BELGE,
  bordroUygulanirMi,
} from "@prime/shared/bordro/kurallar"
import { BORDRO_MADDE_GIRDI } from "@prime/shared/bordro/sabitler"
import { talepDurumu } from "@prime/shared/evrak-talebi/durum"
import {
  ISTENEN_EVRAKLAR,
  ISTENEN_SIRASI,
  KANAL_ETIKET,
} from "@prime/shared/evrak-talebi/sabitler"
import { takvimOlayId } from "@prime/shared/takvim/motor"
import { formatDonem } from "@prime/shared/lib/format"
import { generateToken } from "@prime/shared/lib/token"
import { getBlob, putBlob } from "@/mocks/blob-store"
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
import { bordroDurumuIlerlet } from "@/mocks/handlers/bordro-islemleri"
import { okumaKuyrugaAl } from "@/mocks/handlers/fis-aktarimi"
import { gorevMaddesiniTamamla } from "@/mocks/handlers/ortak-islemler"
import { placeholderIcerik } from "@prime/mock-data/placeholder"
import type {
  GelenEvrakView,
  GelenOnaylaRequest,
  GelenReddetRequest,
  TalepDetay,
  TalepGonderimRequest,
  TalepOlusturRequest,
  TalepUzatRequest,
  TalepView,
} from "@prime/shared/types/api"
import type {
  ArsivKategori,
  EvrakTalebi,
  GelenEvrak,
  GelenEvrakDurum,
  Personel,
  TalepDurumu,
  TalepKanal,
} from "@prime/shared/types/domain"

const KANALLAR: TalepKanal[] = ["WHATSAPP", "EPOSTA", "LINK"]
const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const MAKS_GUN = 60

/** Son kullanma: bugünden `gun` gün sonra, gün sonu (yerel 23:59:59) */
export function sonKullanmaHesapla(gun: number, baslangic: Date = new Date()) {
  const tarih = addDays(baslangic, gun)
  tarih.setHours(23, 59, 59, 0)
  return tarih.toISOString()
}

export function talepView(t: EvrakTalebi): TalepView {
  const m = db.mukellef.find(t.mukellefId)
  const p = db.personel.find(t.olusturanId)
  const gelenler = db.gelen.where((g) => g.talepId === t.id)
  return {
    ...t,
    durum: talepDurumu(t),
    mukellefUnvan: m?.unvan ?? "",
    mukellefTelefon: m?.telefon ?? "",
    mukellefEposta: m?.eposta ?? "",
    olusturan: p ? { id: p.id, ad: p.ad, soyad: p.soyad, renk: p.renk } : null,
    yuklemeSayisi: gelenler.length,
    bekleyenSayisi: gelenler.filter((g) => g.durum === "BEKLIYOR").length,
  }
}

function talepAciklama(t: EvrakTalebi) {
  const evraklar = t.istenenler.map((i) => ISTENEN_EVRAKLAR[i].ad).join(", ")
  return t.donem ? `${formatDonem(t.donem)} · ${evraklar}` : evraklar
}

function gelenView(g: GelenEvrak): GelenEvrakView {
  const t = db.talep.find(g.talepId)
  return {
    ...g,
    mukellefUnvan: db.mukellef.find(g.mukellefId)?.unvan ?? "",
    talep: { id: g.talepId, donem: t?.donem, kanal: t?.kanal ?? "LINK" },
  }
}

/**
 * Onaylanan evrak dönemli bir PUANTAJ ise bordro dönemi "Girdi geldi" olur ve MUHSGK
 * görevindeki "Puantaj ve bordro alındı" maddesi işaretlenir.
 */
function puantajGeldiIse(g: GelenEvrak, actor: Personel) {
  if (g.istenen !== "PUANTAJ") return
  const talep = db.talep.find(g.talepId)
  const m = db.mukellef.find(g.mukellefId)
  if (!talep?.donem || !m || !BORDRO_DONEM_RE.test(talep.donem)) return
  if (!bordroUygulanirMi(m)) return
  bordroDurumuIlerlet(m.id, talep.donem, "GIRDI_GELDI", actor, {
    girdiTalepId: talep.id,
  })
  gorevMaddesiniTamamla(
    takvimOlayId(m.id, "MUHTASAR_SGK", talep.donem),
    BORDRO_MADDE_GIRDI,
    actor
  )
}

export const evrakTalebiHandlers = [
  http.get(api("/evrak-talepleri"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const mukellefId = p.get("mukellefId")
    const durum = p.get("durum") as TalepDurumu | null
    const q = p.get("q")?.trim()
    const items = db.talep
      .where((t) => !mukellefId || t.mukellefId === mukellefId)
      .map(talepView)
      .filter(
        (t) =>
          (!durum || t.durum === durum) &&
          (!q ||
            turkishIncludes(t.mukellefUnvan, q) ||
            t.istenenler.some((i) =>
              turkishIncludes(ISTENEN_EVRAKLAR[i].ad, q)
            ))
      )
      .sort((a, b) => b.olusturmaTarihi.localeCompare(a.olusturmaTarihi))
    return HttpResponse.json(items)
  }),

  http.get<{ id: string }>(api("/evrak-talepleri/:id"), ({ params }) => {
    const t = db.talep.find(params.id)
    if (!t) return notFound("Talep bulunamadı")
    const gelenler = db.gelen
      .where((g) => g.talepId === t.id)
      .sort((a, b) => b.yuklemeTarihi.localeCompare(a.yuklemeTarihi))
    return HttpResponse.json<TalepDetay>({ ...talepView(t), gelenler })
  }),

  http.post<never, TalepOlusturRequest>(
    api("/evrak-talepleri"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()

      const mukellef = db.mukellef.find(body.mukellefId)
      if (!mukellef) return notFound("Mükellef bulunamadı")
      const istenenler = [...new Set(body.istenenler)].filter((i) =>
        ISTENEN_SIRASI.includes(i)
      )
      if (istenenler.length === 0)
        return errorResponse(400, "En az bir evrak seçin")
      if (!KANALLAR.includes(body.kanal))
        return errorResponse(400, "Geçersiz kanal")
      if (body.donem && !DONEM_RE.test(body.donem))
        return errorResponse(400, "Geçersiz dönem")
      const gun = Number(body.gecerlilikGun)
      if (!Number.isInteger(gun) || gun < 1 || gun > MAKS_GUN)
        return errorResponse(400, `Geçerlilik 1-${MAKS_GUN} gün olmalı`)

      const t = db.talep.insert({
        mukellefId: mukellef.id,
        token: generateToken(),
        kanal: body.kanal,
        istenenler: ISTENEN_SIRASI.filter((i) => istenenler.includes(i)),
        donem: body.donem || undefined,
        aciklama: body.aciklama?.trim() || undefined,
        durum: "AKTIF",
        sonKullanma: sonKullanmaHesapla(gun),
        olusturanId: actor.id,
        olusturmaTarihi: new Date().toISOString(),
        gonderimler: [],
      })
      logActivity({
        aktorId: actor.id,
        eylem: "TALEP_OLUSTURULDU",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: mukellef.id,
        aciklama: talepAciklama(t),
      })
      return HttpResponse.json(talepView(t), { status: 201 })
    }
  ),

  http.post<{ id: string }, TalepGonderimRequest>(
    api("/evrak-talepleri/:id/gonderim"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.talep.find(params.id)
      if (!t) return notFound("Talep bulunamadı")
      if (talepDurumu(t) !== "AKTIF")
        return errorResponse(409, "Yalnızca aktif talepler gönderilebilir")
      const { kanal } = await request.json()
      if (!KANALLAR.includes(kanal)) return errorResponse(400, "Geçersiz kanal")

      const guncel = db.talep.update(t.id, {
        kanal,
        gonderimler: [
          ...t.gonderimler,
          { kanal, zaman: new Date().toISOString(), gonderenId: actor.id },
        ],
      })!
      logActivity({
        aktorId: actor.id,
        eylem: "TALEP_GONDERILDI",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: t.mukellefId,
        aciklama: KANAL_ETIKET[kanal],
      })
      return HttpResponse.json(talepView(guncel))
    }
  ),

  http.post<{ id: string }, TalepUzatRequest>(
    api("/evrak-talepleri/:id/uzat"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.talep.find(params.id)
      if (!t) return notFound("Talep bulunamadı")
      if (t.durum !== "AKTIF")
        return errorResponse(
          409,
          "Yalnızca aktif veya süresi dolmuş talepler uzatılabilir"
        )
      const gun = Number((await request.json()).gun)
      if (!Number.isInteger(gun) || gun < 1 || gun > MAKS_GUN)
        return errorResponse(400, `1-${MAKS_GUN} gün arasında bir süre seçin`)

      // Süresi dolmuşsa bugünden, dolmamışsa mevcut son günden itibaren uzatılır
      const simdi = new Date()
      const mevcut = new Date(t.sonKullanma)
      const guncel = db.talep.update(t.id, {
        sonKullanma: sonKullanmaHesapla(gun, mevcut > simdi ? mevcut : simdi),
      })!
      logActivity({
        aktorId: actor.id,
        eylem: "TALEP_UZATILDI",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: t.mukellefId,
        aciklama: `${gun} gün`,
      })
      return HttpResponse.json(talepView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/evrak-talepleri/:id/iptal"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.talep.find(params.id)
      if (!t) return notFound("Talep bulunamadı")
      if (t.durum === "IPTAL")
        return errorResponse(409, "Talep zaten iptal edilmiş")
      const guncel = db.talep.update(t.id, { durum: "IPTAL" })!
      logActivity({
        aktorId: actor.id,
        eylem: "TALEP_IPTAL_EDILDI",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: t.mukellefId,
        aciklama: talepAciklama(t),
      })
      return HttpResponse.json(talepView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/evrak-talepleri/:id/yeniden-ac"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.talep.find(params.id)
      if (!t) return notFound("Talep bulunamadı")
      if (t.durum !== "TAMAMLANDI")
        return errorResponse(
          409,
          "Yalnızca tamamlanmış talepler yeniden açılabilir"
        )
      const guncel = db.talep.update(t.id, yenidenAcPatch(t))!
      logActivity({
        aktorId: actor.id,
        eylem: "TALEP_YENIDEN_ACILDI",
        hedefTip: "EVRAK",
        hedefId: t.id,
        mukellefId: t.mukellefId,
      })
      return HttpResponse.json(talepView(guncel))
    }
  ),

  // ——— Gelen evraklar ———

  http.get(api("/gelen-evrak/sayac"), () =>
    HttpResponse.json({
      bekleyen: db.gelen.count(
        (g) =>
          g.durum === "BEKLIYOR" && db.talep.find(g.talepId)?.durum !== "IPTAL"
      ),
    })
  ),

  http.get(api("/gelen-evrak"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const durum = p.get("durum") as GelenEvrakDurum | null
    const mukellefId = p.get("mukellefId")
    const talepId = p.get("talepId")
    const items = db.gelen
      .where(
        (g) =>
          (!durum || g.durum === durum) &&
          (!mukellefId || g.mukellefId === mukellefId) &&
          (!talepId || g.talepId === talepId) &&
          db.talep.find(g.talepId)?.durum !== "IPTAL"
      )
      .sort((a, b) => b.yuklemeTarihi.localeCompare(a.yuklemeTarihi))
      .map(gelenView)
    return HttpResponse.json(items)
  }),

  http.get<{ id: string }>(
    api("/gelen-evrak/:id/icerik"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gelen.find(params.id)
      if (!g) return notFound("Dosya bulunamadı")
      logDosyaErisimi(request, actor, {
        hedefTip: "EVRAK",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        ad: g.ad,
      })
      return HttpResponse.json({
        dataUrl: (await getBlob(g.id)) ?? placeholderIcerik(g),
      })
    }
  ),

  http.post<{ id: string }, GelenOnaylaRequest>(
    api("/gelen-evrak/:id/onayla"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gelen.find(params.id)
      if (!g) return notFound("Dosya bulunamadı")
      if (g.durum !== "BEKLIYOR")
        return errorResponse(409, "Bu dosya zaten incelenmiş")
      const body = await request.json()
      if (!KATEGORI_SIRASI.includes(body.kategori as ArsivKategori))
        return errorResponse(400, "Geçersiz kategori")
      const ad = body.ad?.trim()
      if (!ad) return errorResponse(400, "Dosya adı zorunludur")
      if (body.gecerlilikTarihi && !YMD_RE.test(body.gecerlilikTarihi))
        return errorResponse(400, "Geçersiz geçerlilik tarihi")

      const simdi = new Date().toISOString()
      // Dönemli talepten gelen bordro evrakı (puantaj, imzalı bordro, dekont) arşivde döneme
      // bağlanır; bordro sayfası onu bu alanlarla bulur.
      const talep = db.talep.find(g.talepId)
      const donemli =
        DONEMLI_KATEGORILER.includes(body.kategori) &&
        Boolean(talep?.donem && BORDRO_DONEM_RE.test(talep.donem))
      const dosya = db.arsiv.insert({
        mukellefId: g.mukellefId,
        kategori: body.kategori,
        ad,
        mimeType: g.mimeType,
        boyut: g.boyut,
        yukleyenId: actor.id,
        yuklemeTarihi: simdi,
        gecerlilikTarihi: GECERLILIK_GEREKEN.includes(body.kategori)
          ? body.gecerlilikTarihi || undefined
          : undefined,
        ...(donemli && {
          donem: talep!.donem,
          bordroBelge: ISTENEN_BORDRO_BELGE[g.istenen],
        }),
        silindi: false,
      })
      await putBlob(dosya.id, (await getBlob(g.id)) ?? placeholderIcerik(g))
      let guncel = db.gelen.update(g.id, {
        durum: "ONAYLANDI",
        arsivDosyaId: dosya.id,
        inceleyenId: actor.id,
        incelemeTarihi: simdi,
        redNedeni: undefined,
      })!
      // Fiş / ekstre ise okunup muhasebe fişi taslağına dönüşür (Fiş aktarımı)
      const okuma = okumaKuyrugaAl(guncel)
      if (okuma) guncel = db.gelen.update(g.id, { okumaId: okuma.id })!
      puantajGeldiIse(guncel, actor)
      logActivity({
        aktorId: actor.id,
        eylem: "EVRAK_ONAYLANDI",
        hedefTip: "EVRAK",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: `${ad} → arşiv`,
      })
      return HttpResponse.json(gelenView(guncel))
    }
  ),

  http.post<{ id: string }, GelenReddetRequest>(
    api("/gelen-evrak/:id/reddet"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gelen.find(params.id)
      if (!g) return notFound("Dosya bulunamadı")
      if (g.durum !== "BEKLIYOR")
        return errorResponse(409, "Bu dosya zaten incelenmiş")
      const body = await request.json()
      const neden = body.neden?.trim()
      if (!neden) return errorResponse(400, "Red nedeni zorunludur")

      const guncel = db.gelen.update(g.id, {
        durum: "REDDEDILDI",
        redNedeni: neden,
        inceleyenId: actor.id,
        incelemeTarihi: new Date().toISOString(),
      })!
      const t = db.talep.find(g.talepId)
      if (body.yenidenAc && t && t.durum !== "IPTAL") {
        db.talep.update(t.id, yenidenAcPatch(t))
      }
      logActivity({
        aktorId: actor.id,
        eylem: "EVRAK_REDDEDILDI",
        hedefTip: "EVRAK",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: `${g.ad}: ${neden}`,
      })
      return HttpResponse.json(gelenView(guncel))
    }
  ),
]

/** Talebi müşterinin tekrar yükleyebileceği hale getirir: aktif + en az 7 gün süre. */
function yenidenAcPatch(t: EvrakTalebi): Partial<EvrakTalebi> {
  const enAz = sonKullanmaHesapla(7)
  return {
    durum: "AKTIF",
    tamamlanmaTarihi: undefined,
    sonKullanma: t.sonKullanma > enAz ? t.sonKullanma : enAz,
  }
}
