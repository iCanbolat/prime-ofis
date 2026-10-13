import { HttpResponse, http } from "msw"
import { addDays, getISOWeek, getISOWeekYear } from "date-fns"

import { gecerlilikDurumu, kalanGun } from "@prime/shared/arsiv/kurallar"
import { YANIT_UYARI_GUN } from "@prime/shared/e-belge/kurallar"
import { HAREKET_TUR_ETIKET } from "@prime/shared/bordro/hareket-kurallari"
import { sonBordroDonemleri } from "@prime/shared/bordro/kurallar"
import { gecikmisMi } from "@prime/shared/gorev/kurallar"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { bugun, fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { bildirimGorunurMu } from "@/mocks/bildirim-kurallari"
import { db } from "@/mocks/db"
import { bildirimGonderimleri } from "@/mocks/gonderim"
import { api, notFound, requireActor } from "@/mocks/handlers/common"
import {
  bordroMukellefleri,
  bordroSatiri,
  hareketView,
} from "@/mocks/handlers/bordro-islemleri"
import { ebelgeView } from "@/mocks/handlers/e-belge"
import { cariDurum } from "@prime/shared/tahsilat/kurallar"
import { sureDurumu } from "@prime/shared/tebligat/kurallar"
import { TEBLIGAT_TUR_ETIKET } from "@prime/shared/tebligat/sabitler"
import { olaylariHesapla } from "@/mocks/handlers/takvim"
import type { BildirimListResponse, BildirimView } from "@prime/shared/types/api"
import type { Bildirim, CariHareket } from "@prime/shared/types/domain"
import { ARSIV_KATEGORI_ETIKET } from "@prime/shared/types/domain"

/** Belge geçerliliği için hatırlatma penceresi (gün): dolmadan önce ve dolduktan sonra */
const GECERLILIK_PENCERE_GUN = 7
/** Beyan son gününe kaç gün kala hatırlatılır */
const BEYAN_PENCERE_GUN = 3

type Hatirlatma = Omit<Bildirim, "id" | "okuyanlar" | "zaman"> & {
  anahtar: string
}

/**
 * Zamana bağlı hatırlatmalar. Her istekte hesaplanır; `anahtar` sayesinde her durum için
 * yalnızca bir kez bildirim üretilir (gerçek backend'de zamanlanmış iş karşılığıdır).
 */
export function hatirlatmalariUret(bugunYmd: string = bugun()) {
  const mevcut = new Set(
    db.bildirim.all().flatMap((b) => (b.anahtar ? [b.anahtar] : []))
  )
  const yeni: Hatirlatma[] = []
  const ekle = (h: Hatirlatma) => {
    if (mevcut.has(h.anahtar)) return
    mevcut.add(h.anahtar)
    yeni.push(h)
  }

  for (const g of db.gorev.where((g) => gecikmisMi(g, bugunYmd))) {
    ekle({
      tur: "GOREV_GECIKTI",
      anahtar: `GOREV_GECIKTI:${g.id}:${g.sonTarih}`,
      aliciId: g.atananId,
      baslik: "Görevin son tarihi geçti",
      aciklama: g.baslik,
      link: `/gorevler?gorev=${g.id}`,
      mukellefId: g.mukellefId,
      hedefTip: "GOREV",
      hedefId: g.id,
    })
  }

  for (const d of db.arsiv.where((d) => !d.silindi && !!d.gecerlilikTarihi)) {
    const kalan = kalanGun(d.gecerlilikTarihi!, bugunYmd)
    if (Math.abs(kalan) > GECERLILIK_PENCERE_GUN) continue
    const m = db.mukellef.find(d.mukellefId)
    if (!m?.aktif) continue
    const durum = gecerlilikDurumu(d.gecerlilikTarihi!, bugunYmd)
    ekle({
      tur: "BELGE_GECERLILIK",
      anahtar: `BELGE_GECERLILIK:${d.id}:${d.gecerlilikTarihi}:${durum}`,
      aliciId: m.sorumluPersonelId,
      baslik:
        durum === "DOLDU"
          ? "Belgenin geçerlilik süresi doldu"
          : kalan === 0
            ? "Belgenin geçerliliği bugün doluyor"
            : `Belgenin geçerliliği ${kalan} gün içinde doluyor`,
      aciklama: `${m.unvan} · ${ARSIV_KATEGORI_ETIKET[d.kategori]}`,
      link: `/arsiv?mukellef=${m.id}&kategori=${d.kategori}`,
      mukellefId: m.id,
      hedefTip: "ARSIV",
      hedefId: d.id,
    })
  }

  const simdi = new Date()
  for (const e of db.ebelge.where(
    (e) => e.yon === "GELEN" && e.senaryo === "TICARI"
  )) {
    const v = ebelgeView(e, simdi)
    if (v.yanit !== "BEKLIYOR" || (v.yanitKalanGun ?? 99) > YANIT_UYARI_GUN)
      continue
    const m = db.mukellef.find(e.mukellefId)
    if (!m) continue
    ekle({
      tur: "EFATURA_YANIT_SURESI",
      anahtar: `EFATURA_YANIT_SURESI:${e.id}`,
      aliciId: m.sorumluPersonelId,
      baslik:
        v.yanitKalanGun === 0
          ? "e-Fatura yanıt süresi bugün doluyor"
          : `e-Fatura yanıt süresi ${v.yanitKalanGun} gün içinde doluyor`,
      aciklama: `${e.belgeNo} · ${m.unvan}`,
      link: `/e-belge/e-fatura?fatura=${e.id}`,
      mukellefId: m.id,
      hedefTip: "EBELGE",
      hedefId: e.id,
    })
  }

  // Beyanlar sorumlu + son gün bazında gruplanır (aynı güne düşen onlarca beyan tek bildirim)
  const beyanlar = olaylariHesapla(
    {
      baslangic: bugunYmd,
      bitis: toYmd(addDays(fromYmd(bugunYmd), BEYAN_PENCERE_GUN)),
    },
    bugunYmd
  ).filter((o) => o.durum !== "ONAYLANDI")
  const gruplar = new Map<string, typeof beyanlar>()
  for (const o of beyanlar) {
    const k = `${o.sorumluPersonelId}:${o.sonTarih}`
    gruplar.set(k, [...(gruplar.get(k) ?? []), o])
  }
  for (const [k, liste] of gruplar) {
    const ilk = liste[0]!
    const kalan = kalanGun(ilk.sonTarih, bugunYmd)
    ekle({
      tur: "BEYAN_YAKLASIYOR",
      anahtar: `BEYAN_YAKLASIYOR:${k}`,
      aliciId: ilk.sorumluPersonelId,
      baslik:
        kalan === 0
          ? `${liste.length} beyanın son günü bugün`
          : `${liste.length} beyanın son gününe ${kalan} gün kaldı`,
      aciklama:
        liste.length === 1
          ? ilk.mukellefUnvan
          : `${ilk.mukellefUnvan} ve ${liste.length - 1} mükellef daha`,
      link: "/takvim?durum=bekliyor",
      hedefTip: "TAKVIM",
    })
  }

  // Son işlem günü yaklaşan açık tebligatlar (≤ 3 gün)
  for (const t of db.tebligat.all()) {
    const d = sureDurumu(t, bugunYmd)
    if (!d.acil) continue
    const m = t.mukellefId ? db.mukellef.find(t.mukellefId) : undefined
    ekle({
      tur: "TEBLIGAT_SURE_YAKLASIYOR",
      anahtar: `TEBLIGAT_SURE:${t.id}:${d.sonIslemTarihi}`,
      aliciId: t.atananId ?? m?.sorumluPersonelId ?? null,
      baslik:
        d.kalanGun === 0
          ? "e-Tebligat süresi bugün doluyor"
          : `e-Tebligat süresinin dolmasına ${d.kalanGun} gün kaldı`,
      aciklama: `${TEBLIGAT_TUR_ETIKET[t.tur]} · ${m?.unvan ?? `VKN ${t.vkn}`}`,
      link: `/tebligat?tebligat=${t.id}`,
      mukellefId: t.mukellefId,
      hedefTip: "TEBLIGAT",
      hedefId: t.id,
    })
  }

  // Bordro girdisi (puantaj) gelmedi ve MUHSGK süresi yaklaşıyor / geçti
  for (const donem of sonBordroDonemleri(bugunYmd, 2)) {
    for (const m of bordroMukellefleri()) {
      const s = bordroSatiri(m, donem, bugunYmd)
      if (s.durum !== "BEKLENIYOR" || s.uyari === "YOK") continue
      ekle({
        tur: "BORDRO_GIRDI_BEKLIYOR",
        anahtar: `BORDRO_GIRDI:${m.id}:${donem}:${s.uyari}`,
        aliciId: m.sorumluPersonelId,
        baslik:
          s.uyari === "GECIKTI"
            ? "Bordro girdisi gelmedi, MUHSGK süresi geçti"
            : `Bordro girdisi gelmedi, MUHSGK'ye ${s.kalanIsGunu} iş günü kaldı`,
        aciklama: `${m.unvan} · ${formatDonem(donem)}`,
        link: `/mukellefler/${m.id}/bordro?bordro=${m.id}:${donem}`,
        mukellefId: m.id,
        hedefTip: "BORDRO",
        hedefId: `${m.id}:${donem}`,
      })
    }
  }

  // İşe giriş / çıkış bildirimi: süre yaklaşıyor ya da geçti
  for (const h of db.isHareketi.where((h) => h.durum === "BEKLIYOR")) {
    const m = db.mukellef.find(h.mukellefId)
    const v = hareketView(h, bugunYmd)
    if (!m?.aktif || v.uyari === "YOK") continue
    ekle({
      tur: "ISE_HAREKETI_SURE",
      anahtar: `ISE_HAREKETI:${h.id}:${v.uyari}`,
      aliciId: m.sorumluPersonelId,
      baslik:
        v.uyari === "GECIKTI"
          ? `${HAREKET_TUR_ETIKET[h.tur]} bildirimi gecikti`
          : `${HAREKET_TUR_ETIKET[h.tur]} bildirimi için son gün yaklaşıyor`,
      aciklama: `${m.unvan} · ${h.kisi}`,
      link: `/mukellefler/${m.id}/bordro`,
      mukellefId: m.id,
      hedefTip: "BORDRO",
      hedefId: h.id,
    })
  }

  // Geciken ücret ödemeleri: yöneticilere haftada bir özet
  const cariGrup = new Map<string, CariHareket[]>()
  for (const h of db.cari.all())
    cariGrup.set(h.mukellefId, [...(cariGrup.get(h.mukellefId) ?? []), h])
  const gecikenler = [...cariGrup.entries()]
    .map(([mukellefId, hs]) => ({ mukellefId, ...cariDurum(hs, bugunYmd) }))
    .filter((d) => d.geciken)
  if (gecikenler.length > 0) {
    const bugunTarih = fromYmd(bugunYmd)
    const hafta = `${getISOWeekYear(bugunTarih)}-W${getISOWeek(bugunTarih)}`
    const toplam = gecikenler.reduce((t, d) => t + d.acikBorc, 0)
    for (const y of db.personel.where((p) => p.aktif && p.rol === "YONETICI")) {
      ekle({
        tur: "ODEME_GECIKTI",
        anahtar: `ODEME_GECIKTI:${y.id}:${hafta}`,
        aliciId: y.id,
        baslik: `${gecikenler.length} mükellefin ücret ödemesi gecikti`,
        aciklama: `Vadesi geçmiş açık alacak ${formatTRY(toplam)}`,
        link: "/tahsilat/cari?geciken=true",
        hedefTip: "TAHSILAT",
      })
    }
  }

  const zaman = new Date().toISOString()
  const eklenen = db.bildirim.insertMany(
    yeni.map((h) => ({ ...h, zaman, okuyanlar: [] }))
  )
  db.gonderim.insertMany(eklenen.flatMap(bildirimGonderimleri))
}

function toView(b: Bildirim, kullaniciId: string): BildirimView {
  const { okuyanlar, ...rest } = b
  const p = b.aktorId ? db.personel.find(b.aktorId) : undefined
  return {
    ...rest,
    okundu: okuyanlar.includes(kullaniciId),
    aktor: p ? { id: p.id, ad: p.ad, soyad: p.soyad, renk: p.renk } : null,
  }
}

const okunduEkle = (b: Bildirim, kullaniciId: string) => {
  if (!b.okuyanlar.includes(kullaniciId))
    db.bildirim.update(b.id, { okuyanlar: [...b.okuyanlar, kullaniciId] })
}

export const bildirimHandlers = [
  http.get(api("/bildirim"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const p = new URL(request.url).searchParams
    const sadeceOkunmamis = p.get("sadeceOkunmamis") === "true"
    const limit = Math.min(Number(p.get("limit")) || 30, 100)

    hatirlatmalariUret()

    const gorunen = db.bildirim
      .where((b) => bildirimGorunurMu(b, actor.id))
      .sort((a, b) => b.zaman.localeCompare(a.zaman))
    const okunmamislar = gorunen.filter((b) => !b.okuyanlar.includes(actor.id))

    return HttpResponse.json<BildirimListResponse>({
      items: (sadeceOkunmamis ? okunmamislar : gorunen)
        .slice(0, limit)
        .map((b) => toView(b, actor.id)),
      okunmamis: okunmamislar.length,
    })
  }),

  http.post(api("/bildirim/okundu"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    for (const b of db.bildirim.where((b) => bildirimGorunurMu(b, actor.id)))
      okunduEkle(b, actor.id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post<{ id: string }>(
    api("/bildirim/:id/okundu"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const b = db.bildirim.find(params.id)
      if (!b || !bildirimGorunurMu(b, actor.id))
        return notFound("Bildirim bulunamadı")
      okunduEkle(b, actor.id)
      return new HttpResponse(null, { status: 204 })
    }
  ),
]
