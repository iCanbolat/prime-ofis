/**
 * `/api/luca-hesap`, `/api/luca-dogrulama` — büronun Luca portal hesabı (api `LucaOturumService`)
 * ve Luca firmalarından mükellef aktarımı. Portal `@prime/mock-data/luca-portal` ile taklit
 * edilir: kullanıcı adında "dogrulama" geçerse her girişte doğrulama ekranı çıkar, "hatali"
 * içeren kullanıcı adı / şifre reddedilir.
 *
 * Hesap mock DB'de (`lucaHesap`) tutulur; gerçek backend şifreyi SecretBox ile şifreli saklar.
 * Doğrulama ekranının portal oturum kimliği hiçbir yanıtta dönmez.
 */
import { addMinutes } from "date-fns"
import { HttpResponse, http } from "msw"

import {
  lucaAktarimHatasi,
  lucaDogrulamaHatasi,
  lucaHesapHatasi,
} from "@prime/shared/e-belge/girdi"
import { lucaFirmasindanMukellef } from "@prime/shared/e-belge/luca-mukellef"
import { kontorBakiyesi } from "@prime/shared/e-belge/kontor"
import {
  lucaOturumDustuMu,
  type LucaGirisSonucu,
  type LucaPortalOturum,
} from "@prime/shared/e-belge/luca-portal"
import { bugun } from "@prime/shared/lib/tarih"
import type {
  LucaDogrulamaView,
  LucaFirma,
  LucaFirmaAktarimRequest,
  LucaFirmaAktarimSonucu,
  LucaHesapRequest,
  LucaHesapView,
} from "@prime/shared/types/api"
import type { LucaHesapKaydi } from "@prime/shared/types/domain"
import { mockLucaPortal } from "@prime/mock-data/luca-portal"
import { db } from "@/mocks/db"
import { validateMukellef } from "@/mocks/handlers/mukellef"
import { ensureVault } from "@/mocks/vault"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"

const HESAP_YOK = "Luca hesabı tanımlı değil (Ayarlar → Luca hesabı)"
const DOGRULAMA_DAKIKA = 5
const LUCA_YONETICI = "Luca hesabını yalnızca yönetici yönetebilir"

type MockLucaHesap = LucaHesapKaydi
const HESAP_ID = "buro"

export const lucaPortal = mockLucaPortal({
  mukellefler: async () => db.mukellef.where((m) => m.aktif),
  firmaMukellefi: async (firmaId) =>
    db.baglanti.where((b) => b.lucaFirmaId === firmaId)[0]?.mukellefId,
  faturalar: async (mukellefId) =>
    db.ebelge.where((e) => e.mukellefId === mukellefId),
  fatura: async (ettn) => db.ebelge.where((e) => e.ettn === ettn)[0],
  beratlar: async (mukellefId) =>
    db.berat.where((b) => b.mukellefId === mukellefId),
  kontorKalan: async () =>
    kontorBakiyesi(db.kontor.all(), db.ebelge.all(), bugun()).kalan,
  simdi: () => new Date(),
})

let oturum: LucaPortalOturum | null = null

function oku(): MockLucaHesap | null {
  return db.lucaHesap.find(HESAP_ID) ?? null
}

function yaz(h: MockLucaHesap | null) {
  const mevcut = oku()
  if (!h) {
    if (mevcut) db.lucaHesap.remove(HESAP_ID)
  } else if (mevcut) db.lucaHesap.update(HESAP_ID, h)
  else db.lucaHesap.insert(h)
}

function hesapView(h: MockLucaHesap): LucaHesapView {
  const {
    id: _id,
    sifre: _s,
    dogrulamaOturumId: _o,
    dogrulamaGorsel: _g,
    dogrulamaSonGecerlilik: _d,
    ...v
  } = h
  return v
}

/** Giriş sonucunu hesaba işler (backend `girisAlanlari`) */
function girisIsle(h: MockLucaHesap, sonuc: LucaGirisSonucu): MockLucaHesap {
  const temiz = {
    ...h,
    dogrulamaOturumId: undefined,
    dogrulamaGorsel: undefined,
    dogrulamaSonGecerlilik: undefined,
  }
  switch (sonuc.durum) {
    case "TAMAM":
      oturum = sonuc.oturum
      return {
        ...temiz,
        durum: "BAGLI",
        hataMesaji: undefined,
        sonGiris: new Date().toISOString(),
      }
    case "HATA":
      oturum = null
      return { ...temiz, durum: "HATA", hataMesaji: sonuc.hataMesaji }
    case "DOGRULAMA":
      oturum = null
      return {
        ...temiz,
        durum: "DOGRULAMA",
        hataMesaji: undefined,
        dogrulamaOturumId: sonuc.oturumId,
        dogrulamaGorsel: sonuc.gorselDataUrl,
        dogrulamaSonGecerlilik: addMinutes(
          new Date(),
          DOGRULAMA_DAKIKA
        ).toISOString(),
      }
  }
}

export const dogrulamaGerekli = () =>
  HttpResponse.json(
    { message: "Luca doğrulama kodu bekleniyor", dogrulama: true },
    { status: 409 }
  )

/** Portal çağrısı sırasında istemciye dönecek hata (backend'deki HttpException karşılığı) */
export class LucaYaniti extends Error {
  readonly yanit: Response
  constructor(yanit: Response) {
    super("Luca yanıtı")
    this.yanit = yanit
  }
}

async function oturumAl(): Promise<LucaPortalOturum> {
  const h = oku()
  if (h?.durum !== "BAGLI") oturum = null
  if (oturum) return oturum
  if (!h) throw new LucaYaniti(errorResponse(409, HESAP_YOK))
  if (h.durum === "HATA")
    throw new LucaYaniti(
      errorResponse(
        409,
        `${h.hataMesaji ?? "Luca girişi başarısız"}. Şifreyi Ayarlar → Luca hesabı'ndan güncelleyin`
      )
    )
  if (
    h.durum === "DOGRULAMA" &&
    h.dogrulamaSonGecerlilik &&
    h.dogrulamaSonGecerlilik >= new Date().toISOString()
  )
    throw new LucaYaniti(dogrulamaGerekli())
  const sonuc = await lucaPortal.giris({
    kullanici: h.kullanici,
    sifre: h.sifre,
  })
  yaz(girisIsle(h, sonuc))
  if (sonuc.durum === "DOGRULAMA") throw new LucaYaniti(dogrulamaGerekli())
  if (sonuc.durum === "HATA")
    throw new LucaYaniti(errorResponse(409, sonuc.hataMesaji))
  return oturum!
}

/** Açık oturumla portal çağrısı; oturum düşmüşse bir kez yeniden giriş */
export async function lucaCalistir<T>(
  is: (o: LucaPortalOturum) => Promise<T>
): Promise<T> {
  for (let deneme = 0; ; deneme++) {
    const o = await oturumAl()
    try {
      return await is(o)
    } catch (e) {
      if (!lucaOturumDustuMu(e) || deneme > 0) throw e
      oturum = null
    }
  }
}

/** Firma listesi (backend `LucaOturumService.firmalar`): eşli / VKN'si kayıtlı mükellef işaretli */
async function firmaListesi(): Promise<LucaFirma[]> {
  const firmalar = await lucaCalistir((o) => lucaPortal.firmalar(o))
  const esleme = new Map(
    db.baglanti
      .where((b) => Boolean(b.lucaFirmaId))
      .map((b) => [b.lucaFirmaId!, b.mukellefId])
  )
  const kimlikler = new Map(
    db.mukellef
      .all()
      .flatMap((m) =>
        [m.vkn, m.tckn].filter(Boolean).map((k) => [k!, m.id] as const)
      )
  )
  return firmalar
    .map((f): LucaFirma => {
      const mukellefId = esleme.get(f.firmaId)
      const eslesen =
        !mukellefId && f.vknTckn ? kimlikler.get(f.vknTckn) : undefined
      return {
        firmaId: f.firmaId,
        unvan: f.unvan,
        ...(f.vknTckn ? { vknTckn: f.vknTckn } : {}),
        ...(f.vergiDairesi ? { vergiDairesi: f.vergiDairesi } : {}),
        eFatura: f.eFatura,
        eArsiv: f.eArsiv,
        eDefter: f.eDefter,
        ...(mukellefId ? { mukellefId } : {}),
        ...(eslesen ? { eslesenMukellefId: eslesen } : {}),
      }
    })
    .sort((a, b) => a.unvan.localeCompare(b.unvan, "tr-TR"))
}

export function lucaKontorYaz(kalan: number) {
  const h = oku()
  if (h)
    yaz({ ...h, kontorBakiye: kalan, kontorTarihi: new Date().toISOString() })
}

export function lucaHesabi() {
  const h = oku()
  return h ? hesapView(h) : null
}

/** Portal çağrısında `LucaYaniti` fırlarsa onun yanıtı döner */
export async function yanitla(is: () => Promise<Response>) {
  try {
    return await is()
  } catch (e) {
    if (e instanceof LucaYaniti) return e.yanit
    throw e
  }
}

export const lucaHesapHandlers = [
  http.get(api("/luca-hesap"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const h = oku()
    return h ? HttpResponse.json(hesapView(h)) : notFound(HESAP_YOK)
  }),

  http.put<never, LucaHesapRequest>(api("/luca-hesap"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    if (actor.rol !== "YONETICI") return errorResponse(403, LUCA_YONETICI)
    const mevcut = oku()
    const body = await request.json()
    const hata = lucaHesapHatasi(body, mevcut?.kullanici)
    if (hata) return errorResponse(400, hata)
    const kullanici = body.kullanici.trim()
    const sifre = body.sifre || mevcut!.sifre
    oturum = null
    const sonuc = await lucaPortal.giris({ kullanici, sifre })
    const h = girisIsle(
      {
        id: HESAP_ID,
        kullanici,
        sifre,
        sifreIpucu: sifre.slice(-4),
        durum: "BAGLI",
        kontorBakiye: mevcut?.kontorBakiye,
        kontorTarihi: mevcut?.kontorTarihi,
        guncelleyenId: actor.id,
        guncellemeTarihi: new Date().toISOString(),
      },
      sonuc
    )
    yaz(h)
    logActivity({
      aktorId: actor.id,
      eylem: "LUCA_HESABI_GUNCELLENDI",
      aciklama: kullanici,
    })
    if (sonuc.durum === "HATA") return errorResponse(422, sonuc.hataMesaji)
    if (sonuc.durum === "DOGRULAMA") return dogrulamaGerekli()
    return HttpResponse.json(hesapView(h))
  }),

  http.delete(api("/luca-hesap"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    if (actor.rol !== "YONETICI") return errorResponse(403, LUCA_YONETICI)
    if (!oku()) return notFound(HESAP_YOK)
    yaz(null)
    oturum = null
    logActivity({ aktorId: actor.id, eylem: "LUCA_HESABI_KALDIRILDI" })
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api("/luca-hesap/firmalar"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    return yanitla(async () => HttpResponse.json(await firmaListesi()))
  }),

  http.post<never, LucaFirmaAktarimRequest>(
    api("/luca-hesap/firmalar/aktar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Luca firmalarını yalnızca yönetici aktarabilir"
        )
      const body = await request.json()
      const hata = lucaAktarimHatasi(body)
      if (hata) return errorResponse(400, hata)
      return yanitla(async () => {
        const firmalar = new Map(
          (await lucaCalistir((o) => lucaPortal.firmalar(o))).map((f) => [
            f.firmaId,
            f,
          ])
        )
        // Demo kasa yeni mükellefe sahte şifre üretmesin (POST /mukellefler ile aynı)
        await ensureVault()
        const sonuc: LucaFirmaAktarimSonucu = {
          olusturulan: 0,
          eslenen: 0,
          atlanan: 0,
          hatalar: [],
        }
        for (const firmaId of new Set(body.firmaIdler.map((f) => f.trim()))) {
          const f = firmalar.get(firmaId)
          if (!f) {
            sonuc.hatalar.push({
              firmaId,
              unvan: "—",
              mesaj: "Firma Luca hesabında bulunamadı",
            })
            continue
          }
          if (db.baglanti.count((b) => b.lucaFirmaId === firmaId)) {
            sonuc.atlanan++
            continue
          }
          const kimlik = f.vknTckn?.trim()
          let mukellefId = kimlik
            ? db.mukellef.where((m) => m.vkn === kimlik || m.tckn === kimlik)[0]
                ?.id
            : undefined
          const eslesme = Boolean(mukellefId)
          if (!mukellefId) {
            const input = validateMukellef(
              lucaFirmasindanMukellef(f, body.sorumluPersonelId)
            )
            if (input instanceof Response) {
              sonuc.hatalar.push({
                firmaId,
                unvan: f.unvan,
                mesaj: ((await input.json()) as { message: string }).message,
              })
              continue
            }
            const yeni = db.mukellef.insert({
              ...input,
              olusturmaTarihi: new Date().toISOString(),
            })
            mukellefId = yeni.id
            logActivity(
              {
                aktorId: actor.id,
                eylem: "MUKELLEF_OLUSTURULDU",
                hedefTip: "MUKELLEF",
                hedefId: yeni.id,
                mukellefId: yeni.id,
                aciklama: `${yeni.unvan} (Luca)`,
              },
              false
            )
          }
          const kayit = {
            mukellefId,
            durum: "BAGLI" as const,
            eFatura: f.eFatura,
            eArsiv: f.eArsiv,
            eDefter: f.eDefter,
            postaKutusu: f.postaKutusu,
            lucaFirmaId: firmaId,
            hataMesaji: undefined,
            baglayanId: actor.id,
            baglanmaTarihi: new Date().toISOString(),
          }
          const mevcut = db.baglanti.where(
            (b) => b.mukellefId === mukellefId
          )[0]
          if (mevcut) db.baglanti.update(mevcut.id, kayit)
          else db.baglanti.insert({ id: `n_${mukellefId}`, ...kayit })
          if (eslesme) sonuc.eslenen++
          else sonuc.olusturulan++
        }
        if (sonuc.olusturulan + sonuc.eslenen > 0)
          logActivity({
            aktorId: actor.id,
            eylem: "LUCA_FIRMALARI_AKTARILDI",
            aciklama: `${sonuc.olusturulan} yeni mükellef, ${sonuc.eslenen} eşleme`,
          })
        return HttpResponse.json(sonuc)
      })
    }
  ),

  http.get(api("/luca-dogrulama"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const h = oku()
    if (!h?.dogrulamaGorsel || !h.dogrulamaSonGecerlilik)
      return notFound("Bekleyen Luca doğrulaması yok")
    const v: LucaDogrulamaView = {
      gorselDataUrl: h.dogrulamaGorsel,
      sonGecerlilik: h.dogrulamaSonGecerlilik,
    }
    return HttpResponse.json(v)
  }),

  http.post(api("/luca-dogrulama"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const body = (await request.json().catch(() => ({}))) as { kod?: string }
    const hata = lucaDogrulamaHatasi(body)
    if (hata) return errorResponse(400, hata)
    const h = oku()
    if (!h?.dogrulamaOturumId || !h.dogrulamaSonGecerlilik)
      return notFound("Bekleyen Luca doğrulaması yok")
    if (h.dogrulamaSonGecerlilik < new Date().toISOString())
      return errorResponse(410, "Doğrulama görselinin süresi doldu, yenileyin")
    const sonuc = await lucaPortal.giris(
      { kullanici: h.kullanici, sifre: h.sifre },
      { oturumId: h.dogrulamaOturumId, kod: body.kod!.trim() }
    )
    const guncel = girisIsle(h, sonuc)
    yaz(guncel)
    if (sonuc.durum === "DOGRULAMA")
      return HttpResponse.json(
        { message: "Doğrulama kodu hatalı", dogrulama: true },
        { status: 422 }
      )
    if (sonuc.durum === "HATA") return errorResponse(422, sonuc.hataMesaji)
    return HttpResponse.json(hesapView(guncel))
  }),

  http.post(api("/luca-dogrulama/yenile"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const h = oku()
    if (!h) return notFound(HESAP_YOK)
    if (h.durum !== "DOGRULAMA")
      return errorResponse(409, "Bekleyen Luca doğrulaması yok")
    const yeni = await lucaPortal.dogrulamaYenile({
      kullanici: h.kullanici,
      sifre: h.sifre,
    })
    const sonGecerlilik = addMinutes(new Date(), DOGRULAMA_DAKIKA).toISOString()
    yaz({
      ...h,
      dogrulamaOturumId: yeni.oturumId,
      dogrulamaGorsel: yeni.gorselDataUrl,
      dogrulamaSonGecerlilik: sonGecerlilik,
    })
    const v: LucaDogrulamaView = {
      gorselDataUrl: yeni.gorselDataUrl,
      sonGecerlilik,
    }
    return HttpResponse.json(v)
  }),
]
