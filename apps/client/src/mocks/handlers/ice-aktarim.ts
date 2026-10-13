/**
 * `/api/ice-aktarim/*` — muhasebe paketinden ve e-Beyanname'den alınan dosyaların içe aktarımı.
 * Ayrıştırma istemcide yapılır (önizleme + düzeltme); backend yalnızca onaylanan kalemleri doğrular,
 * takvimi günceller, dosyayı arşive yazar ve mizan kontrollerini çalıştırır.
 */
import { HttpResponse, http } from "msw"

import {
  donemBaslangici,
  donemGecerliMi,
} from "@prime/shared/ice-aktarim/tahakkuk"
import { mizanKontrolleri, mizanOzeti } from "@prime/shared/ice-aktarim/mizan"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import {
  donemEtiketi,
  takvimOlayId,
  uygulananTipler,
} from "@prime/shared/takvim/motor"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import { DATA_URL_RE, arsiveYaz } from "@/mocks/handlers/ortak-islemler"
import { beyanDurumuOku, beyanDurumuYaz } from "@/mocks/handlers/takvim"
import type {
  IceAktarSonucu,
  MizanDetay,
  MizanIceAktarRequest,
  MizanView,
  TahakkukIceAktarKalem,
  TahakkukIceAktarRequest,
  TahakkukIceAktarResponse,
  TahakkukView,
} from "@prime/shared/types/api"
import type { Mizan, Mukellef, Personel, Tahakkuk } from "@prime/shared/types/domain"

const MIZAN_KONTROL_MADDESI = "Mizan kontrol edildi"

function tahakkukDogrula(
  k: TahakkukIceAktarKalem
): { m: Mukellef } | { hata: string } {
  const m = db.mukellef.find(k.mukellefId)
  if (!m) return { hata: "Mükellef bulunamadı" }
  if (!uygulananTipler(m).includes(k.tip))
    return {
      hata: `${m.unvan} ${YUKUMLULUK_TANIMLARI[k.tip].ad} yükümlüsü değil`,
    }
  if (!donemGecerliMi(k.tip, k.donem)) return { hata: "Dönem geçersiz" }
  if (k.tip === "KDV") {
    const ucAylik = /Q\d$/.test(k.donem)
    if (ucAylik !== (m.kdvPeriyodu === "UC_AYLIK"))
      return {
        hata: `Mükellef ${m.kdvPeriyodu === "UC_AYLIK" ? "üç aylık" : "aylık"} KDV veriyor; dönem uyuşmuyor`,
      }
  }
  if (donemBaslangici(k.donem) > bugun())
    return { hata: "Gelecek dönemin tahakkuku olamaz" }
  if (!DATA_URL_RE.test(k.dosya?.dataUrl ?? ""))
    return { hata: "Dosya içeriği eksik" }
  if (
    k.odenecek !== undefined &&
    !(typeof k.odenecek === "number" && k.odenecek >= 0)
  )
    return { hata: "Ödenecek tutar geçersiz" }
  return { m }
}

function tahakkukView(t: Tahakkuk): TahakkukView {
  return { ...t, mukellefUnvan: db.mukellef.find(t.mukellefId)?.unvan ?? "—" }
}

/**
 * 360 karşılaştırması için dönemin KDV + MUHSGK tahakkukları. Üç aylık KDV, çeyreğin son ayının
 * mizanına sayılır. Hiç tahakkuk yoksa karşılaştırma yapılmaz.
 */
function donemTahakkukToplami(
  mukellefId: string,
  donem: string
): number | undefined {
  const ay = Number(donem.slice(5, 7))
  const ceyrek = ay % 3 === 0 ? `${donem.slice(0, 4)}-Q${ay / 3}` : null
  const ilgili = db.tahakkuk.where(
    (t) =>
      t.mukellefId === mukellefId &&
      ((t.tip === "MUHTASAR_SGK" && t.donem === donem) ||
        (t.tip === "KDV" && (t.donem === donem || t.donem === ceyrek)))
  )
  if (ilgili.length === 0) return undefined
  return ilgili.reduce((t, k) => t + (k.odenecek ?? 0), 0)
}

function mizanView(z: Mizan): MizanView {
  const { hesaplar, ...rest } = z
  return {
    ...rest,
    mukellefUnvan: db.mukellef.find(z.mukellefId)?.unvan ?? "—",
    ozet: mizanOzeti(hesaplar),
    hesapSayisi: hesaplar.length,
  }
}

/** Çeyrek sonu mizanı hatasızsa geçici vergi görevindeki "Mizan kontrol edildi" maddesi işaretlenir */
function gorevMaddesiniIsaretle(z: Mizan, actor: Personel): string | undefined {
  const ay = Number(z.donem.slice(5, 7))
  if (ay % 3 !== 0 || z.kontroller.some((k) => k.durum === "HATA")) return
  const anahtar = takvimOlayId(
    z.mukellefId,
    "GECICI_VERGI",
    `${z.donem.slice(0, 4)}-Q${ay / 3}`
  )
  const gorev = db.gorev.where((g) => g.otomatikAnahtar === anahtar)[0]
  const madde = gorev?.checklist.find(
    (c) => c.metin === MIZAN_KONTROL_MADDESI && !c.tamam
  )
  if (!gorev || !madde) return
  const simdi = new Date().toISOString()
  db.gorev.update(gorev.id, {
    checklist: gorev.checklist.map((c) =>
      c.id === madde.id
        ? { ...c, tamam: true, tamamlayanId: actor.id, tamamlanmaTarihi: simdi }
        : c
    ),
    guncellemeTarihi: simdi,
  })
  return gorev.id
}

const HESAP_KOD_RE = /^[1-9]\d{2}$/
const MAKS_HESAP = 1000

export const iceAktarimHandlers = [
  // --- Tahakkuk -------------------------------------------------------------
  http.get(api("/ice-aktarim/tahakkuklar"), ({ request }) => {
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    return HttpResponse.json(
      db.tahakkuk
        .where((t) => !mukellefId || t.mukellefId === mukellefId)
        .sort((a, b) => b.yuklemeTarihi.localeCompare(a.yuklemeTarihi))
        .map(tahakkukView)
    )
  }),

  http.post<never, TahakkukIceAktarRequest>(
    api("/ice-aktarim/tahakkuklar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { kalemler } = await request.json()
      if (!Array.isArray(kalemler) || kalemler.length === 0)
        return errorResponse(400, "İçe aktarılacak tahakkuk yok")
      if (kalemler.length > 50)
        return errorResponse(400, "Tek seferde en fazla 50 tahakkuk")

      const sonuclar: IceAktarSonucu[] = []
      for (const [sira, k] of kalemler.entries()) {
        const d = tahakkukDogrula(k)
        if ("hata" in d) {
          sonuclar.push({ sira, durum: "HATA", mesaj: d.hata })
          continue
        }

        const takvimId = takvimOlayId(k.mukellefId, k.tip, k.donem)
        const mevcut = db.tahakkuk.where(
          (t) =>
            t.mukellefId === k.mukellefId &&
            t.tip === k.tip &&
            t.donem === k.donem
        )[0]
        const kayit: Omit<Tahakkuk, "id"> = {
          mukellefId: k.mukellefId,
          tip: k.tip,
          donem: k.donem,
          beyannameKodu: k.beyannameKodu,
          tahakkukNo: k.tahakkukNo?.trim() || undefined,
          odenecek: k.odenecek,
          vade: k.vade,
          arsivDosyaId: await arsiveYaz(
            k.mukellefId,
            "TAHAKKUK",
            k.dosya,
            actor
          ),
          yukleyenId: actor.id,
          yuklemeTarihi: new Date().toISOString(),
        }
        if (mevcut) db.tahakkuk.update(mevcut.id, kayit)
        else db.tahakkuk.insert(kayit)

        if (beyanDurumuOku(takvimId) !== "ONAYLANDI")
          beyanDurumuYaz(takvimId, "ONAYLANDI", actor, " (tahakkuk)")
        logActivity({
          aktorId: actor.id,
          eylem: "TAHAKKUK_ICE_AKTARILDI",
          hedefTip: "TAKVIM",
          hedefId: takvimId,
          mukellefId: k.mukellefId,
          aciklama: `${YUKUMLULUK_TANIMLARI[k.tip].kisaAd} ${donemEtiketi(k.donem)}${
            k.odenecek !== undefined ? ` · ${formatTRY(k.odenecek)}` : ""
          }`,
        })
        sonuclar.push({ sira, durum: mevcut ? "GUNCELLENDI" : "EKLENDI" })
      }
      return HttpResponse.json({ sonuclar } satisfies TahakkukIceAktarResponse)
    }
  ),

  // --- Mizan ----------------------------------------------------------------
  http.get(api("/ice-aktarim/mizanlar"), ({ request }) => {
    const mukellefId = new URL(request.url).searchParams.get("mukellefId")
    return HttpResponse.json(
      db.mizan
        .where((z) => !mukellefId || z.mukellefId === mukellefId)
        .sort(
          (a, b) =>
            b.donem.localeCompare(a.donem) ||
            b.yuklemeTarihi.localeCompare(a.yuklemeTarihi)
        )
        .map(mizanView)
    )
  }),

  http.get<{ id: string }>(api("/ice-aktarim/mizanlar/:id"), ({ params }) => {
    const z = db.mizan.find(params.id)
    if (!z) return notFound("Mizan bulunamadı")
    return HttpResponse.json({
      ...mizanView(z),
      hesaplar: z.hesaplar,
    } satisfies MizanDetay)
  }),

  http.post<never, MizanIceAktarRequest>(
    api("/ice-aktarim/mizanlar"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      const m = db.mukellef.find(body.mukellefId)
      if (!m) return notFound("Mükellef bulunamadı")
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.donem ?? ""))
        return errorResponse(400, "Dönem geçersiz")
      if (`${body.donem}-01` > bugun())
        return errorResponse(400, "Gelecek dönemin mizanı olamaz")
      if (!DATA_URL_RE.test(body.dosya?.dataUrl ?? ""))
        return errorResponse(400, "Dosya içeriği eksik")
      const hesaplar = body.hesaplar
      if (
        !Array.isArray(hesaplar) ||
        hesaplar.length === 0 ||
        hesaplar.length > MAKS_HESAP ||
        !hesaplar.every(
          (h) =>
            HESAP_KOD_RE.test(h.kod) &&
            Number.isFinite(h.borc) &&
            Number.isFinite(h.alacak)
        )
      )
        return errorResponse(400, "Mizan satırları geçersiz")

      const kontroller = mizanKontrolleri(hesaplar, {
        tahakkukToplami: donemTahakkukToplami(m.id, body.donem),
      })
      const kayit: Omit<Mizan, "id"> = {
        mukellefId: m.id,
        donem: body.donem,
        dosyaAdi: body.dosya.ad,
        hesaplar: hesaplar.map(({ kod, ad, borc, alacak }) => ({
          kod,
          ad: String(ad ?? ""),
          borc,
          alacak,
        })),
        kontroller,
        arsivDosyaId: await arsiveYaz(m.id, "MIZAN", body.dosya, actor),
        yukleyenId: actor.id,
        yuklemeTarihi: new Date().toISOString(),
      }
      const mevcut = db.mizan.where(
        (z) => z.mukellefId === m.id && z.donem === body.donem
      )[0]
      const z = mevcut
        ? db.mizan.update(mevcut.id, kayit)!
        : db.mizan.insert(kayit)

      const isaretlenenGorevId = gorevMaddesiniIsaretle(z, actor)
      const hata = kontroller.filter((k) => k.durum === "HATA").length
      const uyari = kontroller.filter((k) => k.durum === "UYARI").length
      logActivity({
        aktorId: actor.id,
        eylem: "MIZAN_ICE_AKTARILDI",
        hedefTip: "MUKELLEF",
        hedefId: m.id,
        mukellefId: m.id,
        aciklama: `${formatDonem(body.donem)} · ${
          hata || uyari ? `${hata} hata, ${uyari} uyarı` : "sorun yok"
        }`,
      })
      return HttpResponse.json(
        { ...mizanView(z), isaretlenenGorevId } satisfies MizanView,
        { status: mevcut ? 200 : 201 }
      )
    }
  ),
]
