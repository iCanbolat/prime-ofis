/**
 * `/api/e-belge/*` — backend'in e-Belge sözleşmesi. Luca'ya erişim `EntegratorAdapter` üzerinden
 * (burada mock uygulaması) yapılır; gerçek backend aynı uçları kendi adaptörüyle karşılar.
 */
import { format, subDays, subMonths } from "date-fns"
import { HttpResponse, http } from "msw"

import {
  beratTakvimId,
  yanitDurumu,
  yanitKalanGun,
  YANIT_UYARI_GUN,
} from "@prime/shared/e-belge/kurallar"
import type { LucaPortalFirma } from "@prime/shared/e-belge/luca-portal"
import {
  baglantiHatasi,
  EBELGE_DONEM_RE,
  EBELGE_TURLERI,
  EBELGE_YONLERI,
  faturaFiltreHatasi,
  kontorAlimHatasi,
} from "@prime/shared/e-belge/girdi"
import {
  kontorBakiyesi,
  mukellefTuketimleri,
  sonDonemler,
  donemTuketimi,
} from "@prime/shared/e-belge/kontor"
import { SAYFA_BOYUTU } from "@prime/shared/e-belge/sabitler"
import { yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import { bugun, toYmd } from "@prime/shared/lib/tarih"
import { putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import { donemListesi } from "@prime/mock-data/factories/e-belge"
import {
  api,
  errorResponse,
  logActivity,
  logDosyaErisimi,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { beyanDurumuOku, beyanDurumuYaz } from "@/mocks/handlers/takvim"
import {
  lucaCalistir,
  lucaHesabi,
  lucaKontorYaz,
  lucaPortal,
  LucaYaniti,
  yanitla,
} from "@/mocks/handlers/luca-hesap"
import { ublKalemleri } from "@prime/shared/e-belge/ubl-kalemler"
import type {
  BaglantiKaydetRequest,
  BeratListResponse,
  BeratView,
  EBelgeDetay,
  EBelgeListResponse,
  EBelgeOzetResponse,
  EBelgeView,
  EntegratorBaglantiView,
  KontorAlimRequest,
  KontorAlimView,
  KontorOzetResponse,
  SenkronRequest,
  SenkronResponse,
} from "@prime/shared/types/api"
import type {
  EBelge,
  EBelgeTur,
  EBelgeYon,
  EFaturaYanit,
  GibDurumu,
  Mukellef,
  EntegratorBaglanti,
  Personel,
} from "@prime/shared/types/domain"

const TURLER = EBELGE_TURLERI
const YONLER = EBELGE_YONLERI
const DONEM_RE = EBELGE_DONEM_RE

function baglantiView(m: Mukellef): EntegratorBaglantiView {
  const kayit = db.baglanti.where((b) => b.mukellefId === m.id)[0]
  const temel: EntegratorBaglanti = kayit ?? {
    id: `n_${m.id}`,
    mukellefId: m.id,
    durum: "BAGLI_DEGIL",
    eFatura: false,
    eArsiv: false,
    eDefter: false,
  }
  return {
    ...temel,
    mukellefUnvan: m.unvan,
    mukellefTur: m.tur,
    sorumluPersonelId: m.sorumluPersonelId,
  }
}

export function ebelgeView(e: EBelge, simdi = new Date()): EBelgeView {
  const yanit = yanitDurumu(e, simdi)
  return {
    ...e,
    yanit,
    yanitKalanGun:
      yanit === "BEKLIYOR" ? yanitKalanGun(e.alinmaTarihi, simdi) : undefined,
    mukellefUnvan: db.mukellef.find(e.mukellefId)?.unvan ?? "—",
  }
}

/** Backend `LucaPortalEntegrator`: mükellefin eşli Luca firması üzerinden portal çağrıları */
const firmasi = (b: EntegratorBaglanti) => {
  if (!b.lucaFirmaId)
    throw new LucaYaniti(
      errorResponse(409, "Mükellef bir Luca firmasıyla eşlenmemiş")
    )
  return b.lucaFirmaId
}

const portalFaturaIcerik = (
  b: EntegratorBaglanti,
  ettn: string,
  format: "PDF" | "XML"
) => lucaCalistir((o) => lucaPortal.faturaIcerik(o, firmasi(b), ettn, format))

/** Son senkrondan 7 gün geriye (ilk senkronda 90 gün) → bugün */
function senkronAraligi(sonSenkron: string | undefined) {
  const bugunTarih = new Date()
  const baslangic = sonSenkron
    ? subDays(new Date(sonSenkron), 7)
    : subDays(bugunTarih, 90)
  return { baslangic: toYmd(baslangic), bitis: toYmd(bugunTarih) }
}

/** Berat matrisi dönemleri: içinde bulunulan aydan önceki 12 ay */
export function beratDonemleri(bugunYmd = bugun()): string[] {
  const ay = new Date(`${bugunYmd.slice(0, 7)}-01T00:00:00`)
  return donemListesi(
    format(subMonths(ay, 12), "yyyy-MM"),
    format(subMonths(ay, 1), "yyyy-MM")
  )
}

function eDefterBaglantilari(mukellefId?: string | null) {
  return db.baglanti.where(
    (b) =>
      b.eDefter &&
      b.durum !== "BAGLI_DEGIL" &&
      (!mukellefId || b.mukellefId === mukellefId) &&
      Boolean(db.mukellef.find(b.mukellefId)?.aktif)
  )
}

function beratlariHesapla(mukellefId?: string | null): BeratListResponse {
  const donemler = beratDonemleri()
  const bugunYmd = bugun()
  const kayitlar = new Map(db.berat.all().map((b) => [b.id, b]))
  const items: BeratView[] = []

  for (const b of eDefterBaglantilari(mukellefId)) {
    const m = db.mukellef.find(b.mukellefId)!
    const sonTarihler = new Map(
      yukumlulukleriHesapla(m, {
        baslangic: `${donemler[0]}-01`,
        bitis: `${String(Number(bugunYmd.slice(0, 4)) + 1)}-12-31`,
      })
        .filter((y) => y.tip === "E_DEFTER_BERAT")
        .map((y) => [y.donem, y.sonTarih])
    )
    for (const donem of donemler) {
      const id = `${m.id}:${donem}`
      const kayit = kayitlar.get(id) ?? {
        id,
        mukellefId: m.id,
        donem,
        durum: "YUKLENMEDI" as const,
      }
      const sonTarih = sonTarihler.get(donem)
      items.push({
        ...kayit,
        mukellefUnvan: m.unvan,
        sonTarih,
        gecikti: Boolean(
          sonTarih && sonTarih < bugunYmd && kayit.durum !== "ONAYLANDI"
        ),
      })
    }
  }
  items.sort((a, b) => a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR"))
  return { donemler, items }
}

interface SenkronSonucu {
  yeniFatura: number
  guncellenenFatura: number
  onaylananBerat: number
}

/** Tek mükellef için artımlı senkron: faturalar (ETTN ile upsert) ve beratlar. */
async function mukellefiSenkronizeEt(
  b: EntegratorBaglanti,
  actor: Personel
): Promise<SenkronSonucu> {
  const sonuc: SenkronSonucu = {
    yeniFatura: 0,
    guncellenenFatura: 0,
    onaylananBerat: 0,
  }
  const turler = TURLER.filter((t) => (t === "E_FATURA" ? b.eFatura : b.eArsiv))
  for (const tur of turler) {
    for (const yon of YONLER) {
      const gelenler = await lucaCalistir((o) =>
        lucaPortal.faturalar(o, firmasi(b), {
          tur,
          yon,
          ...senkronAraligi(b.sonSenkron),
        })
      )
      for (const f of gelenler) {
        const mevcut = db.ebelge.where((e) => e.ettn === f.ettn)[0]
        if (mevcut) {
          db.ebelge.update(mevcut.id, { gibDurumu: f.gibDurumu })
          sonuc.guncellenenFatura++
        } else {
          db.ebelge.insert({ ...f, mukellefId: b.mukellefId })
          sonuc.yeniFatura++
        }
      }
    }
  }

  if (b.eDefter) {
    const yillar = new Set(beratDonemleri().map((d) => d.slice(0, 4)))
    for (const yil of yillar) {
      const beratlar = await lucaCalistir((o) =>
        lucaPortal.beratlar(o, firmasi(b), yil)
      )
      for (const berat of beratlar) {
        const id = `${b.mukellefId}:${berat.donem}`
        const onceki = db.berat.find(id)
        if (onceki?.durum === berat.durum) continue
        const kayit = { mukellefId: b.mukellefId, ...berat }
        if (onceki) db.berat.update(id, kayit)
        else db.berat.insert({ id, ...kayit })
        if (berat.durum !== "ONAYLANDI") continue
        sonuc.onaylananBerat++
        // Takvim senkronu yalnızca ileri yönde: zaten onaylı beyana dokunulmaz
        const takvimId = beratTakvimId(b.mukellefId, berat.donem)
        if (beyanDurumuOku(takvimId) !== "ONAYLANDI")
          beyanDurumuYaz(takvimId, "ONAYLANDI", actor, " (Luca berat)")
      }
    }
  }

  db.baglanti.update(b.id, { sonSenkron: new Date().toISOString() })
  return sonuc
}

export const eBelgeHandlers = [
  // --- Bağlantılar ------------------------------------------------------------
  http.get(api("/e-belge/baglantilar"), () =>
    HttpResponse.json(
      db.mukellef
        .where((m) => m.aktif)
        .map(baglantiView)
        .sort((a, b) => a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR"))
    )
  ),

  http.get<{ mukellefId: string }>(
    api("/e-belge/baglantilar/:mukellefId"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      return HttpResponse.json(baglantiView(m))
    }
  ),

  http.put<{ mukellefId: string }, BaglantiKaydetRequest>(
    api("/e-belge/baglantilar/:mukellefId"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Luca bağlantısını yalnızca yönetici yönetebilir"
        )
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const body = await request.json()
      const hata = baglantiHatasi(body)
      if (hata) return errorResponse(400, hata)
      const lucaFirmaId = body.lucaFirmaId.trim()
      const baskasi = db.baglanti.where(
        (b) => b.lucaFirmaId === lucaFirmaId && b.mukellefId !== m.id
      )[0]
      if (baskasi)
        return errorResponse(
          409,
          "Bu Luca firması başka bir mükellefe eşlenmiş"
        )
      let dogrulama: LucaPortalFirma | undefined
      try {
        dogrulama = (await lucaCalistir((o) => lucaPortal.firmalar(o))).find(
          (f) => f.firmaId === lucaFirmaId
        )
      } catch (e) {
        if (e instanceof LucaYaniti) return e.yanit
        throw e
      }
      if (!dogrulama)
        return errorResponse(422, "Firma Luca hesabında bulunamadı")

      const kayit: Omit<EntegratorBaglanti, "id"> = {
        mukellefId: m.id,
        durum: "BAGLI",
        eFatura: dogrulama.eFatura,
        eArsiv: dogrulama.eArsiv,
        eDefter: dogrulama.eDefter,
        postaKutusu: dogrulama.postaKutusu,
        lucaFirmaId,
        hataMesaji: undefined,
        baglayanId: actor.id,
        baglanmaTarihi: new Date().toISOString(),
      }
      const mevcut = db.baglanti.where((b) => b.mukellefId === m.id)[0]
      if (mevcut)
        db.baglanti.update(mevcut.id, {
          ...kayit,
          sonSenkron: mevcut.sonSenkron,
        })
      else db.baglanti.insert({ id: `n_${m.id}`, ...kayit })

      logActivity({
        aktorId: actor.id,
        eylem: "ENTEGRATOR_BAGLANDI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: `Luca firması ${lucaFirmaId}`,
      })
      return HttpResponse.json(baglantiView(m))
    }
  ),

  http.delete<{ mukellefId: string }>(
    api("/e-belge/baglantilar/:mukellefId"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Luca bağlantısını yalnızca yönetici yönetebilir"
        )
      const mevcut = db.baglanti.where(
        (b) => b.mukellefId === params.mukellefId
      )[0]
      if (!mevcut) return notFound("Bağlantı bulunamadı")
      db.baglanti.remove(mevcut.id)
      logActivity({
        aktorId: actor.id,
        eylem: "ENTEGRATOR_BAGLANTI_KALDIRILDI",
        hedefTip: "MUKELLEF",
        hedefId: mevcut.mukellefId,
        mukellefId: mevcut.mukellefId,
      })
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // --- Senkron ----------------------------------------------------------------
  http.post<never, SenkronRequest>(
    api("/e-belge/senkron"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = ((await request.json().catch(() => ({}))) ??
        {}) as SenkronRequest
      const hedefler = db.baglanti.where(
        (b) =>
          b.durum !== "BAGLI_DEGIL" &&
          (!body.mukellefId || b.mukellefId === body.mukellefId) &&
          Boolean(db.mukellef.find(b.mukellefId)?.aktif)
      )
      if (body.mukellefId && hedefler.length === 0)
        return errorResponse(409, "Mükellefin Luca bağlantısı yok")

      const yanit: SenkronResponse = {
        mukellefSayisi: 0,
        yeniFatura: 0,
        guncellenenFatura: 0,
        onaylananBerat: 0,
        hatali: [],
        sonSenkron: new Date().toISOString(),
      }
      if (hedefler.length) {
        // Portal oturumu bir kez açılır (düşmüşse yeniden giriş); doğrulama istenirse senkron durur
        // (409 dogrulama)
        try {
          await lucaCalistir((o) => lucaPortal.firmalar(o))
        } catch (e) {
          if (e instanceof LucaYaniti) return e.yanit
          throw e
        }
      }
      for (const b of hedefler) {
        const unvan = db.mukellef.find(b.mukellefId)!.unvan
        if (!b.lucaFirmaId) {
          yanit.hatali.push({
            mukellefId: b.mukellefId,
            unvan,
            mesaj: "Mükellef bir Luca firmasıyla eşlenmemiş",
          })
          continue
        }
        if (b.durum === "HATA") {
          yanit.hatali.push({
            mukellefId: b.mukellefId,
            unvan,
            mesaj: b.hataMesaji ?? "Bağlantı hatası",
          })
          continue
        }
        let s: SenkronSonucu
        try {
          s = await mukellefiSenkronizeEt(b, actor)
        } catch (e) {
          // Doğrulama kodu bekleniyor: senkron durur (backend ile aynı)
          if (e instanceof LucaYaniti) return e.yanit
          throw e
        }
        yanit.mukellefSayisi++
        yanit.yeniFatura += s.yeniFatura
        yanit.guncellenenFatura += s.guncellenenFatura
        yanit.onaylananBerat += s.onaylananBerat
      }

      if (yanit.mukellefSayisi > 0)
        lucaKontorYaz(
          (await lucaCalistir((o) => lucaPortal.kontorBakiyesi(o))).kalan
        )

      logActivity({
        aktorId: actor.id,
        eylem: "EBELGE_SENKRONIZE_EDILDI",
        hedefTip: "EBELGE",
        mukellefId: body.mukellefId,
        aciklama: `${yanit.yeniFatura} yeni fatura, ${yanit.onaylananBerat} berat`,
      })
      return HttpResponse.json(yanit)
    }
  ),

  // --- Faturalar --------------------------------------------------------------
  http.get(api("/e-belge/faturalar"), ({ request }) => {
    const url = new URL(request.url)
    const p = (k: string) => url.searchParams.get(k)
    const mukellefId = p("mukellefId")
    const tur = p("tur") as EBelgeTur | null
    const yon = p("yon") as EBelgeYon | null
    const gib = p("gibDurumu") as GibDurumu | null
    const yanitF = p("yanit") as EFaturaYanit | null
    const yanitYaklasan = p("yanitYaklasan") === "true"
    const q = p("q")?.trim()
    const baslangic = p("baslangic")
    const bitis = p("bitis")
    const sayfa = Math.max(Number(p("sayfa")) || 1, 1)
    const sayfaBoyutu = Math.min(Number(p("sayfaBoyutu")) || SAYFA_BOYUTU, 100)
    const artan = p("siralamaYonu") === "asc"
    const tutaraGore = p("sirala") === "toplam"

    const filtreHatasi = faturaFiltreHatasi({
      tur,
      yon,
      gibDurumu: gib,
      yanit: yanitF,
      baslangic,
      bitis,
    })
    if (filtreHatasi) return errorResponse(400, filtreHatasi)

    const simdi = new Date()
    const filtreli = db.ebelge
      .where(
        (e) =>
          (!mukellefId || e.mukellefId === mukellefId) &&
          (!tur || e.tur === tur) &&
          (!yon || e.yon === yon) &&
          (!gib || e.gibDurumu === gib) &&
          (!baslangic || e.duzenlemeTarihi >= baslangic) &&
          (!bitis || e.duzenlemeTarihi <= bitis)
      )
      .map((e) => ebelgeView(e, simdi))
      .filter(
        (e) =>
          (!yanitF || e.yanit === yanitF) &&
          (!yanitYaklasan ||
            (e.yanit === "BEKLIYOR" &&
              (e.yanitKalanGun ?? 99) <= YANIT_UYARI_GUN)) &&
          (!q ||
            turkishIncludes(e.belgeNo, q) ||
            turkishIncludes(e.karsiTaraf.unvan, q) ||
            e.karsiTaraf.vknTckn.includes(q) ||
            turkishIncludes(e.mukellefUnvan, q))
      )
      .sort((a, b) => {
        const fark = tutaraGore
          ? a.toplam - b.toplam
          : a.duzenlemeTarihi.localeCompare(b.duzenlemeTarihi) ||
            a.alinmaTarihi.localeCompare(b.alinmaTarihi)
        return artan ? fark : -fark
      })

    const yanitGovde: EBelgeListResponse = {
      items: filtreli.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtreli.length,
      sayfa,
      sayfaBoyutu,
      toplamTutar:
        Math.round(
          filtreli
            .filter((e) => e.paraBirimi === "TRY")
            .reduce((t, e) => t + e.toplam, 0) * 100
        ) / 100,
    }
    return HttpResponse.json(yanitGovde)
  }),

  http.get<{ id: string }>(
    api("/e-belge/faturalar/:id"),
    async ({ params }) => {
      const e = db.ebelge.find(params.id)
      if (!e) return notFound("Fatura bulunamadı")
      const b = db.baglanti.where((n) => n.mukellefId === e.mukellefId)[0]
      const m = db.mukellef.find(e.mukellefId)
      return yanitla(async () => {
        // Kalemler faturanın Luca'daki UBL XML'inden
        const detay: EBelgeDetay = {
          ...ebelgeView(e),
          mukellefVknTckn: m?.vkn ?? m?.tckn ?? "",
          kalemler: b?.lucaFirmaId
            ? ublKalemleri(await portalFaturaIcerik(b, e.ettn, "XML"))
            : [],
        }
        return HttpResponse.json(detay)
      })
    }
  ),

  http.get<{ id: string }>(
    api("/e-belge/faturalar/:id/icerik"),
    async ({ params, request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const e = db.ebelge.find(params.id)
      if (!e) return notFound("Fatura bulunamadı")
      const b = db.baglanti.where((n) => n.mukellefId === e.mukellefId)[0]
      if (!b) return errorResponse(409, "Mükellefin Luca bağlantısı yok")
      logDosyaErisimi(request, actor, {
        hedefTip: "EBELGE",
        hedefId: e.id,
        mukellefId: e.mukellefId,
        ad: `${e.belgeNo}.pdf`,
      })
      return yanitla(async () =>
        HttpResponse.json({
          dataUrl: await portalFaturaIcerik(b, e.ettn, "PDF"),
          ad: `${e.belgeNo}.pdf`,
        })
      )
    }
  ),

  http.post<{ id: string }>(
    api("/e-belge/faturalar/:id/arsive-kaydet"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const e = db.ebelge.find(params.id)
      if (!e) return notFound("Fatura bulunamadı")
      const onceki = e.arsivDosyaId ? db.arsiv.find(e.arsivDosyaId) : undefined
      if (onceki && !onceki.silindi)
        return HttpResponse.json(
          { message: "Fatura zaten arşivde", arsivDosyaId: onceki.id },
          { status: 409 }
        )
      const b = db.baglanti.where((n) => n.mukellefId === e.mukellefId)[0]
      if (!b) return errorResponse(409, "Mükellefin Luca bağlantısı yok")

      let icerik: string
      try {
        icerik = await portalFaturaIcerik(b, e.ettn, "PDF")
      } catch (err) {
        if (err instanceof LucaYaniti) return err.yanit
        throw err
      }
      // "… A.Ş." ile biten unvanlarda çift nokta oluşmasın
      const ad = `${e.belgeNo} - ${e.karsiTaraf.unvan.replace(/\.+$/, "")}.pdf`
      const dosya = db.arsiv.insert({
        mukellefId: e.mukellefId,
        kategori: "FATURA",
        ad,
        mimeType: "application/pdf",
        boyut: Math.round((icerik.length * 3) / 4),
        yukleyenId: actor.id,
        yuklemeTarihi: new Date().toISOString(),
        silindi: false,
      })
      await putBlob(dosya.id, icerik)
      const guncel = db.ebelge.update(e.id, { arsivDosyaId: dosya.id })!
      logActivity({
        aktorId: actor.id,
        eylem: "EBELGE_ARSIVE_KAYDEDILDI",
        hedefTip: "ARSIV",
        hedefId: dosya.id,
        mukellefId: e.mukellefId,
        aciklama: ad,
      })
      return HttpResponse.json(ebelgeView(guncel))
    }
  ),

  // --- e-Defter ----------------------------------------------------------------
  http.get(api("/e-belge/beratlar"), ({ request }) => {
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    return HttpResponse.json(beratlariHesapla(mukellefId))
  }),

  // --- Özet (dashboard, kenar çubuğu) -----------------------------------------
  http.get(api("/e-belge/ozet"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const kapsamda = (mukellefId: string) => {
      const m = db.mukellef.find(mukellefId)
      return Boolean(m?.aktif) && (!sorumlu || m?.sorumluPersonelId === sorumlu)
    }
    const simdi = new Date()
    const bekleyen = db.ebelge
      .where((e) => kapsamda(e.mukellefId))
      .map((e) => ebelgeView(e, simdi))
      .filter((e) => e.yanit === "BEKLIYOR")
    const baglantilar = db.baglanti.where((b) => kapsamda(b.mukellefId))
    const senkronlar = baglantilar
      .map((b) => b.sonSenkron)
      .filter((s): s is string => Boolean(s))
      .sort()
    const bakiye = kontorBakiyesi(db.kontor.all(), db.ebelge.all(), bugun())
    const ozet: EBelgeOzetResponse = {
      yanitBekleyen: bekleyen.length,
      yanitSuresiYaklasan: bekleyen
        .filter((e) => (e.yanitKalanGun ?? 99) <= YANIT_UYARI_GUN)
        .sort((a, b) => a.alinmaTarihi.localeCompare(b.alinmaTarihi)),
      hataliGonderim: db.ebelge.count(
        (e) => kapsamda(e.mukellefId) && e.gibDurumu === "HATA"
      ),
      hataliEArsiv: db.ebelge.count(
        (e) =>
          kapsamda(e.mukellefId) &&
          e.gibDurumu === "HATA" &&
          e.tur === "E_ARSIV"
      ),
      baglantiHatasi: baglantilar.filter((b) => b.durum === "HATA").length,
      bagliMukellef: baglantilar.filter((b) => b.durum === "BAGLI").length,
      beratGeciken: beratlariHesapla()
        .items.filter((b) => kapsamda(b.mukellefId))
        .filter((b) => b.durum !== "ONAYLANDI" && b.gecikti).length,
      sonSenkron: senkronlar.at(-1),
      // Kontör havuzu büronundur: sorumlu filtresinden bağımsız
      kontorKalan: bakiye.kalan,
      kontorDusuk: bakiye.dusukBakiye,
    }
    return HttpResponse.json(ozet)
  }),

  // --- Kontör -----------------------------------------------------------------
  http.get(api("/e-belge/kontor"), ({ request }) => {
    const bugunYmd = bugun()
    const donemParam = new URL(request.url).searchParams.get("donem")
    const donem =
      donemParam && DONEM_RE.test(donemParam)
        ? donemParam
        : bugunYmd.slice(0, 7)
    const belgeler = db.ebelge.all()
    const bakiye = kontorBakiyesi(db.kontor.all(), belgeler, bugunYmd)
    const luca = lucaHesabi()
    const yanit: KontorOzetResponse = {
      donem,
      ...bakiye,
      ...(luca?.kontorBakiye != null && luca.kontorTarihi
        ? { lucaBakiye: luca.kontorBakiye, lucaBakiyeTarihi: luca.kontorTarihi }
        : {}),
      aylik: sonDonemler(bugunYmd, 6).map((d) => ({
        donem: d,
        tuketim: donemTuketimi(belgeler, d),
      })),
      mukellefler: mukellefTuketimleri(belgeler, donem).map((s) => ({
        ...s,
        mukellefUnvan: db.mukellef.find(s.mukellefId)?.unvan ?? "—",
        tutar: s.toplam * bakiye.birimMaliyet,
      })),
      alimlar: db.kontor
        .all()
        .sort((a, b) => b.tarih.localeCompare(a.tarih))
        .map((a): KontorAlimView => {
          const p = db.personel.find(a.ekleyenId)
          return { ...a, ekleyenAd: p ? `${p.ad} ${p.soyad}` : "—" }
        }),
    }
    return HttpResponse.json(yanit)
  }),

  http.post<never, KontorAlimRequest>(
    api("/e-belge/kontor/alimlar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Kontör alımını yalnızca yönetici kaydedebilir"
        )
      const body = await request.json()
      const alimHatasi = kontorAlimHatasi(body, bugun())
      if (alimHatasi) return errorResponse(400, alimHatasi)

      const kayit = db.kontor.insert({
        tarih: body.tarih,
        paketAdet: body.paketAdet,
        hediyeAdet: body.hediyeAdet,
        tutar: body.tutar,
        not: body.not?.trim() || undefined,
        ekleyenId: actor.id,
      })
      logActivity({
        aktorId: actor.id,
        eylem: "KONTOR_ALINDI",
        aciklama: `${kayit.paketAdet + kayit.hediyeAdet} kontör`,
      })
      return HttpResponse.json(
        {
          ...kayit,
          ekleyenAd: `${actor.ad} ${actor.soyad}`,
        } satisfies KontorAlimView,
        { status: 201 }
      )
    }
  ),
]
