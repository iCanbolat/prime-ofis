import { HttpResponse, http } from "msw"

import { talepDurumu } from "@prime/shared/evrak-talebi/durum"
import {
  bahsedilenleriCoz,
  donemGorevleriniPlanla,
  gecikmisMi,
  otomatikGorevBasligi,
  tamamaTasiyabilirMi,
} from "@prime/shared/gorev/kurallar"
import {
  CHECKLIST_SABLONLARI,
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
  GOREV_ONCELIK_SIRASI,
  GOREV_TIP_ETIKET,
  GOREV_TIP_SIRASI,
  TAKVIM_SENKRON,
} from "@prime/shared/gorev/sabitler"
import { BEYAN_DURUM_SIRASI } from "@prime/shared/takvim/sabitler"
import { YUKUMLULUK_SIRASI } from "@prime/shared/takvim/kurallar"
import { takvimOlayId } from "@prime/shared/takvim/motor"
import { bugun } from "@prime/shared/lib/tarih"
import { bildirimUret } from "@/mocks/bildirim-kurallari"
import { db, newId } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
  turkishIncludes,
} from "@/mocks/handlers/common"
import { beyanDurumuOku, beyanDurumuYaz } from "@/mocks/handlers/takvim"
import type {
  DonemOlusturRequest,
  DonemOlusturResponse,
  DonemPlanRequest,
  GorevDetay,
  GorevGuncelleRequest,
  GorevOlusturRequest,
  GorevOzetResponse,
  GorevTasiRequest,
  GorevTopluRequest,
  GorevTopluResponse,
  GorevView,
  GorevYorumRequest,
} from "@prime/shared/types/api"
import type {
  Gorev,
  GorevChecklistMaddesi,
  GorevDurum,
  GorevTip,
  Personel,
} from "@prime/shared/types/domain"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const DONEM_RE = /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/
const MAKS_BASLIK = 200
const MAKS_METIN = 2000

export function gorevView(g: Gorev, bugunYmd: string = bugun()): GorevView {
  const m = db.mukellef.find(g.mukellefId)
  return {
    ...g,
    mukellefUnvan: m?.unvan ?? "",
    mukellefTur: m?.tur ?? "SAHIS",
    gecikti: gecikmisMi(g, bugunYmd),
  }
}

function gorevDetay(g: Gorev): GorevDetay {
  return {
    ...gorevView(g),
    bagliTalepler: g.bagliTalepIdler.flatMap((id) => {
      const t = db.talep.find(id)
      return t
        ? [
            {
              id: t.id,
              durum: talepDurumu(t),
              istenenler: t.istenenler,
              donem: t.donem,
              olusturmaTarihi: t.olusturmaTarihi,
            },
          ]
        : []
    }),
    beyanDurumu: g.otomatikAnahtar
      ? beyanDurumuOku(g.otomatikAnahtar)
      : undefined,
  }
}

const yetkisiz = () =>
  errorResponse(
    403,
    "Başkasına atanmış bir görevi yalnızca yönetici tamamlayabilir"
  )

/**
 * Görevi yeni sütuna taşır; "Tamam" yetkisini denetler, takvimdeki beyan durumunu
 * yalnızca ileri yönde günceller ve aktiviteye yazar. Yetki yoksa `null` döner.
 */
function durumDegistir(
  g: Gorev,
  durum: GorevDurum,
  actor: Personel
): Gorev | null {
  if (g.durum === durum) return g
  if (durum === "TAMAM" && !tamamaTasiyabilirMi(actor, g)) return null

  const simdi = new Date().toISOString()
  const guncel = db.gorev.update(g.id, {
    durum,
    guncellemeTarihi: simdi,
    tamamlanmaTarihi: durum === "TAMAM" ? simdi : undefined,
  })!
  logActivity({
    aktorId: actor.id,
    eylem: "GOREV_DURUMU_DEGISTI",
    hedefTip: "GOREV",
    hedefId: g.id,
    mukellefId: g.mukellefId,
    aciklama: `${g.baslik}: ${GOREV_DURUM_ETIKET[g.durum]} → ${GOREV_DURUM_ETIKET[durum]}`,
  })

  const hedef = TAKVIM_SENKRON[durum]
  if (g.otomatikAnahtar && hedef) {
    const mevcut = beyanDurumuOku(g.otomatikAnahtar)
    if (
      BEYAN_DURUM_SIRASI.indexOf(mevcut) < BEYAN_DURUM_SIRASI.indexOf(hedef)
    ) {
      beyanDurumuYaz(g.otomatikAnahtar, hedef, actor, " (görevden)")
    }
  }
  return guncel
}

function checklistBirlestir(
  eski: GorevChecklistMaddesi[],
  yeni: GorevChecklistMaddesi[],
  actor: Personel
): GorevChecklistMaddesi[] {
  const eskiMap = new Map(eski.map((m) => [m.id, m]))
  const simdi = new Date().toISOString()
  return yeni
    .filter((m) => m.metin.trim())
    .map((m) => {
      const onceki = eskiMap.get(m.id)
      const tamam = Boolean(m.tamam)
      const base = {
        id: m.id || newId("c"),
        metin: m.metin.trim().slice(0, MAKS_BASLIK),
        tamam,
      }
      if (!tamam) return base
      if (onceki?.tamam)
        return {
          ...base,
          tamamlayanId: onceki.tamamlayanId,
          tamamlanmaTarihi: onceki.tamamlanmaTarihi,
        }
      return { ...base, tamamlayanId: actor.id, tamamlanmaTarihi: simdi }
    })
}

function checklistOlustur(metinler: string[]): GorevChecklistMaddesi[] {
  return metinler
    .map((m) => m.trim())
    .filter(Boolean)
    .map((metin) => ({ id: newId("c"), metin, tamam: false }))
}

function degisiklikAciklamasi(
  eski: Gorev,
  yeni: Gorev,
  personelAdi: (id: string) => string
): string {
  const parcalar: string[] = []
  if (eski.baslik !== yeni.baslik) parcalar.push("başlık")
  if ((eski.aciklama ?? "") !== (yeni.aciklama ?? "")) parcalar.push("açıklama")
  if (eski.oncelik !== yeni.oncelik) parcalar.push("öncelik")
  if (eski.sonTarih !== yeni.sonTarih) parcalar.push("son tarih")
  if (eski.atananId !== yeni.atananId)
    parcalar.push(`atanan: ${personelAdi(yeni.atananId)}`)
  if (
    JSON.stringify(eski.bagliTalepIdler) !==
    JSON.stringify(yeni.bagliTalepIdler)
  )
    parcalar.push("bağlı talepler")
  const eskiMap = new Map(eski.checklist.map((m) => [m.id, m]))
  for (const m of yeni.checklist) {
    const o = eskiMap.get(m.id)
    if (!o) parcalar.push(`kontrol maddesi eklendi: “${m.metin}”`)
    else if (!o.tamam && m.tamam) parcalar.push(`“${m.metin}” tamamlandı`)
    else if (o.tamam && !m.tamam) parcalar.push(`“${m.metin}” geri alındı`)
  }
  if (yeni.checklist.length < eski.checklist.length)
    parcalar.push("kontrol maddesi silindi")
  return parcalar.join(", ")
}

const personelAdi = (id: string) => {
  const p = db.personel.find(id)
  return p ? `${p.ad} ${p.soyad}` : "—"
}

export const gorevHandlers = [
  http.get(api("/gorevler/ozet"), ({ request }) => {
    const atanan = new URL(request.url).searchParams.get("atanan")
    const bugunYmd = bugun()
    const acik = db.gorev.where(
      (g) => g.durum !== "TAMAM" && (!atanan || g.atananId === atanan)
    )
    const personel = new Map<string, { acik: number; geciken: number }>()
    let geciken = 0
    for (const g of acik) {
      const p = personel.get(g.atananId) ?? { acik: 0, geciken: 0 }
      p.acik++
      if (gecikmisMi(g, bugunYmd)) {
        p.geciken++
        geciken++
      }
      personel.set(g.atananId, p)
    }
    return HttpResponse.json<GorevOzetResponse>({
      acik: acik.length,
      geciken,
      personel: [...personel.entries()].map(([personelId, v]) => ({
        personelId,
        ...v,
      })),
    })
  }),

  http.get(api("/gorevler"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const atananlar = p.getAll("atanan")
    const mukellefId = p.get("mukellefId")
    const tipler = p.getAll("tip") as GorevTip[]
    const durumlar = p.getAll("durum") as GorevDurum[]
    const donem = p.get("donem")
    const geciken = p.get("geciken") === "true"
    const q = p.get("q")?.trim()
    const bugunYmd = bugun()

    const items = db.gorev
      .where(
        (g) =>
          (!atananlar.length || atananlar.includes(g.atananId)) &&
          (!mukellefId || g.mukellefId === mukellefId) &&
          (!tipler.length || tipler.includes(g.tip)) &&
          (!durumlar.length || durumlar.includes(g.durum)) &&
          (!donem || g.donem === donem)
      )
      .map((g) => gorevView(g, bugunYmd))
      .filter(
        (g) =>
          (!geciken || g.gecikti) &&
          (!q ||
            turkishIncludes(g.baslik, q) ||
            turkishIncludes(g.mukellefUnvan, q))
      )
      .sort(
        (a, b) =>
          a.sonTarih.localeCompare(b.sonTarih) ||
          GOREV_ONCELIK_SIRASI.indexOf(a.oncelik) -
            GOREV_ONCELIK_SIRASI.indexOf(b.oncelik) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR")
      )
    return HttpResponse.json(items)
  }),

  http.get<{ id: string }>(api("/gorevler/:id"), ({ params }) => {
    const g = db.gorev.find(params.id)
    if (!g) return notFound("Görev bulunamadı")
    return HttpResponse.json(gorevDetay(g))
  }),

  http.post<never, GorevOlusturRequest>(
    api("/gorevler"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()

      const baslik = body.baslik?.trim()
      if (!baslik || baslik.length > MAKS_BASLIK)
        return errorResponse(400, "Başlık zorunludur (en fazla 200 karakter)")
      const mukellef = db.mukellef.find(body.mukellefId)
      if (!mukellef) return notFound("Mükellef bulunamadı")
      if (!db.personel.find(body.atananId))
        return errorResponse(400, "Atanan personel bulunamadı")
      if (!GOREV_TIP_SIRASI.includes(body.tip))
        return errorResponse(400, "Geçersiz görev tipi")
      if (!GOREV_ONCELIK_SIRASI.includes(body.oncelik))
        return errorResponse(400, "Geçersiz öncelik")
      if (!YMD_RE.test(body.sonTarih ?? ""))
        return errorResponse(400, "Geçerli bir son tarih giriniz")
      if (body.donem && !DONEM_RE.test(body.donem))
        return errorResponse(400, "Geçersiz dönem")

      // Beyanname görevleri takvim olayına bağlanır; aynı dönem için ikinci görev açılmaz
      const otomatikAnahtar =
        body.tip !== "DIGER" && body.donem
          ? takvimOlayId(mukellef.id, body.tip, body.donem)
          : undefined
      if (otomatikAnahtar) {
        const mevcut = db.gorev.where(
          (g) => g.otomatikAnahtar === otomatikAnahtar
        )[0]
        if (mevcut)
          return errorResponse(
            409,
            `Bu dönem için zaten bir görev var: ${mevcut.baslik}`
          )
      }

      const simdi = new Date().toISOString()
      const g = db.gorev.insert({
        baslik,
        aciklama: body.aciklama?.trim().slice(0, MAKS_METIN) || undefined,
        mukellefId: mukellef.id,
        tip: body.tip,
        donem: body.donem || undefined,
        atananId: body.atananId,
        durum: "YAPILACAK",
        oncelik: body.oncelik,
        sonTarih: body.sonTarih,
        checklist: checklistOlustur(body.checklist ?? []),
        yorumlar: [],
        bagliTalepIdler: [],
        olusturanId: actor.id,
        olusturmaTarihi: simdi,
        guncellemeTarihi: simdi,
        otomatikAnahtar,
      })
      logActivity({
        aktorId: actor.id,
        eylem: "GOREV_OLUSTURULDU",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: `${g.baslik} → ${personelAdi(g.atananId)}`,
      })
      return HttpResponse.json(gorevView(g), { status: 201 })
    }
  ),

  http.post<never, GorevTopluRequest>(
    api("/gorevler/toplu"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { ids, durum, atananId } = await request.json()
      if (!Array.isArray(ids) || ids.length === 0)
        return errorResponse(400, "En az bir görev seçin")
      if (durum && !GOREV_DURUM_SIRASI.includes(durum))
        return errorResponse(400, "Geçersiz durum")
      if (atananId && !db.personel.find(atananId))
        return errorResponse(400, "Atanan personel bulunamadı")
      if (!durum && !atananId)
        return errorResponse(400, "Değişiklik belirtilmedi")

      const sonuc: GorevTopluResponse = { guncellenen: [], reddedilen: [] }
      for (const id of new Set(ids)) {
        let g = db.gorev.find(id)
        if (!g) continue
        if (atananId && g.atananId !== atananId) {
          g = db.gorev.update(g.id, {
            atananId,
            guncellemeTarihi: new Date().toISOString(),
          })!
          logActivity({
            aktorId: actor.id,
            eylem: "GOREV_ATANDI",
            hedefTip: "GOREV",
            hedefId: g.id,
            mukellefId: g.mukellefId,
            aciklama: `${g.baslik} → ${personelAdi(atananId)}`,
          })
        }
        if (durum && !durumDegistir(g, durum, actor)) {
          sonuc.reddedilen.push(g.id)
          continue
        }
        sonuc.guncellenen.push(g.id)
      }
      return HttpResponse.json(sonuc)
    }
  ),

  http.post<never, DonemPlanRequest>(
    api("/gorevler/donem/onizleme"),
    async ({ request }) => {
      const { tip, donem } = await request.json()
      if (!YUKUMLULUK_SIRASI.includes(tip) || !DONEM_RE.test(donem ?? ""))
        return errorResponse(400, "Geçerli bir tip ve dönem seçin")
      return HttpResponse.json(
        donemGorevleriniPlanla(
          db.mukellef.all(),
          tip,
          donem,
          mevcutAnahtarlar()
        )
      )
    }
  ),

  http.post<never, DonemOlusturRequest>(
    api("/gorevler/donem"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { tip, donem, mukellefIdler } = await request.json()
      if (!YUKUMLULUK_SIRASI.includes(tip) || !DONEM_RE.test(donem ?? ""))
        return errorResponse(400, "Geçerli bir tip ve dönem seçin")
      const secili = new Set(mukellefIdler ?? [])

      const plan = donemGorevleriniPlanla(
        db.mukellef.all(),
        tip,
        donem,
        mevcutAnahtarlar()
      ).filter((s) => secili.has(s.mukellefId))

      let olusturulan = 0
      const simdi = new Date().toISOString()
      for (const s of plan) {
        if (s.mevcutGorevId) continue
        db.gorev.insert({
          baslik: otomatikGorevBasligi(tip, donem),
          mukellefId: s.mukellefId,
          tip,
          donem,
          atananId: s.atananId,
          durum: "YAPILACAK",
          oncelik: "NORMAL",
          sonTarih: s.sonTarih,
          checklist: checklistOlustur(CHECKLIST_SABLONLARI[tip]),
          yorumlar: [],
          bagliTalepIdler: [],
          olusturanId: actor.id,
          olusturmaTarihi: simdi,
          guncellemeTarihi: simdi,
          otomatikAnahtar: takvimOlayId(s.mukellefId, tip, donem),
        })
        olusturulan++
      }
      const atlanan = plan.length - olusturulan
      if (olusturulan > 0) {
        logActivity({
          aktorId: actor.id,
          eylem: "DONEM_GOREVLERI_OLUSTURULDU",
          hedefTip: "GOREV",
          aciklama: `${GOREV_TIP_ETIKET[tip]} ${donem}: ${olusturulan} görev`,
        })
      }
      return HttpResponse.json<DonemOlusturResponse>({ olusturulan, atlanan })
    }
  ),

  http.patch<{ id: string }, GorevGuncelleRequest>(
    api("/gorevler/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gorev.find(params.id)
      if (!g) return notFound("Görev bulunamadı")
      const body = await request.json()

      const patch: Partial<Gorev> = {}
      if (body.baslik !== undefined) {
        const baslik = body.baslik.trim()
        if (!baslik || baslik.length > MAKS_BASLIK)
          return errorResponse(400, "Başlık zorunludur (en fazla 200 karakter)")
        patch.baslik = baslik
      }
      if (body.aciklama !== undefined)
        patch.aciklama = body.aciklama.trim().slice(0, MAKS_METIN) || undefined
      if (body.atananId !== undefined) {
        if (!db.personel.find(body.atananId))
          return errorResponse(400, "Atanan personel bulunamadı")
        patch.atananId = body.atananId
      }
      if (body.oncelik !== undefined) {
        if (!GOREV_ONCELIK_SIRASI.includes(body.oncelik))
          return errorResponse(400, "Geçersiz öncelik")
        patch.oncelik = body.oncelik
      }
      if (body.sonTarih !== undefined) {
        if (!YMD_RE.test(body.sonTarih))
          return errorResponse(400, "Geçerli bir son tarih giriniz")
        patch.sonTarih = body.sonTarih
      }
      if (body.checklist !== undefined) {
        if (!Array.isArray(body.checklist))
          return errorResponse(400, "Geçersiz kontrol listesi")
        patch.checklist = checklistBirlestir(g.checklist, body.checklist, actor)
      }
      if (body.bagliTalepIdler !== undefined) {
        const ids = [...new Set(body.bagliTalepIdler)]
        if (ids.some((id) => db.talep.find(id)?.mukellefId !== g.mukellefId))
          return errorResponse(
            400,
            "Yalnızca aynı mükellefin evrak talepleri bağlanabilir"
          )
        patch.bagliTalepIdler = ids
      }

      const guncel = db.gorev.update(g.id, {
        ...patch,
        guncellemeTarihi: new Date().toISOString(),
      })!
      const aciklama = degisiklikAciklamasi(g, guncel, personelAdi)
      if (aciklama) {
        logActivity({
          aktorId: actor.id,
          eylem:
            patch.atananId && patch.atananId !== g.atananId
              ? "GOREV_ATANDI"
              : "GOREV_GUNCELLENDI",
          hedefTip: "GOREV",
          hedefId: g.id,
          mukellefId: g.mukellefId,
          aciklama: `${guncel.baslik}: ${aciklama}`,
        })
      }
      return HttpResponse.json(gorevDetay(guncel))
    }
  ),

  http.post<{ id: string }, GorevTasiRequest>(
    api("/gorevler/:id/tasi"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gorev.find(params.id)
      if (!g) return notFound("Görev bulunamadı")
      const { durum } = await request.json()
      if (!GOREV_DURUM_SIRASI.includes(durum))
        return errorResponse(400, "Geçersiz durum")

      const guncel = durumDegistir(g, durum, actor)
      if (!guncel) return yetkisiz()
      return HttpResponse.json(gorevView(guncel))
    }
  ),

  http.post<{ id: string }, GorevYorumRequest>(
    api("/gorevler/:id/yorum"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const g = db.gorev.find(params.id)
      if (!g) return notFound("Görev bulunamadı")
      const metin = (await request.json()).metin?.trim()
      if (!metin || metin.length > MAKS_METIN)
        return errorResponse(400, "Yorum boş olamaz (en fazla 2000 karakter)")

      const bahsedilenler = bahsedilenleriCoz(
        metin,
        db.personel.where((p) => p.aktif)
      )
      const guncel = db.gorev.update(g.id, {
        yorumlar: [
          ...g.yorumlar,
          {
            id: newId("y"),
            yazarId: actor.id,
            metin,
            bahsedilenler,
            zaman: new Date().toISOString(),
          },
        ],
        guncellemeTarihi: new Date().toISOString(),
      })!
      const log = logActivity(
        {
          aktorId: actor.id,
          eylem: "GOREV_YORUMLANDI",
          hedefTip: "GOREV",
          hedefId: g.id,
          mukellefId: g.mukellefId,
          aciklama: bahsedilenler.length
            ? `${g.baslik} · ${bahsedilenler.map(personelAdi).join(", ")} anıldı`
            : g.baslik,
        },
        // Anılan atanana ayrıca "yorum" bildirimi gitmez
        {
          alicilar: bahsedilenler.includes(g.atananId) ? [] : [g.atananId],
        }
      )
      bildirimUret(
        { ...log, aciklama: `${g.baslik}: ${metin.slice(0, 140)}` },
        {
          tur: "GOREV_ANILDI",
          baslik: `${personelAdi(actor.id)} sizi bir yorumda andı`,
          alicilar: bahsedilenler,
        }
      )
      return HttpResponse.json(gorevDetay(guncel))
    }
  ),

  http.delete<{ id: string }>(api("/gorevler/:id"), ({ request, params }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const g = db.gorev.find(params.id)
    if (!g) return notFound("Görev bulunamadı")
    if (actor.rol !== "YONETICI" && g.olusturanId !== actor.id)
      return errorResponse(
        403,
        "Görevi yalnızca oluşturan kişi veya yönetici silebilir"
      )
    db.gorev.remove(g.id)
    logActivity(
      {
        aktorId: actor.id,
        eylem: "GOREV_SILINDI",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: g.baslik,
      },
      // Kayıt silindiği için atanan kuraldan çözülemez
      { alicilar: [g.atananId] }
    )
    return new HttpResponse(null, { status: 204 })
  }),
]

function mevcutAnahtarlar(): Map<string, string> {
  return new Map(
    db.gorev
      .where((g) => Boolean(g.otomatikAnahtar))
      .map((g) => [g.otomatikAnahtar!, g.id])
  )
}
