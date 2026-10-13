/**
 * `/api/tahsilat/*` — büronun mükelleflerle cari hesabı. Aylık ücret borçları istek anında
 * idempotent üretilir (gerçek backend'de ayın ilk günü çalışan zamanlanmış iş karşılığı).
 */
import { HttpResponse, http } from "msw"

import {
  acikBorclar,
  aylikSeri,
  borcKalanlari,
  cariDurum,
  dagitilmamis,
  fifoKapat,
  kapatmaHatasi,
  kesintiKarsilastir,
  ucretAnahtari,
  ucretBorcTarihi,
  ucretDonemleri,
  ucretHesapla,
  yaslandirma,
  yuvarla,
  type KesintiDurum,
} from "@prime/shared/tahsilat/kurallar"
import {
  acilisBakiyesiHatasi,
  hareketHatasi,
  kesintiIceAktarHatasi,
  ucretHatasi,
} from "@prime/shared/tahsilat/girdi"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import type {
  AcikBorcView,
  AcilisTopluRequest,
  BuroGuncelleRequest,
  CariEkstreResponse,
  CariHareketView,
  CariListResponse,
  CariSatiri,
  HareketEkleRequest,
  KesintiIceAktarRequest,
  KesintiRaporResponse,
  TahsilatOzetResponse,
  TopluAktarimSonucu,
  UcretKaydetRequest,
} from "@prime/shared/types/api"
import type { CariHareket, Mukellef, MukellefUcret } from "@prime/shared/types/domain"

export const SISTEM_AKTOR = "sistem"

/**
 * Ödemelerin dağıtılmamış kısmını (avans) en eski açık borçlara uygular. Yeni borç
 * eklendiğinde veya bir borç silinip kapatmaları çözüldüğünde çağrılır.
 */
export function avansUygula(mukellefId: string) {
  const hareketler = db.cari.where((h) => h.mukellefId === mukellefId)
  const odemeler = hareketler
    .filter((h) => h.tip === "ODEME" && dagitilmamis(h) > 0.005)
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
  for (const o of odemeler) {
    const acik = acikBorclar(db.cari.where((h) => h.mukellefId === mukellefId))
    if (acik.length === 0) return
    const yeni = fifoKapat(dagitilmamis(o), acik)
    if (yeni.length)
      db.cari.update(o.id, { kapatmalar: [...(o.kapatmalar ?? []), ...yeni] })
  }
}

/** Ücreti tanımlı aktif mükellefler için eksik aylık ücret borçlarını üretir (idempotent) */
export function ucretBorclariniUret(bugunYmd: string = bugun()) {
  const mevcut = new Set(
    db.cari.all().flatMap((h) => (h.otomatikAnahtar ? [h.otomatikAnahtar] : []))
  )
  const yeni: Omit<CariHareket, "id">[] = []
  for (const m of db.mukellef.where((m) => m.aktif && !!m.ucret)) {
    const u = m.ucret!
    const t = ucretHesapla(u.aylikBrut, u.kdvOrani, u.stopajVar)
    for (const donem of ucretDonemleri(u, bugunYmd)) {
      const anahtar = ucretAnahtari(m.id, donem)
      if (mevcut.has(anahtar)) continue
      yeni.push({
        mukellefId: m.id,
        tip: "BORC",
        kalem: "AYLIK_UCRET",
        donem,
        tarih: ucretBorcTarihi(donem),
        brut: t.brut,
        kdv: t.kdv,
        stopaj: t.stopaj,
        tutar: t.net,
        aciklama: `${formatDonem(donem)} hizmet bedeli`,
        otomatikAnahtar: anahtar,
        olusturanId: SISTEM_AKTOR,
        olusturmaTarihi: new Date().toISOString(),
      })
    }
  }
  if (yeni.length === 0) return
  db.cari.insertMany(yeni)
  for (const mukellefId of new Set(yeni.map((h) => h.mukellefId)))
    avansUygula(mukellefId)
}

function aktorAdi(id: string) {
  if (id === SISTEM_AKTOR) return "Otomatik"
  const p = db.personel.find(id)
  return p ? `${p.ad} ${p.soyad}` : "—"
}

function cariSatiri(
  m: Mukellef,
  hareketler: CariHareket[],
  bugunYmd: string
): CariSatiri {
  const sonOdeme = hareketler
    .filter((h) => h.tip === "ODEME" && h.kalem === "ODEME")
    .reduce<string | undefined>(
      (s, h) => (!s || h.tarih > s ? h.tarih : s),
      undefined
    )
  return {
    ...cariDurum(hareketler, bugunYmd),
    mukellefId: m.id,
    mukellefUnvan: m.unvan,
    mukellefTur: m.tur,
    sorumluPersonelId: m.sorumluPersonelId,
    ucret: m.ucret,
    sonOdeme,
  }
}

/** Aktif ya da hareketi olan tüm mükelleflerin cari satırları */
function cariSatirlari(
  bugunYmd: string,
  sorumlu?: string | null
): CariSatiri[] {
  const grup = new Map<string, CariHareket[]>()
  for (const h of db.cari.all())
    grup.set(h.mukellefId, [...(grup.get(h.mukellefId) ?? []), h])
  return db.mukellef
    .where(
      (m) =>
        (m.aktif || grup.has(m.id)) &&
        (!sorumlu || m.sorumluPersonelId === sorumlu)
    )
    .map((m) => cariSatiri(m, grup.get(m.id) ?? [], bugunYmd))
}

const bosKesintiOzeti = (): Record<KesintiDurum, number> => ({
  ESLESTI: 0,
  EKSIK: 0,
  FAZLA: 0,
  BILDIRILMEMIS: 0,
  KAYITSIZ: 0,
})

export const tahsilatHandlers = [
  http.get(api("/tahsilat/ozet"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const bugunYmd = bugun()
    ucretBorclariniUret(bugunYmd)
    const satirlar = cariSatirlari(bugunYmd, sorumlu)
    const mukellefIdler = new Set(satirlar.map((s) => s.mukellefId))
    const hareketler = db.cari.where((h) => mukellefIdler.has(h.mukellefId))
    const buAy = bugunYmd.slice(0, 7)
    const seri = aylikSeri(hareketler, bugunYmd)
    const buAySeri = seri.find((s) => s.donem === buAy)
    const acik = satirlar.flatMap((s) =>
      acikBorclar(hareketler.filter((h) => h.mukellefId === s.mukellefId))
    )
    const yanit: TahsilatOzetResponse = {
      toplamAlacak: yuvarla(
        satirlar.reduce((t, s) => t + Math.max(0, s.bakiye), 0)
      ),
      avans: yuvarla(satirlar.reduce((t, s) => t + Math.max(0, -s.bakiye), 0)),
      buAyTahakkuk: buAySeri?.tahakkuk ?? 0,
      buAyTahsilat: buAySeri?.tahsilat ?? 0,
      borcluMukellef: satirlar.filter((s) => s.acikBorc > 0).length,
      gecikenMukellef: satirlar.filter((s) => s.geciken).length,
      ucretliMukellef: satirlar.filter((s) => s.ucret).length,
      yaslandirma: yaslandirma(acik, bugunYmd),
      aylik: seri,
      enGecikenler: satirlar
        .filter((s) => s.geciken)
        .sort((a, b) => b.gecikmeGun - a.gecikmeGun || b.acikBorc - a.acikBorc)
        .slice(0, 5),
    }
    return HttpResponse.json(yanit)
  }),

  http.get(api("/tahsilat/cari"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const q = p.get("q")?.trim() ?? ""
    const bugunYmd = bugun()
    ucretBorclariniUret(bugunYmd)
    const filtrelenen = cariSatirlari(bugunYmd, p.get("sorumlu")).filter(
      (s) =>
        (!q ||
          turkishIncludes(s.mukellefUnvan, q) ||
          Boolean(
            db.mukellef.find(s.mukellefId)?.vkn?.includes(q) ||
            db.mukellef.find(s.mukellefId)?.tckn?.includes(q)
          )) &&
        (p.get("geciken") !== "true" || s.geciken) &&
        (p.get("bakiyeli") !== "true" || Math.abs(s.bakiye) > 0.005)
    )
    const sirala = p.get("sirala")
    const yon = p.get("yon") === "asc" ? 1 : -1
    filtrelenen.sort((a, b) => {
      if (sirala === "unvan")
        return -yon * a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      if (sirala === "bakiye") return yon * (a.bakiye - b.bakiye)
      return (
        yon * (a.gecikmeGun - b.gecikmeGun) ||
        yon * (a.bakiye - b.bakiye) ||
        a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr")
      )
    })
    const sayfaBoyutu = Math.min(
      Math.max(Number(p.get("sayfaBoyutu")) || 20, 1),
      100
    )
    const sonSayfa = Math.max(Math.ceil(filtrelenen.length / sayfaBoyutu), 1)
    const sayfa = Math.min(Math.max(Number(p.get("sayfa")) || 1, 1), sonSayfa)
    const yanit: CariListResponse = {
      items: filtrelenen.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtrelenen.length,
      sayfa,
      sayfaBoyutu,
      toplamBakiye: yuvarla(filtrelenen.reduce((t, s) => t + s.bakiye, 0)),
    }
    return HttpResponse.json(yanit)
  }),

  http.get<{ mukellefId: string }>(
    api("/tahsilat/cari/:mukellefId"),
    ({ params }) => {
      const m = db.mukellef.find(params.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      const bugunYmd = bugun()
      ucretBorclariniUret(bugunYmd)
      const hareketler = db.cari
        .where((h) => h.mukellefId === m.id)
        .sort(
          (a, b) =>
            a.tarih.localeCompare(b.tarih) ||
            (a.tip === b.tip ? 0 : a.tip === "BORC" ? -1 : 1) ||
            a.olusturmaTarihi.localeCompare(b.olusturmaTarihi)
        )
      const kalanlar = borcKalanlari(hareketler)
      let yuruyen = 0
      const views = hareketler.map((h): CariHareketView => {
        yuruyen = yuvarla(yuruyen + (h.tip === "BORC" ? h.tutar : -h.tutar))
        return {
          ...h,
          olusturanAd: aktorAdi(h.olusturanId),
          kalan: h.tip === "BORC" ? kalanlar.get(h.id) : undefined,
          dagitilmamis: h.tip === "ODEME" ? dagitilmamis(h) : undefined,
          bakiyeSonrasi: yuruyen,
        }
      })
      const byId = new Map(hareketler.map((h) => [h.id, h]))
      const yanit: CariEkstreResponse = {
        mukellefId: m.id,
        mukellefUnvan: m.unvan,
        ucret: m.ucret,
        durum: cariDurum(hareketler, bugunYmd),
        hareketler: views,
        acikBorclar: acikBorclar(hareketler).map((b): AcikBorcView => {
          const h = byId.get(b.id)!
          return {
            ...b,
            tutar: h.tutar,
            kalem: h.kalem,
            donem: h.donem,
            aciklama: h.aciklama,
          }
        }),
        avans: yuvarla(
          hareketler
            .filter((h) => h.tip === "ODEME")
            .reduce((t, h) => t + dagitilmamis(h), 0)
        ),
      }
      return HttpResponse.json(yanit)
    }
  ),

  http.post<never, HareketEkleRequest>(
    api("/tahsilat/hareketler"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      const hata = hareketHatasi(body, bugun())
      if (hata) return errorResponse(400, hata)
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      // Ödeme dağıtılmadan önce bu ayın ücret borcu oluşmuş olsun
      ucretBorclariniUret()
      const zaman = new Date().toISOString()

      if (body.tip === "BORC") {
        const t = ucretHesapla(body.brut, body.kdvOrani, body.stopajVar)
        const kayit = db.cari.insert({
          mukellefId: m.id,
          tip: "BORC",
          kalem: "EK_HIZMET",
          tarih: body.tarih,
          brut: t.brut,
          kdv: t.kdv,
          stopaj: t.stopaj,
          tutar: t.net,
          aciklama: body.aciklama.trim(),
          makbuzNo: body.makbuzNo?.trim() || undefined,
          olusturanId: actor.id,
          olusturmaTarihi: zaman,
        })
        avansUygula(m.id)
        logActivity({
          aktorId: actor.id,
          eylem: "TAHSILAT_BORC_EKLENDI",
          hedefTip: "TAHSILAT",
          hedefId: kayit.id,
          mukellefId: m.id,
          aciklama: `${kayit.aciklama} · ${formatTRY(kayit.tutar)}`,
        })
        return HttpResponse.json(db.cari.find(kayit.id), { status: 201 })
      }

      const acik = acikBorclar(db.cari.where((h) => h.mukellefId === m.id))
      const tutar = yuvarla(body.tutar)
      let kapatmalar = body.kapatmalar
      if (kapatmalar) {
        kapatmalar = kapatmalar.map((k) => ({ ...k, tutar: yuvarla(k.tutar) }))
        const kHata = kapatmaHatasi(tutar, kapatmalar, acik)
        if (kHata) return errorResponse(400, kHata)
      } else kapatmalar = fifoKapat(tutar, acik)

      const kayit = db.cari.insert({
        mukellefId: m.id,
        tip: "ODEME",
        kalem: body.kalem,
        tarih: body.tarih,
        brut: 0,
        kdv: 0,
        stopaj: 0,
        tutar,
        aciklama: body.aciklama?.trim() || undefined,
        makbuzNo: body.makbuzNo?.trim() || undefined,
        kapatmalar,
        olusturanId: actor.id,
        olusturmaTarihi: zaman,
      })
      logActivity({
        aktorId: actor.id,
        eylem: "TAHSILAT_ODEME_ALINDI",
        hedefTip: "TAHSILAT",
        hedefId: kayit.id,
        mukellefId: m.id,
        aciklama: `${body.kalem === "DUZELTME" ? "Alacak düzeltmesi" : "Ödeme"} · ${formatTRY(tutar)}`,
      })
      return HttpResponse.json(kayit, { status: 201 })
    }
  ),

  http.delete<{ id: string }>(
    api("/tahsilat/hareketler/:id"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Cari hareketleri yalnızca yönetici silebilir"
        )
      const h = db.cari.find(params.id)
      if (!h) return notFound("Hareket bulunamadı")
      if (h.kalem === "AYLIK_UCRET")
        return errorResponse(
          409,
          "Otomatik aylık ücret borcu silinemez; alacak düzeltmesi ekleyin"
        )

      db.cari.remove(h.id)
      if (h.tip === "BORC") {
        // Bu borcu kapatan ödemelerin payı avansa döner, sonra açık borçlara yeniden dağılır
        for (const o of db.cari.where(
          (o) =>
            o.tip === "ODEME" && !!o.kapatmalar?.some((k) => k.borcId === h.id)
        )) {
          db.cari.update(o.id, {
            kapatmalar: o.kapatmalar!.filter((k) => k.borcId !== h.id),
          })
        }
        avansUygula(h.mukellefId)
      }
      logActivity(
        {
          aktorId: actor.id,
          eylem: "TAHSILAT_HAREKET_SILINDI",
          hedefTip: "TAHSILAT",
          mukellefId: h.mukellefId,
          aciklama: `${h.aciklama ?? (h.tip === "BORC" ? "Borç" : "Ödeme")} · ${formatTRY(h.tutar)}`,
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),

  /**
   * Hızlı başlangıç: aylık ücret + açılış bakiyesi. Açılış bakiyesi mükellef başına bir kez
   * yazılır (tekrar aktarımda atlanır); tanımlı ücret yalnızca `uzerineYaz` ile değişir.
   */
  http.post<never, AcilisTopluRequest>(
    api("/tahsilat/acilis-toplu"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(
          403,
          "Ücret ve bakiyeleri yalnızca yönetici aktarabilir"
        )
      const { uzerineYaz, kayitlar } = await request.json()
      if (!Array.isArray(kayitlar) || kayitlar.length === 0)
        return errorResponse(400, "Aktarılacak kayıt yok")

      // Bugüne kadarki aylar mevcut ücretlerle kesinleşsin
      ucretBorclariniUret()
      const sonuc: TopluAktarimSonucu = {
        olusturulan: 0,
        guncellenen: 0,
        atlanan: 0,
        hatalar: [],
      }
      const zaman = new Date().toISOString()
      for (const k of kayitlar) {
        const m = db.mukellef.find(k.mukellefId)
        const b = k.bakiye
        const hata = !m
          ? "Mükellef bulunamadı"
          : (k.ucret && ucretHatasi(k.ucret)) ||
            (b && acilisBakiyesiHatasi(b)) ||
            null
        if (!m || hata) {
          sonuc.hatalar.push({
            satir: k.satir,
            mesaj: hata || "Geçersiz kayıt",
          })
          continue
        }

        let degisti = false
        let yeniKayit = false
        if (k.ucret && (!m.ucret || uzerineYaz)) {
          const ucret: MukellefUcret = {
            aylikBrut: yuvarla(k.ucret.aylikBrut),
            kdvOrani: k.ucret.kdvOrani,
            stopajVar: k.ucret.stopajVar,
            baslangicDonem: k.ucret.baslangicDonem,
          }
          db.mukellef.update(m.id, { ucret })
          logActivity(
            {
              aktorId: actor.id,
              eylem: "UCRET_GUNCELLENDI",
              hedefTip: "MUKELLEF",
              hedefId: m.id,
              mukellefId: m.id,
              aciklama: `Aylık ${formatTRY(ucret.aylikBrut)} + KDV (içe aktarım)`,
            },
            false
          )
          degisti = true
          yeniKayit ||= !m.ucret
        }

        const acilisVar = db.cari.count(
          (h) => h.mukellefId === m.id && h.kalem === "ACILIS"
        )
        const tutar = b ? yuvarla(b.tutar) : 0
        if (b && tutar !== 0 && acilisVar === 0) {
          const borc = tutar > 0
          const kayit = db.cari.insert({
            mukellefId: m.id,
            tip: borc ? "BORC" : "ODEME",
            kalem: "ACILIS",
            tarih: b.tarih,
            brut: borc ? tutar : 0,
            kdv: 0,
            stopaj: 0,
            tutar: Math.abs(tutar),
            aciklama: "Açılış bakiyesi",
            kapatmalar: borc
              ? undefined
              : fifoKapat(
                  -tutar,
                  acikBorclar(db.cari.where((h) => h.mukellefId === m.id))
                ),
            olusturanId: actor.id,
            olusturmaTarihi: zaman,
          })
          if (borc) avansUygula(m.id)
          logActivity(
            {
              aktorId: actor.id,
              eylem: borc ? "TAHSILAT_BORC_EKLENDI" : "TAHSILAT_ODEME_ALINDI",
              hedefTip: "TAHSILAT",
              hedefId: kayit.id,
              mukellefId: m.id,
              aciklama: `Açılış bakiyesi · ${formatTRY(tutar)}`,
            },
            false
          )
          degisti = true
          yeniKayit = true
        }

        if (!degisti) sonuc.atlanan++
        else if (yeniKayit) sonuc.olusturulan++
        else sonuc.guncellenen++
      }
      // Yeni ücretlerin başlangıç döneminden bugüne kadarki borçları
      ucretBorclariniUret()
      return HttpResponse.json(sonuc)
    }
  ),

  http.put<{ id: string }, UcretKaydetRequest>(
    api("/mukellefler/:id/ucret"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (actor.rol !== "YONETICI")
        return errorResponse(403, "Ücreti yalnızca yönetici değiştirebilir")
      const m = db.mukellef.find(params.id)
      if (!m) return notFound("Mükellef bulunamadı")
      const { ucret } = await request.json()
      if (ucret) {
        const hata = ucretHatasi(ucret)
        if (hata) return errorResponse(400, hata)
      }
      // Bugüne kadarki aylar eski ücretle kesinleşsin; yeni ücret sonraki aylara uygulanır
      ucretBorclariniUret()
      const yeni: MukellefUcret | undefined = ucret
        ? {
            aylikBrut: yuvarla(ucret.aylikBrut),
            kdvOrani: ucret.kdvOrani,
            stopajVar: ucret.stopajVar,
            baslangicDonem: ucret.baslangicDonem,
          }
        : undefined
      const guncel = db.mukellef.update(m.id, { ucret: yeni })!
      // Geçmiş dönemlerin borçları değişmez; eksik dönemler yeni ücretle üretilir
      ucretBorclariniUret()
      logActivity(
        {
          aktorId: actor.id,
          eylem: "UCRET_GUNCELLENDI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: yeni
            ? `Aylık ${formatTRY(yeni.aylikBrut)} + KDV`
            : "Aylık ücret kaldırıldı",
        },
        false
      )
      return HttpResponse.json(guncel)
    }
  ),

  http.get(api("/tahsilat/kesinti"), ({ request }) => {
    const aktarimlar = db.kesintiAktarim.all()
    const yillar = [...new Set(aktarimlar.map((a) => a.yil))].sort(
      (a, b) => b - a
    )
    const yilParam = Number(new URL(request.url).searchParams.get("yil"))
    const yil =
      yilParam >= 2000 && yilParam <= 2100
        ? yilParam
        : (yillar[0] ?? Number(bugun().slice(0, 4)))
    const aktarim = aktarimlar.find((a) => a.yil === yil)
    ucretBorclariniUret()
    const satirlar = aktarim
      ? kesintiKarsilastir(
          db.cari.all(),
          db.mukellef.all(),
          db.kesinti.where((k) => k.iceAktarimId === aktarim.id),
          yil
        )
      : []
    const ozet = bosKesintiOzeti()
    for (const s of satirlar) ozet[s.durum]++
    const yanit: KesintiRaporResponse = {
      yil,
      iceAktarim: aktarim && {
        ...aktarim,
        yukleyenAd: aktorAdi(aktarim.yukleyenId),
      },
      satirlar,
      ozet,
      yillar,
    }
    return HttpResponse.json(yanit)
  }),

  http.post<never, KesintiIceAktarRequest>(
    api("/tahsilat/kesinti/ice-aktar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { yil, dosyaAdi, kayitlar } = await request.json()
      const hata = kesintiIceAktarHatasi(yil, kayitlar)
      if (hata) return errorResponse(400, hata)

      // Aynı yıl için yeniden yükleme öncekinin yerine geçer
      for (const eski of db.kesintiAktarim.where((a) => a.yil === yil)) {
        for (const k of db.kesinti.where((k) => k.iceAktarimId === eski.id))
          db.kesinti.remove(k.id)
        db.kesintiAktarim.remove(eski.id)
      }
      const aktarim = db.kesintiAktarim.insert({
        yil,
        dosyaAdi: dosyaAdi || "kesinti-listesi",
        satirSayisi: kayitlar.length,
        yukleyenId: actor.id,
        zaman: new Date().toISOString(),
      })
      db.kesinti.insertMany(
        kayitlar.map((k) => ({
          iceAktarimId: aktarim.id,
          vkn: k.vkn,
          unvan: k.unvan ?? "",
          donem: k.donem,
          matrah: yuvarla(k.matrah ?? 0),
          kesinti: yuvarla(k.kesinti),
        }))
      )
      logActivity(
        {
          aktorId: actor.id,
          eylem: "KESINTI_ICE_AKTARILDI",
          aciklama: `${yil} · ${kayitlar.length} satır`,
        },
        false
      )
      return HttpResponse.json(
        { ...aktarim, yukleyenAd: aktorAdi(actor.id) },
        { status: 201 }
      )
    }
  ),

  http.patch<never, BuroGuncelleRequest>(api("/buro"), async ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    if (actor.rol !== "YONETICI")
      return errorResponse(
        403,
        "Büro bilgilerini yalnızca yönetici değiştirebilir"
      )
    const [buro] = db.buro.all()
    if (!buro) return notFound("Büro bilgisi bulunamadı")
    const { iban } = await request.json()
    const temiz = iban?.replace(/\s/g, "").toUpperCase() || undefined
    if (temiz && !/^TR\d{24}$/.test(temiz))
      return errorResponse(400, "Geçerli bir TR IBAN girin")
    const guncel = db.buro.update(buro.id, { iban: temiz })!
    logActivity(
      { aktorId: actor.id, eylem: "BURO_GUNCELLENDI", aciklama: "IBAN" },
      false
    )
    return HttpResponse.json(guncel)
  }),
]
