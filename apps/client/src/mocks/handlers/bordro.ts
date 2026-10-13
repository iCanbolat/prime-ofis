/**
 * `/api/bordro/*` — bordro takibi.
 *
 * Mükellef × ay satırı her istekte hesaplanır; DB'de yalnızca işlem yapılan dönemler tutulur
 * (kayıt yoksa "Girdi bekleniyor"). "Beyan verildi" saklanmaz: MUHSGK beyanı takvimde
 * "Onaylandı" olunca türetilir. Çalışan bazlı maaş verisi hiçbir zaman sunucuya gelmez;
 * yalnızca dönem toplamları (`BordroOzeti`) saklanır.
 */
import { HttpResponse, http } from "msw"

import { MAKS_DOSYA_BOYUTU } from "@prime/shared/arsiv/kurallar"
import {
  BORDRO_BELGE_SIRASI,
  BORDRO_DONEM_RE,
  BORDRO_DURUM_SIRASI,
  bordroKayitId,
  guncelBordroDonemi,
  sonBordroDonemleri,
} from "@prime/shared/bordro/kurallar"
import { bordroKontrolleri } from "@prime/shared/bordro/kontroller"
import { BordroOkuyucuHatasi } from "@prime/shared/bordro/okuyucu"
import {
  BORDRO_BELGE_ETIKET,
  BORDRO_DURUM_ETIKET,
  BORDRO_MADDE_GIRDI,
  BORDRO_MADDE_HAZIR,
  BORDRO_SAYFA_BOYUTU,
} from "@prime/shared/bordro/sabitler"
import { HAREKET_TUR_ETIKET } from "@prime/shared/bordro/hareket-kurallari"
import { donemEtiketi, takvimOlayId } from "@prime/shared/takvim/motor"
import { formatDate } from "@prime/shared/lib/format"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import {
  bordroBelgeleri,
  bordroDurumuIlerlet,
  bordroKaydiYaz,
  hareketView,
  bordroMukellefleri,
  bordroSatiri,
} from "@/mocks/handlers/bordro-islemleri"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import {
  DATA_URL_RE,
  arsiveYaz,
  gorevMaddesiniTamamla,
} from "@/mocks/handlers/ortak-islemler"
import { mockBordroOku } from "@/mocks/okuyucu/bordro-okuyucu"
import type {
  BordroBelgeEkleRequest,
  BordroBelgeYukleme,
  BordroDetay,
  BordroGuncelleRequest,
  BordroListResponse,
  BordroOkuRequest,
  BordroOkuResponse,
  BordroOzetResponse,
  BordroOzetiKaydetRequest,
  BordroSatiri,
  IsHareketiEkleRequest,
  IsHareketiGuncelleRequest,
  IsHareketiListParams,
  IsHareketiView,
} from "@prime/shared/types/api"
import type {
  BordroDurum,
  BordroOzeti,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

const OZET_ALANLARI = [
  "brutToplam",
  "netToplam",
  "sgkIsciPayi",
  "sgkIsverenPayi",
  "issizlikToplam",
  "gelirVergisi",
  "damgaVergisi",
] as const
const MAKS_CALISAN = 100_000

/** Özet toplamlarını doğrular; hata mesajı ya da undefined döner */
function ozetHatasi(ozet: BordroOzeti | undefined): string | undefined {
  if (!ozet || typeof ozet !== "object") return "Bordro özeti eksik"
  if (
    !Number.isInteger(ozet.calisanSayisi) ||
    ozet.calisanSayisi < 1 ||
    ozet.calisanSayisi > MAKS_CALISAN
  )
    return "Çalışan sayısı geçersiz"
  for (const alan of OZET_ALANLARI) {
    const v = ozet[alan]
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      return "Tutarlar sıfır ya da pozitif sayı olmalı"
  }
  if (ozet.netToplam > ozet.brutToplam)
    return "Net toplam brüt toplamdan büyük olamaz"
}

const MAKS_BELGE = 20

/** Yüklenecek dönem belgelerini doğrular; hata mesajı ya da undefined döner */
function belgeHatasi(dosyalar: unknown): string | undefined {
  if (!Array.isArray(dosyalar)) return "Dosya listesi geçersiz"
  if (dosyalar.length > MAKS_BELGE)
    return `Bir seferde en fazla ${MAKS_BELGE} dosya yüklenebilir`
  for (const y of dosyalar as BordroBelgeYukleme[]) {
    if (!y || !BORDRO_BELGE_SIRASI.includes(y.tur)) return "Belge türü geçersiz"
    if (!y.dosya?.ad?.trim() || !DATA_URL_RE.test(y.dosya.dataUrl ?? ""))
      return "Dosya içeriği eksik"
    const base64 = y.dosya.dataUrl.slice(y.dosya.dataUrl.indexOf(",") + 1)
    if (Math.floor((base64.length * 3) / 4) > MAKS_DOSYA_BOYUTU)
      return `${y.dosya.ad}: dosya 10 MB sınırını aşıyor`
  }
}

/** Belgeleri arşive BORDRO kategorisi + dönemle yazar */
async function belgeleriArsiveYaz(
  mukellefId: string,
  donem: string,
  dosyalar: BordroBelgeYukleme[],
  actor: Personel
) {
  for (const y of dosyalar)
    await arsiveYaz(mukellefId, "BORDRO", y.dosya, actor, {
      donem,
      bordroBelge: y.tur,
    })
}

/** Detay: satır + okuma anında hesaplanan kontroller */
function bordroDetayi(m: Mukellef, donem: string): BordroDetay {
  const kayit = db.bordro.find(bordroKayitId(m.id, donem))
  const tahakkuk = db.tahakkuk.where(
    (t) =>
      t.mukellefId === m.id && t.tip === "MUHTASAR_SGK" && t.donem === donem
  )[0]
  const mizan = db.mizan.where(
    (z) => z.mukellefId === m.id && z.donem === donem
  )[0]
  return {
    satir: bordroSatiri(m, donem),
    kontroller: kayit?.ozet
      ? bordroKontrolleri(kayit.ozet, {
          mukellefCalisanSayisi: m.calisanSayisi,
          muhsgkTahakkuk: tahakkuk?.odenecek,
          mizanHesaplari: mizan?.hesaplar,
        })
      : [],
    tahakkuk: tahakkuk && {
      tahakkukNo: tahakkuk.tahakkukNo,
      odenecek: tahakkuk.odenecek,
      vade: tahakkuk.vade,
    },
    mizanVar: Boolean(mizan),
    belgeler: bordroBelgeleri(m.id, donem),
  }
}

const UYARI_SIRASI = { GECIKTI: 0, YAKLASIYOR: 1, YOK: 2 } as const
const DURUMLAR = Object.keys(BORDRO_DURUM_ETIKET) as BordroDurum[]
const MAKS_NOT = 500

/** İstenen dönem geçerli mi? Gelecek ayların bordrosu olmaz. */
function donemHatasi(donem: string): string | undefined {
  if (!BORDRO_DONEM_RE.test(donem)) return "Dönem geçersiz"
  if (`${donem}-01` > bugun()) return "Gelecek dönem için bordro olamaz"
}

function satirlariSirala(satirlar: BordroSatiri[]) {
  return satirlar.sort(
    (a, b) =>
      UYARI_SIRASI[a.uyari] - UYARI_SIRASI[b.uyari] ||
      a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
  )
}

const MAKS_KISI = 80
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function gecerliTarih(tarih: unknown): tarih is string {
  if (typeof tarih !== "string" || !YMD_RE.test(tarih)) return false
  try {
    return toYmd(fromYmd(tarih)) === tarih
  } catch {
    return false
  }
}

/** Dashboard için: süresi yaklaşan ve geçen bildirimsiz işe giriş / çıkış sayısı */
function hareketSayaclari(sorumlu: string | null) {
  const gorunumler = db.isHareketi
    .where((h) => {
      if (h.durum !== "BEKLIYOR") return false
      const m = db.mukellef.find(h.mukellefId)
      return Boolean(m?.aktif) && (!sorumlu || m!.sorumluPersonelId === sorumlu)
    })
    .map((h) => hareketView(h))
  return {
    hareketYaklasan: gorunumler.filter((h) => h.uyari === "YAKLASIYOR").length,
    hareketGeciken: gorunumler.filter((h) => h.uyari === "GECIKTI").length,
  }
}

export const bordroHandlers = [
  http.get(api("/bordro"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const donem = p.get("donem") || guncelBordroDonemi(bugun())
    const hata = donemHatasi(donem)
    if (hata) return errorResponse(422, hata)

    const durum = p.get("durum")
    const uyari = p.get("uyari")
    const tum = bordroMukellefleri({
      sorumlu: p.get("sorumlu"),
      q: p.get("q"),
    }).map((m) => bordroSatiri(m, donem))
    const sayilar = Object.fromEntries(
      DURUMLAR.map((d) => [d, tum.filter((s) => s.durum === d).length])
    ) as Record<BordroDurum, number>

    const filtreli = satirlariSirala(
      tum.filter(
        (s) => (!durum || s.durum === durum) && (!uyari || s.uyari === uyari)
      )
    )
    const sayfaBoyutu = Math.min(
      Math.max(Number(p.get("sayfaBoyutu")) || BORDRO_SAYFA_BOYUTU, 1),
      100
    )
    const sonSayfa = Math.max(Math.ceil(filtreli.length / sayfaBoyutu), 1)
    const sayfa = Math.min(Math.max(Number(p.get("sayfa")) || 1, 1), sonSayfa)

    const body: BordroListResponse = {
      donem,
      items: filtreli.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtreli.length,
      sayfa,
      sayfaBoyutu,
      sayilar,
      uyarilar: {
        GECIKTI: tum.filter((s) => s.uyari === "GECIKTI").length,
        YAKLASIYOR: tum.filter((s) => s.uyari === "YAKLASIYOR").length,
      },
    }
    return HttpResponse.json(body)
  }),

  http.get(api("/bordro/ozet"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const satirlar = sonBordroDonemleri(bugun(), 2).flatMap((donem) =>
      bordroMukellefleri({ sorumlu }).map((m) => bordroSatiri(m, donem))
    )
    const body: BordroOzetResponse = {
      girdiBekleyen: satirlar.filter(
        (s) => s.durum === "BEKLENIYOR" && s.uyari !== "YOK"
      ).length,
      geciken: satirlar.filter(
        (s) => s.durum !== "BEKLENIYOR" && s.uyari === "GECIKTI"
      ).length,
      ...hareketSayaclari(sorumlu),
    }
    return HttpResponse.json(body)
  }),

  http.get<{ id: string }>(
    api("/mukellefler/:id/bordro"),
    ({ params, request }) => {
      const m = db.mukellef.find(params.id)
      if (!m) return notFound("Mükellef bulunamadı")
      const adet = Math.min(
        Math.max(
          Number(new URL(request.url).searchParams.get("adet")) || 12,
          1
        ),
        24
      )
      return HttpResponse.json(
        sonBordroDonemleri(bugun(), adet).map((d) => bordroSatiri(m, d))
      )
    }
  ),

  http.get<{ mukellefId: string; donem: string }>(
    api("/bordro/:mukellefId/:donem"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const hata = donemHatasi(params.donem)
      if (hata) return errorResponse(422, hata)

      const body = bordroDetayi(m, params.donem)
      return HttpResponse.json(body)
    }
  ),

  http.patch<{ mukellefId: string; donem: string }, BordroGuncelleRequest>(
    api("/bordro/:mukellefId/:donem"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const hata = donemHatasi(params.donem)
      if (hata) return errorResponse(422, hata)

      const body = await request.json()
      if (body.durum !== undefined && !BORDRO_DURUM_SIRASI.includes(body.durum))
        return errorResponse(422, "Durum geçersiz")
      if (body.not !== undefined && body.not.length > MAKS_NOT)
        return errorResponse(422, `Not en fazla ${MAKS_NOT} karakter olabilir`)
      if (
        body.degisiklikYok !== undefined &&
        typeof body.degisiklikYok !== "boolean"
      )
        return errorResponse(422, "Değişiklik yok işareti geçersiz")
      if (
        body.durum === undefined &&
        body.not === undefined &&
        body.degisiklikYok === undefined
      )
        return errorResponse(422, "Değişiklik yok")

      const degisim = {
        ...(body.durum !== undefined && { durum: body.durum }),
        ...(body.not !== undefined && { not: body.not.trim() || undefined }),
      }
      if (body.degisiklikYok) {
        // Dosyasız girdi: dönem en az "Girdi geldi" olur, MUHSGK görevindeki madde işaretlenir
        const simdiki =
          db.bordro.find(bordroKayitId(m.id, params.donem))?.durum ??
          "BEKLENIYOR"
        const ilerle =
          body.durum === undefined &&
          BORDRO_DURUM_SIRASI.indexOf(simdiki) <
            BORDRO_DURUM_SIRASI.indexOf("GIRDI_GELDI")
        bordroKaydiYaz(
          m.id,
          params.donem,
          {
            ...degisim,
            degisiklikYok: true,
            ...(ilerle && { durum: "GIRDI_GELDI" as const }),
          },
          actor,
          "BORDRO_GUNCELLENDI",
          `${donemEtiketi(params.donem)}: puantajda değişiklik yok`
        )
        gorevMaddesiniTamamla(
          takvimOlayId(m.id, "MUHTASAR_SGK", params.donem),
          BORDRO_MADDE_GIRDI,
          actor
        )
      } else {
        bordroKaydiYaz(
          m.id,
          params.donem,
          {
            ...degisim,
            ...(body.degisiklikYok === false && { degisiklikYok: undefined }),
          },
          actor
        )
      }
      return HttpResponse.json(bordroSatiri(m, params.donem))
    }
  ),

  http.post<never, BordroOkuRequest>(
    api("/bordro/oku"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { dosya } = await request.json()
      if (!dosya?.ad || !DATA_URL_RE.test(dosya.dataUrl ?? ""))
        return errorResponse(422, "Dosya içeriği eksik")
      try {
        const sonuc = mockBordroOku(dosya.ad)
        return HttpResponse.json<BordroOkuResponse>(sonuc)
      } catch (e) {
        if (e instanceof BordroOkuyucuHatasi)
          return errorResponse(422, e.message)
        throw e
      }
    }
  ),

  http.post<{ mukellefId: string; donem: string }, BordroOzetiKaydetRequest>(
    api("/bordro/:mukellefId/:donem/ozet"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!bordroMukellefleri({ mukellefId: m.id }).length)
        return errorResponse(409, "Mükellefin bordrosu yok")
      const hata = donemHatasi(params.donem)
      if (hata) return errorResponse(422, hata)

      const body = await request.json()
      const ozetHata = ozetHatasi(body.ozet)
      if (ozetHata) return errorResponse(422, ozetHata)
      const dosyalar = body.dosyalar ?? []
      const dosyaHata = belgeHatasi(dosyalar)
      if (dosyaHata) return errorResponse(422, dosyaHata)

      await belgeleriArsiveYaz(m.id, params.donem, dosyalar, actor)
      const mevcut = db.bordro.find(bordroKayitId(m.id, params.donem))
      const yeni = !mevcut?.ozet
      bordroKaydiYaz(
        m.id,
        params.donem,
        { ozet: body.ozet },
        actor,
        "BORDRO_OZET_ICE_AKTARILDI",
        `${donemEtiketi(params.donem)}: ${body.ozet.calisanSayisi} çalışan`
      )
      bordroDurumuIlerlet(m.id, params.donem, "HAZIRLANDI", actor)
      gorevMaddesiniTamamla(
        takvimOlayId(m.id, "MUHTASAR_SGK", params.donem),
        BORDRO_MADDE_HAZIR,
        actor
      )
      return HttpResponse.json(bordroDetayi(m, params.donem), {
        status: yeni ? 201 : 200,
      })
    }
  ),

  http.post<{ mukellefId: string; donem: string }, BordroBelgeEkleRequest>(
    api("/bordro/:mukellefId/:donem/belgeler"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!bordroMukellefleri({ mukellefId: m.id }).length)
        return errorResponse(409, "Mükellefin bordrosu yok")
      const hata = donemHatasi(params.donem)
      if (hata) return errorResponse(422, hata)

      const { dosyalar } = await request.json()
      const dosyaHata = belgeHatasi(dosyalar)
      if (dosyaHata) return errorResponse(422, dosyaHata)
      if (dosyalar.length === 0) return errorResponse(422, "Dosya seçin")

      await belgeleriArsiveYaz(m.id, params.donem, dosyalar, actor)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "BORDRO_GUNCELLENDI",
          hedefTip: "BORDRO",
          hedefId: bordroKayitId(m.id, params.donem),
          mukellefId: m.id,
          aciklama: `${donemEtiketi(params.donem)}: ${[
            ...new Set(dosyalar.map((y) => BORDRO_BELGE_ETIKET[y.tur])),
          ].join(", ")} arşive eklendi`,
        },
        false
      )
      return HttpResponse.json(bordroDetayi(m, params.donem), { status: 201 })
    }
  ),

  http.post<{ mukellefId: string; donem: string }>(
    api("/bordro/:mukellefId/:donem/calisan-uygula"),
    ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const ozet = db.bordro.find(bordroKayitId(m.id, params.donem))?.ozet
      if (!ozet) return errorResponse(409, "Bu dönem için bordro özeti yok")

      const guncel = db.mukellef.update(m.id, {
        calisanSayisi: ozet.calisanSayisi,
        sgkIsyeriVar: true,
      })!
      logActivity({
        aktorId: actor.id,
        eylem: "MUKELLEF_GUNCELLENDI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: `Çalışan sayısı ${m.calisanSayisi} → ${ozet.calisanSayisi} (bordrodan)`,
      })
      return HttpResponse.json(bordroDetayi(guncel, params.donem))
    }
  ),

  // --- İşe giriş / çıkış ----------------------------------------------------------
  http.get(api("/is-hareketleri"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const mukellefId = p.get("mukellefId")
    const durum = p.get("durum") as IsHareketiListParams["durum"] | null
    const items: IsHareketiView[] = db.isHareketi
      .where(
        (h) =>
          (!mukellefId || h.mukellefId === mukellefId) &&
          (!durum || h.durum === durum)
      )
      .map((h) => hareketView(h))
      .sort(
        (a, b) =>
          Number(a.durum === "BILDIRILDI") - Number(b.durum === "BILDIRILDI") ||
          UYARI_SIRASI[a.uyari] - UYARI_SIRASI[b.uyari] ||
          a.sonTarih.localeCompare(b.sonTarih)
      )
    return HttpResponse.json(items)
  }),

  http.post<never, IsHareketiEkleRequest>(
    api("/is-hareketleri"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (body.tur !== "GIRIS" && body.tur !== "CIKIS")
        return errorResponse(422, "Tür geçersiz")
      if (!gecerliTarih(body.tarih)) return errorResponse(422, "Tarih geçersiz")
      const kisi = body.kisi?.trim()
      if (!kisi) return errorResponse(422, "Ad soyad zorunludur")
      if (kisi.length > MAKS_KISI)
        return errorResponse(
          422,
          `Ad soyad en fazla ${MAKS_KISI} karakter olabilir`
        )

      const h = db.isHareketi.insert({
        mukellefId: m.id,
        tur: body.tur,
        tarih: body.tarih,
        kisi,
        durum: "BEKLIYOR",
        olusturanId: actor.id,
        olusturmaTarihi: new Date().toISOString(),
      })
      logActivity(
        {
          aktorId: actor.id,
          eylem: "ISE_HAREKETI_KAYDEDILDI",
          hedefTip: "BORDRO",
          hedefId: h.id,
          mukellefId: m.id,
          aciklama: `${HAREKET_TUR_ETIKET[h.tur]}: ${h.kisi} (${formatDate(h.tarih)})`,
        },
        false
      )
      return HttpResponse.json(hareketView(h), { status: 201 })
    }
  ),

  http.patch<{ id: string }, IsHareketiGuncelleRequest>(
    api("/is-hareketleri/:id"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const h = db.isHareketi.find(params.id)
      if (!h) return notFound("Kayıt bulunamadı")
      const body = await request.json()
      if (
        body.durum !== undefined &&
        body.durum !== "BEKLIYOR" &&
        body.durum !== "BILDIRILDI"
      )
        return errorResponse(422, "Durum geçersiz")
      if (body.belgeArsivId) {
        const dosya = db.arsiv.find(body.belgeArsivId)
        if (!dosya || dosya.mukellefId !== h.mukellefId)
          return errorResponse(422, "Belge bu mükellefin arşivinde bulunamadı")
      }
      if (body.durum === undefined && body.belgeArsivId === undefined)
        return errorResponse(422, "Değişiklik yok")

      const guncel = db.isHareketi.update(h.id, {
        ...(body.durum !== undefined && {
          durum: body.durum,
          bildirimTarihi:
            body.durum === "BILDIRILDI" ? new Date().toISOString() : undefined,
        }),
        ...(body.belgeArsivId !== undefined && {
          belgeArsivId: body.belgeArsivId ?? undefined,
        }),
      })!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "ISE_HAREKETI_KAYDEDILDI",
          hedefTip: "BORDRO",
          hedefId: h.id,
          mukellefId: h.mukellefId,
          aciklama: `${HAREKET_TUR_ETIKET[h.tur]}: ${h.kisi} → ${
            guncel.durum === "BILDIRILDI" ? "bildirildi" : "bildirilmedi"
          }`,
        },
        false
      )
      return HttpResponse.json(hareketView(guncel))
    }
  ),

  http.delete<{ id: string }>(
    api("/is-hareketleri/:id"),
    ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const h = db.isHareketi.find(params.id)
      if (!h) return notFound("Kayıt bulunamadı")
      db.isHareketi.remove(h.id)
      return HttpResponse.json({ id: h.id })
    }
  ),
]
