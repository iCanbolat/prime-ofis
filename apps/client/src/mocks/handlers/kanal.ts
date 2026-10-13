/**
 * `/api/kanallar`, `/api/bildirim-tercihleri`, `/api/gonderimler`, `/api/gonderim/*` — dış gönderim
 * kanalları. Sağlayıcılara erişim `KanalAdapter` üzerinden (burada mock) yapılır.
 */
import { HttpResponse, http } from "msw"

import { BILDIRIM_GORUNUM } from "@/features/bildirim/gorunum"
import { SABLON_TIPLERI } from "@prime/shared/evrak-talebi/mesaj"
import { KANAL_ETIKET as TALEP_KANAL_ETIKET } from "@prime/shared/evrak-talebi/sabitler"
import { VARSAYILAN_TERCIH, kanalHazir } from "@prime/shared/kanal/kurallar"
import { KANAL_ETIKET } from "@prime/shared/kanal/sabitler"
import { db } from "@/mocks/db"
import { karma } from "@prime/mock-data/karma"
import { gonderimHazirla, kanalAyari, mukellefeGonder } from "@/mocks/gonderim"
import {
  api,
  errorResponse,
  logActivity,
  notFound,
  requireActor,
} from "@/mocks/handlers/common"
import { ucretBorclariniUret } from "@/mocks/handlers/tahsilat"
import { mockKanalAdapter as adapter } from "@/mocks/kanal/mock-adapter"
import type {
  BildirimTercihKaydetRequest,
  BildirimTercihView,
  GonderimListResponse,
  KanalKaydetRequest,
  KanallarResponse,
  MukellefGonderRequest,
  MukellefGonderResponse,
  TelegramBaglamaResponse,
} from "@prime/shared/types/api"
import type {
  BildirimTercihi,
  Gonderim,
  GonderimDurumu,
  GonderimKaynak,
  KanalAyari,
  KanalTip,
  Personel,
  TalepKanal,
} from "@prime/shared/types/domain"

const KANALLAR: KanalTip[] = ["EPOSTA", "TELEGRAM", "WHATSAPP"]
const KATEGORILER = Object.keys(BILDIRIM_GORUNUM)
const EPOSTA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const yoneticiMi = (p: Personel) => p.rol === "YONETICI"

function kanallarYaniti(): KanallarResponse {
  return {
    EPOSTA: kanalAyari("EPOSTA") ?? null,
    TELEGRAM: kanalAyari("TELEGRAM") ?? null,
    WHATSAPP: kanalAyari("WHATSAPP") ?? null,
  }
}

/** Kaydetme isteğini doğrular; gizli değer ve kaydedilecek (gizlisiz) ayar döner */
function kanalKaydiHazirla(
  body: KanalKaydetRequest,
  mevcut: KanalAyari | undefined
):
  | {
      ayar: Omit<KanalAyari, "gizliIpucu" | "durum"> & Partial<KanalAyari>
      gizli?: string
    }
  | string {
  const temel = { id: body.tip, aktif: Boolean(body.aktif) }
  if (body.tip === "EPOSTA") {
    if (!body.sunucu?.trim()) return "SMTP sunucusu zorunludur"
    if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535)
      return "Geçerli bir port girin"
    if (!body.kullanici?.trim()) return "Kullanıcı adı zorunludur"
    if (!EPOSTA_RE.test(body.gonderenAdres ?? ""))
      return "Geçerli bir gönderen adresi girin"
    if (!mevcut && !body.sifre) return "SMTP şifresi zorunludur"
    return {
      ayar: {
        ...temel,
        tip: "EPOSTA",
        sunucu: body.sunucu.trim(),
        port: body.port,
        guvenlik: body.guvenlik === "TLS" ? "TLS" : "STARTTLS",
        kullanici: body.kullanici.trim(),
        gonderenAd: body.gonderenAd?.trim() || body.gonderenAdres,
        gonderenAdres: body.gonderenAdres.trim(),
      },
      gizli: body.sifre || undefined,
    }
  }
  if (body.tip === "TELEGRAM") {
    const bot = body.botKullaniciAdi?.trim().replace(/^@/, "")
    if (!bot || !/^\w{5,32}bot$/i.test(bot))
      return "Bot kullanıcı adı 'bot' ile bitmeli (ör. PrimeOfisBot)"
    if (!mevcut && !body.token) return "Bot token zorunludur"
    if (body.token && !/^\d+:[\w-]{20,}$/.test(body.token))
      return "Token BotFather'ın verdiği biçimde olmalı (123456:ABC…)"
    return {
      ayar: { ...temel, tip: "TELEGRAM", botKullaniciAdi: bot },
      gizli: body.token || undefined,
    }
  }
  if (body.tip === "WHATSAPP") {
    if (!/^\d{6,20}$/.test(body.telefonNumarasiId ?? ""))
      return "Telefon numarası kimliği (Phone number ID) rakamlardan oluşmalı"
    if (!/^\d{6,20}$/.test(body.wabaId ?? ""))
      return "WhatsApp Business hesap kimliği (WABA ID) rakamlardan oluşmalı"
    if (!body.gorunenNumara?.trim()) return "Görünen numara zorunludur"
    if (!mevcut && !body.erisimAnahtari)
      return "Kalıcı erişim anahtarı zorunludur"
    const sablonlar: Record<string, string> = Object.fromEntries(
      Object.entries(body.sablonlar ?? {})
        .map(([k, v]): [string, string] => [k, String(v ?? "").trim()])
        .filter(([, v]) => v)
    )
    if (Object.values(sablonlar).some((v) => !/^[a-z0-9_]{1,512}$/.test(v)))
      return "Şablon adları küçük harf, rakam ve alt çizgiden oluşmalı"
    return {
      ayar: {
        ...temel,
        tip: "WHATSAPP",
        telefonNumarasiId: body.telefonNumarasiId,
        wabaId: body.wabaId,
        gorunenNumara: body.gorunenNumara.trim(),
        sablonlar,
      },
      gizli: body.erisimAnahtari || undefined,
    }
  }
  return "Geçersiz kanal"
}

function tercihView(p: Personel): BildirimTercihView {
  const t = db.bildirimTercihi.find(p.id)
  return {
    id: p.id,
    // Kayıt yoksa varsayılan tercih geçerlidir (`VARSAYILAN_TERCIH`)
    kanallar: t?.kanallar ?? VARSAYILAN_TERCIH,
    telegramChatId: t?.telegramChatId,
    telegramBaglamaKodu: t?.telegramBaglamaKodu,
    eposta: p.eposta,
    telefon: p.telefon,
    telegramBagli: Boolean(t?.telegramChatId),
  }
}

function tercihYaz(p: Personel, patch: Partial<Omit<BildirimTercihi, "id">>) {
  const mevcut = db.bildirimTercihi.find(p.id)
  if (mevcut) db.bildirimTercihi.update(p.id, patch)
  else db.bildirimTercihi.insert({ id: p.id, kanallar: {}, ...patch })
}

const TALEP_KANAL: Record<"WHATSAPP" | "EPOSTA", TalepKanal> = {
  WHATSAPP: "WHATSAPP",
  EPOSTA: "EPOSTA",
}

export const kanalHandlers = [
  http.get(api("/kanallar"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    return HttpResponse.json(kanallarYaniti())
  }),

  http.put<{ tip: KanalTip }, KanalKaydetRequest>(
    api("/kanallar/:tip"),
    async ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (!yoneticiMi(actor))
        return errorResponse(
          403,
          "Kanalları yalnızca yönetici yapılandırabilir"
        )
      if (!KANALLAR.includes(params.tip)) return notFound("Kanal bulunamadı")
      const body = await request.json()
      if (body.tip !== params.tip)
        return errorResponse(400, "Kanal tipi uyuşmuyor")
      const mevcut = kanalAyari(params.tip)
      const hazir = kanalKaydiHazirla(body, mevcut)
      if (typeof hazir === "string") return errorResponse(400, hazir)

      const ayar = {
        ...hazir.ayar,
        durum: "BAGLI",
        gizliIpucu: hazir.gizli ? hazir.gizli.slice(-4) : mevcut?.gizliIpucu,
        hataMesaji: undefined,
        sonTest: mevcut?.sonTest,
        guncelleyenId: actor.id,
        guncellemeTarihi: new Date().toISOString(),
      } as KanalAyari
      if (hazir.gizli) {
        const d = await adapter.dogrula(ayar, hazir.gizli)
        if (!d.gecerli)
          return errorResponse(422, d.hataMesaji ?? "Bağlantı kurulamadı")
      }
      if (mevcut) db.kanal.remove(mevcut.id)
      db.kanal.insert(ayar)
      logActivity(
        {
          aktorId: actor.id,
          eylem: "KANAL_GUNCELLENDI",
          aciklama: `${KANAL_ETIKET[ayar.tip]}${ayar.aktif ? "" : " (pasif)"}`,
        },
        false
      )
      return HttpResponse.json(ayar)
    }
  ),

  http.delete<{ tip: KanalTip }>(
    api("/kanallar/:tip"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (!yoneticiMi(actor))
        return errorResponse(403, "Kanalları yalnızca yönetici kaldırabilir")
      if (!db.kanal.remove(params.tip))
        return notFound("Kanal yapılandırılmamış")
      logActivity(
        {
          aktorId: actor.id,
          eylem: "KANAL_KALDIRILDI",
          aciklama: KANAL_ETIKET[params.tip],
        },
        false
      )
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.post<{ tip: KanalTip }>(
    api("/kanallar/:tip/test"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const ayar = kanalAyari(params.tip)
      if (!ayar) return errorResponse(409, "Kanal yapılandırılmamış")
      const adres =
        ayar.tip === "EPOSTA"
          ? actor.eposta
          : ayar.tip === "WHATSAPP"
            ? actor.telefon
            : db.bildirimTercihi.find(actor.id)?.telegramChatId
      if (!adres)
        return errorResponse(
          409,
          "Telegram testi için önce Bildirimlerim sekmesinden kendi hesabınızı bağlayın"
        )
      const [g] = db.gonderim.insertMany([
        gonderimHazirla(
          ayar,
          {
            adres,
            konu: "Prime Ofis test mesajı",
            metin: `${KANAL_ETIKET[ayar.tip]} kanalı çalışıyor.`,
            whatsappSablon:
              ayar.tip === "WHATSAPP" ? "PERSONEL_HATIRLATMA" : undefined,
            parametreler: ["Test mesajı", "Kanal çalışıyor"],
          },
          {
            aliciTip: "PERSONEL",
            aliciId: actor.id,
            aliciAd: `${actor.ad} ${actor.soyad}`,
            kaynak: "TEST",
            gonderenId: actor.id,
          }
        ),
      ])
      db.kanal.update(ayar.id, { sonTest: new Date().toISOString() })
      return HttpResponse.json({ gonderim: g })
    }
  ),

  http.get(api("/bildirim-tercihleri/ben"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    return HttpResponse.json(tercihView(actor))
  }),

  http.put<never, BildirimTercihKaydetRequest>(
    api("/bildirim-tercihleri/ben"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const { kanallar } = await request.json()
      if (!kanallar || typeof kanallar !== "object")
        return errorResponse(400, "Tercih bulunamadı")
      for (const [k, v] of Object.entries(kanallar)) {
        if (!KATEGORILER.includes(k))
          return errorResponse(400, "Geçersiz kategori")
        if (!Array.isArray(v) || v.some((t) => !KANALLAR.includes(t)))
          return errorResponse(400, "Geçersiz kanal")
      }
      tercihYaz(actor, { kanallar })
      return HttpResponse.json(tercihView(actor))
    }
  ),

  http.post(api("/bildirim-tercihleri/ben/telegram"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const ayar = kanalAyari("TELEGRAM")
    if (!ayar || ayar.tip !== "TELEGRAM" || !kanalHazir(ayar))
      return errorResponse(409, "Büronun Telegram botu yapılandırılmamış")
    const kod = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    tercihYaz(actor, { telegramBaglamaKodu: kod })
    const yanit: TelegramBaglamaResponse = {
      kod,
      link: `https://t.me/${ayar.botKullaniciAdi}?start=${kod}`,
    }
    return HttpResponse.json(yanit)
  }),

  /**
   * Gerçekte bot, kullanıcı `/start <kod>` yazınca webhook ile chat id'yi bildirir. Mock'ta bu uç
   * o webhook'un yerine geçer: kod eşleşirse chat id atanır.
   */
  http.post(api("/bildirim-tercihleri/ben/telegram/dogrula"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    const t = db.bildirimTercihi.find(actor.id)
    if (!t?.telegramBaglamaKodu)
      return errorResponse(409, "Önce bağlantı bağlantısını oluşturun")
    tercihYaz(actor, {
      telegramChatId: String(karma(t.telegramBaglamaKodu)).slice(0, 9),
      telegramBaglamaKodu: undefined,
    })
    return HttpResponse.json(tercihView(actor))
  }),

  http.delete(api("/bildirim-tercihleri/ben/telegram"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    tercihYaz(actor, {
      telegramChatId: undefined,
      telegramBaglamaKodu: undefined,
    })
    return HttpResponse.json(tercihView(actor))
  }),

  http.get(api("/gonderimler"), ({ request }) => {
    const actor = requireActor(request)
    if (actor instanceof Response) return actor
    if (!yoneticiMi(actor))
      return errorResponse(
        403,
        "Gönderim geçmişini yalnızca yönetici görebilir"
      )
    const p = new URL(request.url).searchParams
    const kanal = p.get("kanal") as KanalTip | null
    const durum = p.get("durum") as GonderimDurumu | null
    const aliciTip = p.get("aliciTip") as Gonderim["aliciTip"] | null
    const kaynak = p.get("kaynak") as GonderimKaynak | null
    const hepsi = db.gonderim.all()
    const filtrelenen = hepsi
      .filter(
        (g) =>
          (!kanal || g.kanal === kanal) &&
          (!durum || g.durum === durum) &&
          (!aliciTip || g.aliciTip === aliciTip) &&
          (!kaynak || g.kaynak === kaynak)
      )
      .sort((a, b) => b.zaman.localeCompare(a.zaman))
    const sayfaBoyutu = Math.min(
      Math.max(Number(p.get("sayfaBoyutu")) || 20, 1),
      100
    )
    const sonSayfa = Math.max(Math.ceil(filtrelenen.length / sayfaBoyutu), 1)
    const sayfa = Math.min(Math.max(Number(p.get("sayfa")) || 1, 1), sonSayfa)
    const yediGun = new Date(Date.now() - 7 * 864e5).toISOString()
    const yanit: GonderimListResponse = {
      items: filtrelenen.slice((sayfa - 1) * sayfaBoyutu, sayfa * sayfaBoyutu),
      total: filtrelenen.length,
      sayfa,
      sayfaBoyutu,
      hataliSon7Gun: hepsi.filter(
        (g) => g.durum === "HATA" && g.zaman >= yediGun
      ).length,
    }
    return HttpResponse.json(yanit)
  }),

  http.post<{ id: string }>(
    api("/gonderimler/:id/tekrar"),
    ({ request, params }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      if (!yoneticiMi(actor))
        return errorResponse(
          403,
          "Gönderimi yalnızca yönetici yeniden deneyebilir"
        )
      const g = db.gonderim.find(params.id)
      if (!g) return notFound("Gönderim bulunamadı")
      if (g.durum !== "HATA")
        return errorResponse(409, "Yalnızca hatalı gönderim yeniden denenir")
      const ayar = kanalAyari(g.kanal)
      if (!ayar || !kanalHazir(ayar))
        return errorResponse(409, "Kanal kullanılamıyor")
      // Maskeli adres saklandığı için adres alıcı kaydından yeniden çözülür
      let adres: string | undefined
      if (g.aliciTip === "PERSONEL") {
        const p = db.personel.find(g.aliciId)
        adres =
          g.kanal === "EPOSTA"
            ? p?.eposta
            : g.kanal === "WHATSAPP"
              ? p?.telefon
              : db.bildirimTercihi.find(g.aliciId)?.telegramChatId
      } else {
        const m = db.mukellef.find(g.aliciId)
        adres = g.kanal === "EPOSTA" ? m?.eposta : m?.telefon
      }
      const yeni = gonderimHazirla(
        ayar,
        {
          adres: adres ?? "",
          konu: g.konu,
          metin: g.ozet,
          whatsappSablon: g.sablon,
        },
        g
      )
      const guncel = db.gonderim.update(g.id, {
        durum: yeni.durum,
        hataMesaji: yeni.hataMesaji,
        denemeSayisi: g.denemeSayisi + 1,
        zaman: yeni.zaman,
      })
      return HttpResponse.json(guncel)
    }
  ),

  http.post<never, MukellefGonderRequest>(
    api("/gonderim/mukellef"),
    async ({ request }) => {
      const actor = requireActor(request)
      if (actor instanceof Response) return actor
      const body = await request.json()
      if (!SABLON_TIPLERI.includes(body.sablon))
        return errorResponse(400, "Geçersiz mesaj türü")
      if (body.kanal && body.kanal !== "WHATSAPP" && body.kanal !== "EPOSTA")
        return errorResponse(
          400,
          "Mükellefe yalnızca WhatsApp veya e-posta ile gönderilir"
        )
      if (!Array.isArray(body.hedefler) || body.hedefler.length === 0)
        return errorResponse(400, "En az bir mükellef seçin")
      if (body.hedefler.length > 200)
        return errorResponse(
          400,
          "Tek seferde en fazla 200 mükellefe gönderilir"
        )

      // Borç hatırlatması bu ayın ücret borcu oluşmuş haliyle hesaplansın
      if (body.sablon === "BORC_HATIRLATMA") ucretBorclariniUret()
      const sonuclar = mukellefeGonder(body, actor.id)
      if (!body.onizleme) {
        for (const s of sonuclar) {
          if (s.durum !== "GONDERILDI" && s.durum !== "ELLE") continue
          const hedef = body.hedefler.find((h) => h.mukellefId === s.mukellefId)
          // Evrak talebinin gönderim geçmişine de yazılır
          if (
            (body.sablon === "TALEP" || body.sablon === "RED") &&
            hedef?.talepId
          ) {
            const t = db.talep.find(hedef.talepId)
            if (t) {
              db.talep.update(t.id, {
                kanal: TALEP_KANAL[s.kanal],
                gonderimler: [
                  ...t.gonderimler,
                  {
                    kanal: TALEP_KANAL[s.kanal],
                    zaman: new Date().toISOString(),
                    gonderenId: actor.id,
                  },
                ],
              })
              logActivity(
                {
                  aktorId: actor.id,
                  eylem: "TALEP_GONDERILDI",
                  hedefTip: "EVRAK",
                  hedefId: t.id,
                  mukellefId: t.mukellefId,
                  aciklama: TALEP_KANAL_ETIKET[TALEP_KANAL[s.kanal]],
                },
                false
              )
              continue
            }
          }
          logActivity(
            {
              aktorId: actor.id,
              eylem: "MUKELLEFE_GONDERILDI",
              hedefTip: "MUKELLEF",
              hedefId: s.mukellefId,
              mukellefId: s.mukellefId,
              aciklama: `${s.konu.split(" — ")[0]} · ${s.kanal === "WHATSAPP" ? "WhatsApp" : "E-posta"}`,
            },
            false
          )
        }
      }
      const yanit: MukellefGonderResponse = { sonuclar }
      return HttpResponse.json(yanit)
    }
  ),
]
