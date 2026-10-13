import { differenceInCalendarDays, addDays, subMonths } from "date-fns"
import { HttpResponse, http } from "msw"

import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import {
  donemEtiketi,
  takvimOlayId,
  uygulananTipler,
  yukumlulukleriHesapla,
} from "@prime/shared/takvim/motor"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import type {
  TakvimDurumFiltre,
  TakvimDurumGuncelleRequest,
  TakvimOlayi,
  TakvimOzetResponse,
} from "@prime/shared/types/api"
import type {
  BeyanDurumu,
  MukellefTur,
  Personel,
  YukumlulukTip,
} from "@prime/shared/types/domain"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const DURUMLAR: BeyanDurumu[] = ["BEKLIYOR", "HAZIRLANDI", "ONAYLANDI"]
const DURUM_ETIKET: Record<BeyanDurumu, string> = {
  BEKLIYOR: "Bekliyor",
  HAZIRLANDI: "Hazırlandı",
  ONAYLANDI: "Onaylandı",
}
const MAKS_ARALIK_GUN = 400

interface Filtre {
  baslangic: string
  bitis: string
  mukellefId?: string | null
  tipler?: YukumlulukTip[]
  turler?: MukellefTur[]
  sorumlu?: string | null
  durum?: TakvimDurumFiltre | null
}

/** Aktif mükellefler için kural motorunu çalıştırır ve saklanan durumlarla birleştirir. */
export function olaylariHesapla(
  f: Filtre,
  bugunYmd: string = bugun()
): TakvimOlayi[] {
  const mukellefler = db.mukellef.where(
    (m) =>
      m.aktif &&
      (!f.mukellefId || m.id === f.mukellefId) &&
      (!f.turler?.length || f.turler.includes(m.tur)) &&
      (!f.sorumlu || m.sorumluPersonelId === f.sorumlu)
  )
  const durumlar = new Map(db.takvim.all().map((d) => [d.id, d]))
  const gorevler = new Map(
    db.gorev
      .where((g) => Boolean(g.otomatikAnahtar))
      .map((g) => [g.otomatikAnahtar!, g])
  )

  const olaylar: TakvimOlayi[] = []
  for (const m of mukellefler) {
    for (const y of yukumlulukleriHesapla(m, f)) {
      if (f.tipler?.length && !f.tipler.includes(y.tip)) continue
      const id = takvimOlayId(m.id, y.tip, y.donem)
      const kayit = durumlar.get(id)
      const durum = kayit?.durum ?? "BEKLIYOR"
      const gecikti = y.sonTarih < bugunYmd && durum !== "ONAYLANDI"
      if (f.durum) {
        if (f.durum === "gecikti" ? !gecikti : durum !== f.durum.toUpperCase())
          continue
      }
      olaylar.push({
        id,
        mukellefId: m.id,
        mukellefUnvan: m.unvan,
        mukellefTur: m.tur,
        sorumluPersonelId: m.sorumluPersonelId,
        ...y,
        durum,
        gecikti,
        guncelleyenId: kayit?.guncelleyenId,
        guncellemeTarihi: kayit?.guncellemeTarihi,
        gorevId: gorevler.get(id)?.id,
        gorevDurum: gorevler.get(id)?.durum,
      })
    }
  }

  return olaylar.sort(
    (a, b) =>
      a.sonTarih.localeCompare(b.sonTarih) ||
      a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR")
  )
}

/**
 * Takvim olayının beyan durumunu yazar ve aktiviteye kaydeder. id = `${mukellefId}:${tip}:${donem}`.
 * "Bekliyor" varsayılan durumdur: kayıt silinir. Görev taşıma senkronu da bunu kullanır.
 */
export function beyanDurumuYaz(
  id: string,
  durum: BeyanDurumu,
  actor: Personel,
  aciklamaEki = ""
) {
  const [mukellefId, tip, donem] = id.split(":") as [
    string,
    YukumlulukTip,
    string,
  ]
  if (durum === "BEKLIYOR") {
    db.takvim.remove(id)
  } else {
    const kayit = {
      mukellefId,
      tip,
      donem,
      durum,
      guncelleyenId: actor.id,
      guncellemeTarihi: new Date().toISOString(),
    }
    if (db.takvim.find(id)) db.takvim.update(id, kayit)
    else db.takvim.insert({ id, ...kayit })
  }

  logActivity({
    aktorId: actor.id,
    eylem: "BEYAN_DURUMU_GUNCELLENDI",
    hedefTip: "TAKVIM",
    hedefId: id,
    mukellefId,
    aciklama: `${YUKUMLULUK_TANIMLARI[tip].kisaAd} ${donemEtiketi(donem)}: ${DURUM_ETIKET[durum]}${aciklamaEki}`,
  })
}

/** Takvimdeki mevcut beyan durumu (kayıt yoksa "Bekliyor") */
export function beyanDurumuOku(id: string): BeyanDurumu {
  return db.takvim.find(id)?.durum ?? "BEKLIYOR"
}

export const takvimHandlers = [
  http.get(api("/takvim/ozet"), ({ request }) => {
    const sorumlu = new URL(request.url).searchParams.get("sorumlu")
    const bugunYmd = bugun()
    const haftaSonu = toYmd(addDays(fromYmd(bugunYmd), 7))

    // Son 6 ay + gelecek 2 ay tek hesaplamada
    const tumu = olaylariHesapla({
      baslangic: toYmd(subMonths(fromYmd(bugunYmd), 6)),
      bitis: toYmd(addDays(fromYmd(bugunYmd), 62)),
      sorumlu,
    })
    const acik = tumu.filter((o) => o.durum !== "ONAYLANDI")
    const ayBaslangic = `${bugunYmd.slice(0, 7)}-01`

    const personelMap = new Map<string, { acik: number; geciken: number }>()
    for (const o of acik) {
      if (o.sonTarih > haftaSonu && !o.gecikti) continue
      const p = personelMap.get(o.sorumluPersonelId) ?? { acik: 0, geciken: 0 }
      p.acik++
      if (o.gecikti) p.geciken++
      personelMap.set(o.sorumluPersonelId, p)
    }

    const onayBekleyenListe = tumu.filter(
      (o) => o.durum === "HAZIRLANDI" && o.sonTarih >= ayBaslangic
    )
    const gunlukAdet = new Map<string, number>()
    for (const o of acik)
      gunlukAdet.set(o.sonTarih, (gunlukAdet.get(o.sonTarih) ?? 0) + 1)
    const yogunluk = Array.from({ length: 14 }, (_, i) => {
      const tarih = toYmd(addDays(fromYmd(bugunYmd), i))
      return { tarih, adet: gunlukAdet.get(tarih) ?? 0 }
    })

    return HttpResponse.json<TakvimOzetResponse>({
      bugun: bugunYmd,
      buHafta: acik.filter(
        (o) => o.sonTarih >= bugunYmd && o.sonTarih <= haftaSonu
      ),
      geciken: acik.filter((o) => o.gecikti),
      onayBekleyen: onayBekleyenListe.length,
      onayBekleyenListe,
      yogunluk,
      personel: [...personelMap.entries()].map(([personelId, v]) => ({
        personelId,
        ...v,
      })),
    })
  }),

  http.get(api("/takvim"), ({ request }) => {
    const p = new URL(request.url).searchParams
    const baslangic = p.get("baslangic") ?? ""
    const bitis = p.get("bitis") ?? ""
    if (!YMD_RE.test(baslangic) || !YMD_RE.test(bitis) || baslangic > bitis) {
      return errorResponse(
        400,
        "Geçerli bir tarih aralığı giriniz (baslangic, bitis)"
      )
    }
    if (
      differenceInCalendarDays(fromYmd(bitis), fromYmd(baslangic)) >
      MAKS_ARALIK_GUN
    ) {
      return errorResponse(
        400,
        `Tarih aralığı en fazla ${MAKS_ARALIK_GUN} gün olabilir`
      )
    }

    return HttpResponse.json(
      olaylariHesapla({
        baslangic,
        bitis,
        mukellefId: p.get("mukellefId"),
        tipler: p.getAll("tip") as YukumlulukTip[],
        turler: p.getAll("tur") as MukellefTur[],
        sorumlu: p.get("sorumlu"),
        durum: p.get("durum") as TakvimDurumFiltre | null,
      })
    )
  }),

  http.patch<{ id: string }, TakvimDurumGuncelleRequest>(
    api("/takvim/:id"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor

      const id = decodeURIComponent(params.id)
      const [mukellefId, tip, donem] = id.split(":") as [
        string,
        YukumlulukTip,
        string,
      ]
      const mukellef = db.mukellef.find(mukellefId)
      if (!mukellef) return notFound("Mükellef bulunamadı")
      if (
        !uygulananTipler(mukellef).includes(tip) ||
        !/^\d{4}(-\d{2}|-Q[1-4])?$/.test(donem ?? "")
      ) {
        return notFound("Bu mükellef için böyle bir yükümlülük yok")
      }

      const { durum } = await request.json()
      if (!DURUMLAR.includes(durum)) return errorResponse(400, "Geçersiz durum")

      beyanDurumuYaz(id, durum, actor)
      return HttpResponse.json({ id, durum })
    }
  ),
]
