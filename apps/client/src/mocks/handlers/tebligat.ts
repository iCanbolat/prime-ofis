/**
 * `/api/tebligat/*` — e-Tebligat takibi. Gerçek backend her gece erişimi tanımlı mükelleflerin
 * GİB e-Tebligat kutusunu `GibTebligatAdapter` ile tarar; burada mock adaptör kullanılır ve
 * kaçırılan son gece taraması (03:00) özet isteğinde işletilir (testte kapalı; testler
 * `geceTaramasiCalistir`'ı doğrudan çağırır). Giriş kamu oturumuyla açılır (`kamu-oturum.ts`);
 * doğrulama ekranı çıkarsa tarama personel kodu girene kadar bekler.
 */
import { addDays, addMinutes } from "date-fns"
import { HttpResponse, http } from "msw"

import type {
  KamuOturum,
  KamuSorguAdapter,
} from "@prime/shared/borc/kamu-adapter"
import type { GibTebligatAdapter } from "@prime/shared/tebligat/gib-adapter"
import {
  erisimHatasi as erisimGirdiHatasi,
  tebligatEkleHatasi,
  tebligatGuncelleHatasi,
  TEBLIGAT_BELGE_TURLERI,
} from "@prime/shared/tebligat/girdi"
import {
  sureDurumu,
  SURE_KURALLARI,
  tebligatTuru,
} from "@prime/shared/tebligat/kurallar"
import {
  TEBLIGAT_KASA_SISTEMI,
  TEBLIGAT_TUR_ETIKET,
} from "@prime/shared/tebligat/sabitler"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { putBlob } from "@/mocks/blob-store"
import { db } from "@/mocks/db"
import { mockGibAdapter } from "@prime/mock-data/gib-tebligat"
import { mockKamuAdapter } from "@prime/mock-data/kamu/mock-adapter"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { SISTEM_AKTOR } from "@/mocks/handlers/tahsilat"
import {
  dogrulamaAc,
  dogrulamaBul,
  dogrulamaView,
  erisimHatasi,
  oturumAc,
} from "@/mocks/kamu-oturum"
import type {
  TebligatBelgeRequest,
  TebligatEkleRequest,
  TebligatErisimKaydetRequest,
  TebligatErisimSatiri,
  TebligatErisimSatirDurumu,
  TebligatErisimSayilari,
  TebligatGuncelleRequest,
  TebligatKapsam,
  TebligatListResponse,
  TebligatMukellefTaraResponse,
  TebligatOzetResponse,
  TebligatView,
} from "@prime/shared/types/api"
import type {
  KamuDogrulama,
  Mukellef,
  Tebligat,
  TebligatErisim,
  TebligatTarama,
  TebligatTur,
} from "@prime/shared/types/domain"

const TURLER = Object.keys(SURE_KURALLARI) as TebligatTur[]
const KAPSAMLAR: TebligatKapsam[] = ["acik", "acil", "kapali"]
const ERISIM_DURUMLARI: TebligatErisimSatirDurumu[] = [
  "AKTIF",
  "HATA",
  "TANIMSIZ",
]
const DATA_URL_RE = /^data:([^;,]+)[;,]/
const MAKS_DOSYA = 10 * 1024 * 1024
/** Gece taramasının yerel saati */
export const GECE_TARAMA_SAATI = 3
const SAKLANAN_TARAMA = 30

export function tebligatView(
  t: Tebligat,
  bugunYmd: string = bugun()
): TebligatView {
  const m = db.mukellef.find(t.mukellefId)
  const a = t.atananId ? db.personel.find(t.atananId) : undefined
  return {
    ...t,
    ...sureDurumu(t, bugunYmd),
    mukellefUnvan: m?.unvan,
    sorumluPersonelId: m?.sorumluPersonelId,
    atananAd: a ? `${a.ad} ${a.soyad}` : undefined,
  }
}

/** Açıklar önce, son işlem gününe göre; kapalılar ulaşma tarihine göre yeniden eskiye */
function sirala(a: TebligatView, b: TebligatView) {
  if (a.acik !== b.acik) return a.acik ? -1 : 1
  if (a.acik) {
    const x = a.sonIslemTarihi ?? "9999"
    const y = b.sonIslemTarihi ?? "9999"
    if (x !== y) return x.localeCompare(y)
  }
  return b.ulasmaTarihi.localeCompare(a.ulasmaTarihi)
}

/** Yeni tebligat bildirimi: atanan / mükellef sorumlusu ve yöneticiler */
function tebligatAlicilari(t: Tebligat): string[] {
  const m = db.mukellef.find(t.mukellefId)
  const yoneticiler = db.personel
    .where((p) => p.aktif && p.rol === "YONETICI")
    .map((p) => p.id)
  return [...new Set([...(m ? [m.sorumluPersonelId] : []), ...yoneticiler])]
}

function tebligatAciklama(t: Tebligat) {
  const m = db.mukellef.find(t.mukellefId)
  return `${TEBLIGAT_TUR_ETIKET[t.tur]} · ${m?.unvan ?? `VKN ${t.vkn}`}`
}

/** Önceki gece 03:00 (şu an 03:00'ten önceyse dünden önceki gece) */
export function sonGeceTaramaAni(simdi: Date = new Date()): Date {
  const an = new Date(simdi)
  an.setHours(GECE_TARAMA_SAATI, 0, 0, 0)
  if (an > simdi) an.setDate(an.getDate() - 1)
  return an
}

function sonTarama(): TebligatTarama | null {
  return (
    db.tebligatTarama
      .all()
      .sort((a, b) => b.baslangic.localeCompare(a.baslangic))[0] ?? null
  )
}

function erisimSayilari(): TebligatErisimSayilari {
  const sayilar = { aktif: 0, hatali: 0, tanimsiz: 0 }
  const erisimler = new Map(
    db.tebligatErisim.all().map((e) => [e.mukellefId, e])
  )
  for (const m of db.mukellef.where((m) => m.aktif)) {
    const e = erisimler.get(m.id)
    if (!e) sayilar.tanimsiz++
    else if (e.durum === "HATA") sayilar.hatali++
    else sayilar.aktif++
  }
  return sayilar
}

/**
 * Açık GİB oturumuyla mükellefin kutusunu okur; yeni belgeleri tebligat olarak kaydeder. Kutu
 * okunamazsa erişim HATA'ya düşer (ilk düşüşte sorumluya bildirim) ve `null` döner. Doğrulama
 * kodu girildikten sonra `TEBLIGAT` adımı da bunu çağırır.
 */
export async function tebligatlariOku(
  oturum: KamuOturum,
  m: Mukellef,
  aktorId: string,
  an: Date,
  adapter: GibTebligatAdapter = mockGibAdapter(() => an)
): Promise<number | null> {
  const e = erisimBul(m.id)
  if (!e) return null
  const sonuc = await adapter.yeniBelgeler(oturum, e.sonTarama)
  if (!sonuc.gecerli) {
    erisimHatasi(m, "GIB", sonuc.hataMesaji, aktorId)
    return null
  }

  const mevcut = new Set(
    db.tebligat
      .where((t) => t.mukellefId === m.id)
      .flatMap((t) => (t.gibBelgeId ? [t.gibBelgeId] : []))
  )
  let yeni = 0
  for (const b of sonuc.belgeler) {
    if (mevcut.has(b.belgeId)) continue
    mevcut.add(b.belgeId)
    const t = db.tebligat.insert({
      mukellefId: m.id,
      vkn: (m.vkn ?? m.tckn)!,
      kurum: b.kurum,
      tur: tebligatTuru(`${b.belgeTuru} ${b.konu}`),
      konu: b.konu,
      belgeNo: b.belgeNo,
      ulasmaTarihi: b.ulasmaTarihi,
      durum: "YENI",
      kaynak: "GIB",
      gibBelgeId: b.belgeId,
      olusturmaTarihi: an.toISOString(),
    })
    yeni++
    logActivity(
      {
        aktorId,
        eylem: "TEBLIGAT_ALINDI",
        hedefTip: "TEBLIGAT",
        hedefId: t.id,
        mukellefId: m.id,
        aciklama: tebligatAciklama(t),
      },
      { alicilar: tebligatAlicilari(t), baslik: "Yeni e-Tebligat" }
    )
  }
  db.tebligatErisim.update(e.id, {
    durum: "AKTIF",
    hataMesaji: undefined,
    sonTarama: an.toISOString(),
  })
  return yeni
}

type TaramaSonucu =
  { yeni: number } | { dogrulama: KamuDogrulama } | { hata: string }

/** Oturum açar (bekleyen doğrulama varsa denemez) ve kutuyu okur */
async function mukellefTara(
  m: Mukellef,
  aktorId: string,
  an: Date,
  adapter: GibTebligatAdapter,
  giris: KamuSorguAdapter
): Promise<TaramaSonucu> {
  const r = await oturumAc(m, "GIB", ["TEBLIGAT"], aktorId, giris, an)
  if (!("oturum" in r)) return r
  const yeni = await tebligatlariOku(r.oturum, m, aktorId, an, adapter)
  return yeni === null
    ? { hata: erisimBul(m.id)?.hataMesaji ?? "GİB e-Tebligat kutusuna girilemedi" }
    : { yeni }
}

/**
 * Büro geneli gece taraması: erişimi tanımlı her aktif mükellef sırayla taranır. Girişi
 * başarısız olanlar, GİB hesabı ardışık hatalı girişle kilitlenmesin diye şifre güncellenene
 * kadar denenmez (hatalı sayılır).
 */
export async function geceTaramasiCalistir(
  an: Date,
  adapter: GibTebligatAdapter = mockGibAdapter(() => an),
  giris: KamuSorguAdapter = mockKamuAdapter(() => an)
): Promise<TebligatTarama> {
  let taranan = 0
  let hatali = 0
  let dogrulama = 0
  let yeni = 0
  for (const e of db.tebligatErisim.all()) {
    const m = db.mukellef.find(e.mukellefId)
    if (!m?.aktif) continue
    taranan++
    if (e.durum === "HATA") {
      hatali++
      continue
    }
    if (dogrulamaBul(m.id, "GIB")) {
      dogrulama++
      continue
    }
    const r = await mukellefTara(m, SISTEM_AKTOR, an, adapter, giris)
    if ("hata" in r) hatali++
    else if ("dogrulama" in r) dogrulama++
    else yeni += r.yeni
  }
  const tarama = db.tebligatTarama.insert({
    baslangic: an.toISOString(),
    bitis: addMinutes(an, Math.max(1, Math.ceil(taranan / 15))).toISOString(),
    taranan,
    hatali,
    yeni,
    dogrulama,
  })
  const fazla = db.tebligatTarama
    .all()
    .sort((a, b) => b.baslangic.localeCompare(a.baslangic))
    .slice(SAKLANAN_TARAMA)
  for (const t of fazla) db.tebligatTarama.remove(t.id)
  return tarama
}

let calisanTarama: Promise<unknown> | null = null

/** Geliştirmede cron yerine: son gece taraması yapılmadıysa şimdi işletilir */
function geceTaramasiGerekirse() {
  if (import.meta.env.MODE === "test") return Promise.resolve()
  if (calisanTarama) return calisanTarama
  const an = sonGeceTaramaAni()
  const son = sonTarama()
  if (son && new Date(son.baslangic) >= an) return Promise.resolve()
  calisanTarama = geceTaramasiCalistir(an).finally(() => {
    calisanTarama = null
  })
  return calisanTarama
}

const kasaKaydi = (mukellefId: string) =>
  db.credential.where(
    (c) => c.mukellefId === mukellefId && c.sistem === TEBLIGAT_KASA_SISTEMI
  )[0]

function erisimSatiri(
  m: Mukellef,
  e: TebligatErisim | undefined
): TebligatErisimSatiri {
  const kasa = kasaKaydi(m.id)
  const d = dogrulamaBul(m.id, "GIB")
  return {
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    vkn: (m.vkn ?? m.tckn)!,
    sorumluPersonelId: m.sorumluPersonelId,
    durum: e?.durum ?? "TANIMSIZ",
    erisim: e ?? null,
    kasaKaydiId: kasa?.id,
    kasaDahaYeni: Boolean(
      kasa &&
      e?.kasaKaynagi?.credentialId === kasa.id &&
      kasa.sonGuncelleme > e.kasaKaynagi.credentialGuncelleme
    ),
    dogrulama: e && d ? dogrulamaView(d) : null,
  }
}

const erisimBul = (mukellefId: string) =>
  db.tebligatErisim.where((e) => e.mukellefId === mukellefId)[0]

export const tebligatHandlers = [
  http.get(api("/tebligat/erisim"), ({ request }) => {
    const durumParam = new URL(request.url).searchParams.get(
      "durum"
    ) as TebligatErisimSatirDurumu | null
    const durum =
      durumParam && ERISIM_DURUMLARI.includes(durumParam) ? durumParam : null
    const erisimler = new Map(
      db.tebligatErisim.all().map((e) => [e.mukellefId, e])
    )
    const satirlar = db.mukellef
      .where((m) => m.aktif)
      .map((m) => erisimSatiri(m, erisimler.get(m.id)))
      .filter((s) => !durum || s.durum === durum)
      .sort(
        (a, b) =>
          ERISIM_DURUMLARI.indexOf(b.durum) -
            ERISIM_DURUMLARI.indexOf(a.durum) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    return HttpResponse.json(satirlar)
  }),

  http.get<{ mukellefId: string }>(
    api("/tebligat/erisim/:mukellefId"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      return HttpResponse.json(erisimSatiri(m, erisimBul(m.id)))
    }
  ),

  http.put<{ mukellefId: string }, TebligatErisimKaydetRequest>(
    api("/tebligat/erisim/:mukellefId"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const body = await request.json()
      const hata = erisimGirdiHatasi(body)
      if (hata) return errorResponse(400, hata)
      const kullaniciKodu = body.kullaniciKodu.trim()
      const kasa = body.kasaCredentialId
        ? db.credential.find(body.kasaCredentialId)
        : undefined
      if (
        body.kasaCredentialId &&
        (kasa?.mukellefId !== m.id || kasa.sistem !== TEBLIGAT_KASA_SISTEMI)
      )
        return errorResponse(
          400,
          "Kasa kaydı bu mükellefin İnteraktif VD kaydı değil"
        )
      const an = new Date()
      const sonuc = await mockKamuAdapter().giris({
        kurum: "GIB",
        kullaniciKodu,
        sifre: body.sifre,
      })
      if (sonuc.durum === "HATA") return errorResponse(422, sonuc.hataMesaji)
      // Yeni kimlikle önceki doğrulama oturumu geçersizdir
      const eskiDogrulama = dogrulamaBul(m.id, "GIB")
      if (eskiDogrulama) db.kamuDogrulama.remove(eskiDogrulama.id)

      const kayit = {
        kullaniciKodu,
        sifreIpucu: body.sifre.slice(-4),
        durum: "AKTIF" as const,
        hataMesaji: undefined,
        kasaKaynagi: kasa
          ? { credentialId: kasa.id, credentialGuncelleme: kasa.sonGuncelleme }
          : undefined,
        tanimlayanId: actor.id,
        tanimlamaTarihi: an.toISOString(),
      }
      const mevcut = erisimBul(m.id)
      const e = mevcut
        ? db.tebligatErisim.update(mevcut.id, kayit)!
        : db.tebligatErisim.insert({ ...kayit, mukellefId: m.id })
      logActivity(
        {
          aktorId: actor.id,
          eylem: "TEBLIGAT_ERISIMI_TANIMLANDI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: kasa
            ? `${m.unvan} · kasadaki İnteraktif VD kaydından`
            : m.unvan,
        },
        false
      )
      // Kasadaki şifrenin sunucuya aktarılması kaydın erişim geçmişine yazılır
      if (kasa)
        logActivity(
          {
            aktorId: actor.id,
            eylem: "SIFRE_TEBLIGATA_AKTARILDI",
            hedefTip: "CREDENTIAL",
            hedefId: kasa.id,
            mukellefId: m.id,
            aciklama: kasa.sistem,
          },
          false
        )
      // Giriş doğrulama kodu istedi: kayıt açılır, kod girilince kutu taranır
      if (sonuc.durum === "DOGRULAMA")
        dogrulamaAc(
          m,
          "GIB",
          sonuc.oturumId,
          sonuc.gorselDataUrl,
          ["TEBLIGAT"],
          actor.id,
          an
        )
      return HttpResponse.json(erisimSatiri(m, e))
    }
  ),

  http.delete<{ mukellefId: string }>(
    api("/tebligat/erisim/:mukellefId"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      const e = m && erisimBul(m.id)
      if (!m || !e) return notFound("GİB erişimi tanımlı değil")
      db.tebligatErisim.remove(e.id)
      const d = dogrulamaBul(m.id, "GIB")
      if (d) db.kamuDogrulama.remove(d.id)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "TEBLIGAT_ERISIMI_KALDIRILDI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: m.unvan,
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),

  /** Gece beklemeden tek mükellefi tarar (erişim yeni tanımlandığında / hata düzeldiğinde) */
  http.post<{ mukellefId: string }>(
    api("/tebligat/erisim/:mukellefId/tara"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const m = db.mukellef.find(params.mukellefId)
      const e = m && erisimBul(m.id)
      if (!m || !e) return notFound("GİB erişimi tanımlı değil")
      const r = await mukellefTara(
        m,
        actor.id,
        new Date(),
        mockGibAdapter(),
        mockKamuAdapter()
      )
      if ("hata" in r) return errorResponse(409, r.hata)
      const yanit: TebligatMukellefTaraResponse = {
        yeni: "yeni" in r ? r.yeni : 0,
        erisim: erisimBul(m.id)!,
        dogrulama: "dogrulama" in r ? dogrulamaView(r.dogrulama) : null,
      }
      return HttpResponse.json(yanit)
    }
  ),

  http.get(api("/tebligat/ozet"), async ({ request }) => {
    await geceTaramasiGerekirse()
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const bugunYmd = bugun()
    const views = db.tebligat
      .all()
      .map((t) => tebligatView(t, bugunYmd))
      .filter(
        (t) =>
          !sorumlu ||
          t.atananId === sorumlu ||
          (!t.atananId && t.sorumluPersonelId === sorumlu)
      )
    const acik = views.filter((t) => t.acik)
    const hafta = toYmd(addDays(fromYmd(bugunYmd), -7))
    const yanit: TebligatOzetResponse = {
      acik: acik.length,
      acil: acik.filter((t) => t.acil).length,
      geciken: acik.filter((t) => t.gecikti).length,
      yeni: views.filter((t) => t.ulasmaTarihi.slice(0, 10) >= hafta).length,
      yaklasan: acik
        .filter((t) => t.sonIslemTarihi)
        .sort(sirala)
        .slice(0, 5),
      sonTarama: sonTarama(),
      erisim: erisimSayilari(),
    }
    return HttpResponse.json(yanit)
  }),

  http.get(api("/tebligat"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const q = p.get("q")?.trim() ?? ""
    const kapsamParam = p.get("kapsam") as TebligatKapsam | null
    const kapsam =
      kapsamParam && KAPSAMLAR.includes(kapsamParam) ? kapsamParam : null
    const tur = p.get("tur") as TebligatTur | null
    const mukellefId = p.get("mukellefId")
    const bugunYmd = bugun()
    const filtrelenen = db.tebligat
      .all()
      .map((t) => tebligatView(t, bugunYmd))
      .filter(
        (t) =>
          (!mukellefId || t.mukellefId === mukellefId) &&
          (!tur || !TURLER.includes(tur) || t.tur === tur) &&
          (kapsam !== "acik" || t.acik) &&
          (kapsam !== "acil" || t.acil || t.gecikti) &&
          (kapsam !== "kapali" || !t.acik) &&
          (!q ||
            turkishIncludes(t.mukellefUnvan, q) ||
            turkishIncludes(t.konu, q) ||
            t.vkn.includes(q) ||
            Boolean(t.belgeNo?.includes(q)))
      )
      .sort(sirala)
    const sayfaBoyutu = Math.min(
      Math.max(Number(p.get("sayfaBoyutu")) || 20, 1),
      100
    )
    const sonSayfa = Math.max(Math.ceil(filtrelenen.length / sayfaBoyutu), 1)
    const sayfa = Math.min(Math.max(Number(p.get("sayfa")) || 1, 1), sonSayfa)
    const yanit: TebligatListResponse = {
      items: filtrelenen.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtrelenen.length,
      sayfa,
      sayfaBoyutu,
    }
    return HttpResponse.json(yanit)
  }),

  http.get<{ id: string }>(api("/tebligat/:id"), ({ params }) => {
    const t = db.tebligat.find(params.id)
    return t
      ? HttpResponse.json(tebligatView(t))
      : notFound("Tebligat bulunamadı")
  }),

  http.post<never, TebligatEkleRequest>(
    api("/tebligat"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return errorResponse(400, "Mükellef seçin")
      const hata = tebligatEkleHatasi(body, bugun())
      if (hata) return errorResponse(400, hata)
      const ulasma = fromYmd(body.ulasmaGunu)
      ulasma.setHours(9)
      const t = db.tebligat.insert({
        mukellefId: m.id,
        vkn: (m.vkn ?? m.tckn)!,
        kurum: body.kurum === "SGK" ? "SGK" : "GIB",
        tur: body.tur,
        konu: body.konu.trim(),
        belgeNo: body.belgeNo?.trim() || undefined,
        ulasmaTarihi: ulasma.toISOString(),
        sureGun: body.sureGun,
        durum: "YENI",
        atananId: actor.id,
        kaynak: "ELLE",
        olusturmaTarihi: new Date().toISOString(),
      })
      logActivity(
        {
          aktorId: actor.id,
          eylem: "TEBLIGAT_ALINDI",
          hedefTip: "TEBLIGAT",
          hedefId: t.id,
          mukellefId: m.id,
          aciklama: tebligatAciklama(t),
        },
        false
      )
      return HttpResponse.json(tebligatView(t), { status: 201 })
    }
  ),

  http.patch<{ id: string }, TebligatGuncelleRequest>(
    api("/tebligat/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.tebligat.find(params.id)
      if (!t) return notFound("Tebligat bulunamadı")
      const body = await request.json()
      const hata = tebligatGuncelleHatasi(body)
      if (hata) return errorResponse(400, hata)
      const patch: Partial<Tebligat> = {}
      const degisiklik: string[] = []

      if (body.durum !== undefined) {
        if (body.durum !== t.durum) degisiklik.push("durum")
        patch.durum = body.durum
      }
      if (body.atananId !== undefined) {
        if (body.atananId !== null && !db.personel.find(body.atananId))
          return errorResponse(400, "Personel bulunamadı")
        patch.atananId = body.atananId ?? undefined
        if (body.atananId !== t.atananId) degisiklik.push("atanan")
      }
      if (body.not !== undefined) patch.not = body.not.trim() || undefined
      if (body.sureGun !== undefined) {
        patch.sureGun = body.sureGun ?? undefined
      }

      const guncel = db.tebligat.update(t.id, patch)!
      if (degisiklik.length)
        logActivity(
          {
            aktorId: actor.id,
            eylem: "TEBLIGAT_GUNCELLENDI",
            hedefTip: "TEBLIGAT",
            hedefId: t.id,
            mukellefId: guncel.mukellefId,
            aciklama: tebligatAciklama(guncel),
          },
          body.atananId && body.atananId !== t.atananId
            ? {
                alicilar: [body.atananId],
                baslik: "Bir e-Tebligat size atandı",
              }
            : false
        )
      return HttpResponse.json(tebligatView(guncel))
    }
  ),

  http.post<{ id: string }>(
    api("/tebligat/:id/gorev"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.tebligat.find(params.id)
      if (!t) return notFound("Tebligat bulunamadı")
      if (t.gorevId && db.gorev.find(t.gorevId))
        return errorResponse(409, "Bu tebligat için görev zaten var")
      const m = db.mukellef.find(t.mukellefId)!
      const v = tebligatView(t)
      const simdi = new Date().toISOString()
      const kural = SURE_KURALLARI[t.tur]
      const g = db.gorev.insert({
        baslik: `${TEBLIGAT_TUR_ETIKET[t.tur]}: ${t.konu}`,
        aciklama: [
          `e-Tebligat ${t.belgeNo ? `(${t.belgeNo}) ` : ""}tebliğ tarihi ${v.tebligTarihi}.`,
          kural.gun !== null
            ? `Süre içinde yapılacak: ${kural.islem}.`
            : undefined,
        ]
          .filter(Boolean)
          .join(" "),
        mukellefId: m.id,
        tip: "DIGER",
        atananId: t.atananId ?? m.sorumluPersonelId,
        durum: "YAPILACAK",
        oncelik: "YUKSEK",
        sonTarih: v.sonIslemTarihi ?? toYmd(addDays(fromYmd(bugun()), 7)),
        checklist: [],
        yorumlar: [],
        bagliTalepIdler: [],
        olusturanId: actor.id,
        olusturmaTarihi: simdi,
        guncellemeTarihi: simdi,
      })
      db.tebligat.update(t.id, {
        gorevId: g.id,
        durum: t.durum === "YENI" ? "INCELENDI" : t.durum,
      })
      logActivity({
        aktorId: actor.id,
        eylem: "GOREV_OLUSTURULDU",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: m.id,
        aciklama: g.baslik,
      })
      return HttpResponse.json(g, { status: 201 })
    }
  ),

  http.post<{ id: string }, TebligatBelgeRequest>(
    api("/tebligat/:id/belge"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const t = db.tebligat.find(params.id)
      if (!t) return notFound("Tebligat bulunamadı")
      const { dosya } = await request.json()
      const mimeType = DATA_URL_RE.exec(dosya?.dataUrl ?? "")?.[1]
      if (
        !mimeType ||
        !TEBLIGAT_BELGE_TURLERI.includes(mimeType)
      )
        return errorResponse(400, "PDF, PNG veya JPG yükleyin")
      const boyut = Math.round(
        ((dosya.dataUrl.length - dosya.dataUrl.indexOf(",")) * 3) / 4
      )
      if (boyut > MAKS_DOSYA)
        return errorResponse(400, "Dosya 10 MB'tan büyük olamaz")
      const kayit = db.arsiv.insert({
        mukellefId: t.mukellefId,
        kategori: "TEBLIGAT",
        ad: dosya.ad,
        mimeType,
        boyut,
        yukleyenId: actor.id,
        yuklemeTarihi: new Date().toISOString(),
        silindi: false,
      })
      await putBlob(kayit.id, dosya.dataUrl)
      const guncel = db.tebligat.update(t.id, { arsivDosyaId: kayit.id })!
      logActivity(
        {
          aktorId: actor.id,
          eylem: "ARSIV_YUKLENDI",
          hedefTip: "ARSIV",
          hedefId: kayit.id,
          mukellefId: t.mukellefId,
          aciklama: dosya.ad,
        },
        false
      )
      return HttpResponse.json(tebligatView(guncel), { status: 201 })
    }
  ),
]
