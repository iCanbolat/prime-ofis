import { HttpResponse, http } from "msw"

import {
  eslemeleriOgren,
  fisHatalari,
  fisToplamlari,
  kurus,
  lucaDosyaAdi,
} from "@prime/shared/fis-aktarimi/kurallar"
import {
  MAKS_FIS_DOSYA,
  VARSAYILAN_LUCA_SABLONU,
  FIS_BELGE_TURU_ETIKET,
  ZORUNLU_ALANLAR,
  varsayilanHesapAyari,
} from "@prime/shared/fis-aktarimi/sabitler"
import { bugun } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import {
  belgeDonemi,
  fisAktarimiDestekli,
  okumaBaslat,
  okumaSonuclandir,
  okumaTuru,
} from "@prime/mock-data/okuyucu/fis-uret"
import { OKUMA_SURESI_MS } from "@prime/mock-data/okuyucu/mock-okuyucu"
import type {
  FisDetay,
  FisGuncelleRequest,
  FisHesapAyariRequest,
  FisHesapAyariResponse,
  FisSayacResponse,
  FisView,
  LucaAktarimDetay,
  LucaAktarimRequest,
  LucaAktarimView,
  OkumaView,
} from "@prime/shared/types/api"
import type {
  BelgeOkuma,
  FisDurum,
  FisHesapAyari,
  FisOkumasi,
  GelenEvrak,
  LucaAktarim,
  LucaSablonAyari,
  MuhasebeFisi,
} from "@prime/shared/types/domain"

const FIS_DURUMLARI: FisDurum[] = ["TASLAK", "ONAYLANDI", "AKTARILDI"]
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const HESAP_RE = /^[0-9][0-9.]*$/

export function hesapAyari(mukellefId: string): FisHesapAyari {
  return db.fisHesapAyari.find(mukellefId) ?? varsayilanHesapAyari(mukellefId)
}

function hesapAyariYaz(ayar: FisHesapAyari) {
  if (db.fisHesapAyari.find(ayar.id)) db.fisHesapAyari.update(ayar.id, ayar)
  else db.fisHesapAyari.insert(ayar)
}

export function lucaSablonu(): LucaSablonAyari {
  return db.buro.all()[0]?.lucaSablonu ?? VARSAYILAN_LUCA_SABLONU
}

/**
 * Gelen evrak onaylanınca çağrılır: fiş / ekstreyse ve mükellef bilanço esasındaysa okumayı
 * kuyruğa alır. Okuma `OKUMA_SURESI_MS` sonra `okumalariTamamla` ile sonuçlanır.
 */
export function okumaKuyrugaAl(gelen: GelenEvrak): BelgeOkuma | undefined {
  const tur = okumaTuru(gelen.istenen)
  const m = db.mukellef.find(gelen.mukellefId)
  if (!tur || !m || !fisAktarimiDestekli(m)) return undefined
  const okuma = okumaBaslat(gelen, tur, new Date().toISOString())
  if (db.okuma.find(okuma.id)) return db.okuma.update(okuma.id, okuma)
  return db.okuma.insert(okuma)
}

/** Süresi dolan okumaları sonuçlandırır (backend'deki kuyruk işçisinin yerine) */
export function okumalariTamamla() {
  const simdi = Date.now()
  const hazir = db.okuma.where(
    (o) =>
      o.durum === "OKUNUYOR" &&
      simdi - new Date(o.olusturmaTarihi).getTime() >= OKUMA_SURESI_MS
  )
  for (const o of hazir) {
    const gelen = db.gelen.find(o.gelenId)
    if (!gelen) {
      db.okuma.update(o.id, { durum: "HATA", hataMesaji: "Belge bulunamadı" })
      continue
    }
    const digerFisOkumalari = db.okuma
      .where((x) => x.mukellefId === o.mukellefId && x.id !== o.id && !!x.fis)
      .map((x) => x.fis as FisOkumasi)
    const sonuc = okumaSonuclandir(o, {
      gelen,
      donem: belgeDonemi(gelen, db.talep.find(gelen.talepId)),
      ayar: hesapAyari(o.mukellefId),
      digerFisOkumalari,
      ebelgeler: db.ebelge.where((e) => e.mukellefId === o.mukellefId),
      simdi: new Date(simdi).toISOString(),
    })
    db.okuma.update(o.id, sonuc.okuma)
    // Yeniden okumada önceki taslaklar yenileriyle değişir
    for (const f of db.fis.where(
      (f) => f.okumaId === o.id && f.durum === "TASLAK"
    ))
      db.fis.remove(f.id)
    db.fis.insertMany(sonuc.fisler)
  }
}

function fisView(f: MuhasebeFisi): FisView {
  const aktarim = f.aktarimId ? db.lucaAktarim.find(f.aktarimId) : undefined
  return {
    ...f,
    mukellefUnvan: db.mukellef.find(f.mukellefId)?.unvan ?? "",
    gelenAd: db.gelen.find(f.gelenId)?.ad ?? "",
    toplam: fisToplamlari(f.satirlar).borc,
    hatalar: fisHatalari(f),
    aktarimDosyaAdi: aktarim?.dosyaAdi,
  }
}

function okumaView(o: BelgeOkuma): OkumaView {
  return {
    ...o,
    mukellefUnvan: db.mukellef.find(o.mukellefId)?.unvan ?? "",
    gelenAd: db.gelen.find(o.gelenId)?.ad ?? "",
  }
}

function aktarimView(a: LucaAktarim): LucaAktarimView {
  const p = db.personel.find(a.olusturanId)
  return {
    ...a,
    mukellefUnvan: db.mukellef.find(a.mukellefId)?.unvan ?? "",
    olusturan: p ? `${p.ad} ${p.soyad}` : "",
  }
}

const siraliFisler = (fisler: MuhasebeFisi[]) =>
  fisler.sort(
    (a, b) => b.tarih.localeCompare(a.tarih) || a.id.localeCompare(b.id)
  )

function satirlariTemizle(body: FisGuncelleRequest) {
  return body.satirlar.map((s) => ({
    hesapKodu: String(s.hesapKodu ?? "").trim(),
    aciklama: String(s.aciklama ?? "").trim(),
    borc: kurus(Number(s.borc) || 0),
    alacak: kurus(Number(s.alacak) || 0),
    eslemeAnahtari: s.eslemeAnahtari || undefined,
  }))
}

export const fisAktarimiHandlers = [
  http.get(api("/fisler"), ({ request }) => {
    okumalariTamamla()
    const url = new URL(request.url)
    const mukellefId = url.searchParams.get("mukellefId")
    const durumParam = url.searchParams.get("durum") as FisDurum | null
    const durum =
      durumParam && FIS_DURUMLARI.includes(durumParam) ? durumParam : null
    const donem = url.searchParams.get("donem")
    const fisler = db.fis.where(
      (f) =>
        (!mukellefId || f.mukellefId === mukellefId) &&
        (!durum || f.durum === durum) &&
        (!donem || f.tarih.startsWith(donem))
    )
    return HttpResponse.json(siraliFisler(fisler).map(fisView))
  }),

  http.get(api("/fisler/sayac"), () => {
    okumalariTamamla()
    const yanit: FisSayacResponse = {
      taslak: db.fis.count((f) => f.durum === "TASLAK"),
      hazir: db.fis.count((f) => f.durum === "ONAYLANDI"),
      okunuyor: db.okuma.count((o) => o.durum === "OKUNUYOR"),
      hatali: db.okuma.count((o) => o.durum === "HATA"),
    }
    return HttpResponse.json(yanit)
  }),

  http.get(api("/okumalar"), ({ request }) => {
    okumalariTamamla()
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    const okumalar = db.okuma
      .where(
        (o) =>
          o.durum !== "OKUNDU" && (!mukellefId || o.mukellefId === mukellefId)
      )
      .sort((a, b) => b.olusturmaTarihi.localeCompare(a.olusturmaTarihi))
    return HttpResponse.json(okumalar.map(okumaView))
  }),

  http.post<{ id: string }>(
    api("/okumalar/:id/yeniden-oku"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const o = db.okuma.find(params.id)
      if (!o) return notFound("Okuma bulunamadı")
      if (o.durum === "OKUNUYOR")
        return errorResponse(409, "Belge zaten okunuyor")
      if (db.fis.count((f) => f.okumaId === o.id && f.durum !== "TASLAK"))
        return errorResponse(
          409,
          "Bu belgeden onaylanmış fiş var; önce taslağa alın"
        )
      const guncel = db.okuma.update(o.id, {
        durum: "OKUNUYOR",
        hataMesaji: undefined,
        olusturmaTarihi: new Date().toISOString(),
      })!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "FIS_OKUNDU",
          hedefTip: "FIS",
          hedefId: o.id,
          mukellefId: o.mukellefId,
          aciklama: `${db.gelen.find(o.gelenId)?.ad ?? "Belge"} yeniden okunuyor`,
        },
        false
      )
      return HttpResponse.json(okumaView(guncel))
    }
  ),

  http.get<{ id: string }>(api("/fisler/:id"), ({ params }) => {
    okumalariTamamla()
    const f = db.fis.find(params.id)
    if (!f) return notFound("Fiş bulunamadı")
    const okuma = db.okuma.find(f.okumaId)
    if (!okuma) return notFound("Okuma bulunamadı")
    const gelen = db.gelen.find(f.gelenId)
    const yanit: FisDetay = {
      ...fisView(f),
      okuma,
      gelenMimeType: gelen?.mimeType ?? "application/pdf",
    }
    return HttpResponse.json(yanit)
  }),

  http.put<{ id: string }, FisGuncelleRequest>(
    api("/fisler/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const f = db.fis.find(params.id)
      if (!f) return notFound("Fiş bulunamadı")
      if (f.durum !== "TASLAK")
        return errorResponse(409, "Yalnızca taslak fişler düzenlenebilir")
      const body = await request.json()
      if (!Array.isArray(body.satirlar))
        return errorResponse(400, "Satırlar eksik")
      if (!YMD_RE.test(body.tarih ?? ""))
        return errorResponse(400, "Geçersiz fiş tarihi")
      if (body.evrakTarihi && !YMD_RE.test(body.evrakTarihi))
        return errorResponse(400, "Geçersiz evrak tarihi")
      if (body.belgeTuru && !(body.belgeTuru in FIS_BELGE_TURU_ETIKET))
        return errorResponse(400, "Geçersiz belge türü")
      const satirlar = satirlariTemizle(body)
      if (satirlar.some((s) => s.hesapKodu && !HESAP_RE.test(s.hesapKodu)))
        return errorResponse(
          400,
          "Hesap kodu yalnızca rakam ve nokta içerebilir"
        )

      // Personelin değiştirdiği karşı hesapları mükellef için öğren
      const ayar = hesapAyari(f.mukellefId)
      const eslemeler = eslemeleriOgren(f.satirlar, satirlar, ayar.eslemeler)
      if (JSON.stringify(eslemeler) !== JSON.stringify(ayar.eslemeler))
        hesapAyariYaz({ ...ayar, eslemeler })

      const guncel = db.fis.update(f.id, {
        tarih: body.tarih,
        aciklama: body.aciklama?.trim() || f.aciklama,
        evrakNo: body.evrakNo?.trim() || undefined,
        evrakTarihi: body.evrakTarihi || undefined,
        belgeTuru: body.belgeTuru ?? f.belgeTuru,
        satirlar,
      })!
      return HttpResponse.json(fisView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/fisler/:id/onayla"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const f = db.fis.find(params.id)
      if (!f) return notFound("Fiş bulunamadı")
      if (f.durum !== "TASLAK")
        return errorResponse(409, "Fiş zaten onaylanmış")
      const hatalar = fisHatalari(f)
      if (hatalar.length) return errorResponse(400, hatalar.join(". "))
      const guncel = db.fis.update(f.id, {
        durum: "ONAYLANDI",
        onaylayanId: actor.id,
        onayTarihi: new Date().toISOString(),
      })!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "FIS_ONAYLANDI",
          hedefTip: "FIS",
          hedefId: guncel.id,
          mukellefId: guncel.mukellefId,
          aciklama: guncel.aciklama,
        },
        false
      )
      return HttpResponse.json(fisView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/fisler/:id/taslaga-al"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const f = db.fis.find(params.id)
      if (!f) return notFound("Fiş bulunamadı")
      if (f.durum !== "ONAYLANDI")
        return errorResponse(
          409,
          f.durum === "AKTARILDI"
            ? "Aktarılmış fiş için önce aktarımı geri alın"
            : "Fiş zaten taslak"
        )
      const guncel = db.fis.update(f.id, {
        durum: "TASLAK",
        onaylayanId: undefined,
        onayTarihi: undefined,
      })!
      return HttpResponse.json(fisView(guncel))
    }
  ),

  http.get<{ id: string }>(
    api("/mukellefler/:id/fis-hesaplari"),
    ({ params }) => {
      const m = db.mukellef.find(params.id)
      if (!m) return notFound("Mükellef bulunamadı")
      const yanit: FisHesapAyariResponse = {
        ayar: hesapAyari(m.id),
        destekli: fisAktarimiDestekli(m),
      }
      return HttpResponse.json(yanit)
    }
  ),

  http.put<{ id: string }, FisHesapAyariRequest>(
    api("/mukellefler/:id/fis-hesaplari"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.id)
      if (!m) return notFound("Mükellef bulunamadı")
      const body = await request.json()
      const kodlar = [
        body.gider,
        body.kasa,
        body.banka,
        body.satici,
        ...Object.values(body.kdv ?? {}),
        ...(body.eslemeler ?? []).map((e) => e.hesapKodu),
      ].map((k) => String(k ?? "").trim())
      if (kodlar.some((k) => !HESAP_RE.test(k)))
        return errorResponse(
          400,
          "Hesap kodları rakam ve nokta içermeli, boş olamaz"
        )
      const ayar: FisHesapAyari = {
        id: m.id,
        gider: body.gider.trim(),
        kasa: body.kasa.trim(),
        banka: body.banka.trim(),
        satici: body.satici.trim(),
        kdv: Object.fromEntries(
          Object.entries(body.kdv ?? {}).map(([o, k]) => [o, k.trim()])
        ),
        eslemeler: (body.eslemeler ?? [])
          .map((e) => ({
            anahtar: e.anahtar.trim().toLocaleUpperCase("tr-TR"),
            hesapKodu: e.hesapKodu.trim(),
          }))
          .filter((e) => e.anahtar),
      }
      hesapAyariYaz(ayar)
      const yanit: FisHesapAyariResponse = {
        ayar,
        destekli: fisAktarimiDestekli(m),
      }
      return HttpResponse.json(yanit)
    }
  ),

  http.get(api("/buro/luca-sablonu"), () => HttpResponse.json(lucaSablonu())),

  http.put<never, LucaSablonAyari>(
    api("/buro/luca-sablonu"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(403, "Şablonu yalnızca yönetici değiştirebilir")
      const body = await request.json()
      const alanlar = body.sutunlar?.map((s) => s.alan) ?? []
      const eksik = ZORUNLU_ALANLAR.filter((a) => !alanlar.includes(a))
      if (eksik.length)
        return errorResponse(400, "Zorunlu Luca sütunları çıkarılamaz")
      if (new Set(alanlar).size !== alanlar.length)
        return errorResponse(400, "Bir alan birden fazla sütunda kullanılamaz")
      if (body.sutunlar.some((s) => !s.baslik?.trim()))
        return errorResponse(400, "Sütun başlıkları boş olamaz")
      if (!Number.isInteger(body.baslangicFisNo) || body.baslangicFisNo < 1)
        return errorResponse(400, "Başlangıç fiş no 1 veya daha büyük olmalı")
      const [buro] = db.buro.all()
      const sablon: LucaSablonAyari = {
        sutunlar: body.sutunlar.map((s) => ({
          alan: s.alan,
          baslik: s.baslik.trim(),
        })),
        tarihFormati: body.tarihFormati || VARSAYILAN_LUCA_SABLONU.tarihFormati,
        baslangicFisNo: body.baslangicFisNo,
      }
      db.buro.update(buro!.id, { lucaSablonu: sablon })
      return HttpResponse.json(sablon)
    }
  ),

  http.get(api("/luca-aktarimlari"), ({ request }) => {
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    const aktarimlar = db.lucaAktarim
      .where((a) => !mukellefId || a.mukellefId === mukellefId)
      .sort((a, b) => b.tarih.localeCompare(a.tarih))
    return HttpResponse.json(aktarimlar.map(aktarimView))
  }),

  http.get<{ id: string }>(api("/luca-aktarimlari/:id"), ({ params }) => {
    const a = db.lucaAktarim.find(params.id)
    if (!a) return notFound("Aktarım bulunamadı")
    const yanit: LucaAktarimDetay = {
      aktarim: aktarimView(a),
      fisler: a.fisIdleri
        .map((id) => db.fis.find(id))
        .filter((f): f is MuhasebeFisi => Boolean(f)),
      sablon: lucaSablonu(),
    }
    return HttpResponse.json(yanit)
  }),

  http.post<never, LucaAktarimRequest>(
    api("/luca-aktarimlari"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const ids = [...new Set(body.fisIdleri ?? [])]
      if (ids.length === 0) return errorResponse(400, "Aktarılacak fiş seçin")
      if (ids.length > MAKS_FIS_DOSYA)
        return errorResponse(
          400,
          `Luca bir dosyada en fazla ${MAKS_FIS_DOSYA} fiş kabul eder`
        )
      const fisler = ids.map((id) => db.fis.find(id))
      if (fisler.some((f) => !f || f.mukellefId !== m.id))
        return errorResponse(400, "Fişler seçilen mükellefe ait olmalı")
      if (fisler.some((f) => f!.durum !== "ONAYLANDI"))
        return errorResponse(
          409,
          "Yalnızca onaylı, aktarılmamış fişler aktarılabilir"
        )

      const sirali = [...(fisler as MuhasebeFisi[])].sort((a, b) =>
        a.tarih.localeCompare(b.tarih)
      )
      const gunluk = db.lucaAktarim.count(
        (a) => a.mukellefId === m.id && a.tarih.startsWith(bugun())
      )
      const aktarim = db.lucaAktarim.insert({
        mukellefId: m.id,
        fisIdleri: sirali.map((f) => f.id),
        dosyaAdi: lucaDosyaAdi(m.unvan, bugun(), gunluk + 1),
        olusturanId: actor.id,
        tarih: new Date().toISOString(),
      })
      const guncel = sirali.map((f) =>
        db.fis.update(f.id, { durum: "AKTARILDI", aktarimId: aktarim.id })!
      )
      logActivity(
        {
          aktorId: actor.id,
          eylem: "LUCA_AKTARIMI",
          hedefTip: "FIS",
          mukellefId: m.id,
          aciklama: `${guncel.length} fiş · ${aktarim.dosyaAdi}`,
        },
        false
      )
      const yanit: LucaAktarimDetay = {
        aktarim: aktarimView(aktarim),
        fisler: guncel,
        sablon: lucaSablonu(),
      }
      return HttpResponse.json(yanit, { status: 201 })
    }
  ),

  http.post<{ id: string }>(
    api("/luca-aktarimlari/:id/geri-al"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const a = db.lucaAktarim.find(params.id)
      if (!a) return notFound("Aktarım bulunamadı")
      if (a.geriAlindi) return errorResponse(409, "Aktarım zaten geri alınmış")
      for (const id of a.fisIdleri) {
        const f = db.fis.find(id)
        if (f?.aktarimId === a.id)
          db.fis.update(id, { durum: "ONAYLANDI", aktarimId: undefined })
      }
      const guncel = db.lucaAktarim.update(a.id, { geriAlindi: true })!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "LUCA_AKTARIMI_GERI_ALINDI",
          hedefTip: "FIS",
          mukellefId: a.mukellefId,
          aciklama: a.dosyaAdi,
        },
        false
      )
      return HttpResponse.json(aktarimView(guncel))
    }
  ),
]
