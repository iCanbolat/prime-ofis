/**
 * Mock backend gönderim servisi: bildirimleri personelin dış kanallarına dağıtır ve mükellefe
 * mesaj gönderir. Her gönderim `gonderim` koleksiyonuna (outbox) yazılır. Gerçek backend bu
 * kayıtları kuyruktan işler; burada `mockGonder` sonucu anında yazılır.
 */
import { turKategorisi } from "@/features/bildirim/gorunum"
import {
  epostaLinki,
  mesajOlustur,
  portalLinki,
  talepDegiskenleri,
  whatsappLinki,
  type SablonDegiskenleri,
} from "@prime/shared/evrak-talebi/mesaj"
import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"
import type { KanalMesaji } from "@prime/shared/kanal/kanal-adapter"
import {
  adresMaskele,
  kanalHazir,
  mukellefKanali,
  personelKanallari,
} from "@prime/shared/kanal/kurallar"
import { E_POSTA_KONU } from "@prime/shared/kanal/sabitler"
import { acikBorclar, cariDurum } from "@prime/shared/tahsilat/kurallar"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import { bugun } from "@prime/shared/lib/tarih"
import { db } from "@/mocks/db"
import { mockGonder } from "@/mocks/kanal/mock-adapter"
import type {
  MukellefGonderHedef,
  MukellefGonderRequest,
  MukellefGonderSonucu,
} from "@prime/shared/types/api"
import type {
  Bildirim,
  Gonderim,
  KanalAyari,
  KanalTip,
  MesajSablonTip,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

type YeniGonderim = Omit<Gonderim, "id">

export function kanalAyari(tip: KanalTip): KanalAyari | undefined {
  return db.kanal.find(tip)
}

/** Mesajı kanal adaptörüne verir ve outbox kaydını (henüz yazmadan) hazırlar */
export function gonderimHazirla(
  ayar: KanalAyari,
  mesaj: KanalMesaji,
  kayit: Omit<
    YeniGonderim,
    | "kanal"
    | "adres"
    | "durum"
    | "hataMesaji"
    | "denemeSayisi"
    | "zaman"
    | "konu"
    | "ozet"
    | "sablon"
  >
): YeniGonderim {
  const sonuc = mockGonder(ayar, mesaj)
  return {
    ...kayit,
    kanal: ayar.tip,
    adres: adresMaskele(ayar.tip, mesaj.adres),
    konu: mesaj.konu,
    ozet: mesaj.metin.slice(0, 280),
    sablon: mesaj.whatsappSablon,
    durum: sonuc.basarili ? "GONDERILDI" : "HATA",
    hataMesaji: sonuc.hataMesaji,
    denemeSayisi: 1,
    zaman: new Date().toISOString(),
  }
}

function personelAdresi(p: Personel, kanal: KanalTip): string | undefined {
  if (kanal === "EPOSTA") return p.eposta
  if (kanal === "WHATSAPP") return p.telefon
  return db.bildirimTercihi.find(p.id)?.telegramChatId
}

/**
 * Bildirimin alıcılarını (kişiye özelse o kişi, yayınsa aktör dışındaki herkes) tercihlerine
 * göre dış kanallara dağıtır. Yazılmadan döner; çağıran `insertMany` ile toplu yazar.
 */
export function bildirimGonderimleri(
  b: Omit<Bildirim, "id"> & { id?: string }
): YeniGonderim[] {
  const hazir = (["EPOSTA", "TELEGRAM", "WHATSAPP"] as const)
    .map((t) => kanalAyari(t))
    .filter((a): a is KanalAyari => kanalHazir(a))
  if (hazir.length === 0) return []
  const kategori = turKategorisi(b.tur)
  const alicilar =
    b.aliciId !== null
      ? [db.personel.find(b.aliciId)].filter((p): p is Personel => Boolean(p))
      : db.personel.where((p) => p.aktif && p.id !== b.aktorId)
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const metin = [b.baslik, b.aciklama, b.link && `${origin}${b.link}`]
    .filter(Boolean)
    .join("\n")

  const sonuc: YeniGonderim[] = []
  for (const p of alicilar) {
    const tercih = db.bildirimTercihi.find(p.id)
    for (const tip of personelKanallari(tercih, kategori)) {
      const ayar = hazir.find((a) => a.tip === tip)
      if (!ayar) continue
      const adres = personelAdresi(p, tip)
      // Telegram'ı bağlamamış personele Telegram denemesi yapılmaz
      if (tip === "TELEGRAM" && !adres) continue
      sonuc.push(
        gonderimHazirla(
          ayar,
          {
            adres: adres ?? "",
            konu: b.baslik,
            metin,
            whatsappSablon:
              tip === "WHATSAPP" ? "PERSONEL_HATIRLATMA" : undefined,
            parametreler: [b.baslik, b.aciklama ?? ""],
          },
          {
            aliciTip: "PERSONEL",
            aliciId: p.id,
            aliciAd: `${p.ad} ${p.soyad}`,
            kaynak: "BILDIRIM",
            kaynakId: b.id,
          }
        )
      )
    }
  }
  return sonuc
}

// --- Mükellefe gönderim ---------------------------------------------------------------

function ibanBicimle(iban: string | undefined) {
  return iban ? iban.replace(/(.{4})/g, "$1 ").trim() : "—"
}

interface HazirMesaj {
  degiskenler: SablonDegiskenleri
  ekArsivDosyaId?: string
  kaynak: Gonderim["kaynak"]
  kaynakId?: string
  hata?: string
}

function degiskenleriHazirla(
  sablon: MesajSablonTip,
  m: Mukellef,
  hedef: MukellefGonderHedef,
  buroAd: string,
  iban: string | undefined,
  neden?: string
): HazirMesaj {
  const temel = { unvan: m.unvan, buro: buroAd }
  if (sablon === "TALEP" || sablon === "RED") {
    const t = hedef.talepId ? db.talep.find(hedef.talepId) : undefined
    if (!t || t.mukellefId !== m.id)
      return {
        degiskenler: temel,
        kaynak: "TALEP",
        hata: "Evrak talebi bulunamadı",
      }
    return {
      degiskenler: talepDegiskenleri({
        mukellefUnvan: m.unvan,
        buroAd,
        donem: t.donem,
        istenenler: t.istenenler,
        link: portalLinki(t.token, window.location.origin),
        sonKullanma: t.sonKullanma,
        neden,
      }),
      kaynak: "TALEP",
      kaynakId: t.id,
      hata:
        t.durum !== "AKTIF" || new Date(t.sonKullanma) < new Date()
          ? "Talep aktif değil"
          : undefined,
    }
  }
  if (sablon === "TAHAKKUK") {
    const tk = hedef.tahakkukId ? db.tahakkuk.find(hedef.tahakkukId) : undefined
    if (!tk || tk.mukellefId !== m.id)
      return {
        degiskenler: temel,
        kaynak: "TAHAKKUK",
        hata: "Tahakkuk bulunamadı",
      }
    return {
      degiskenler: {
        ...temel,
        donem: donemEtiketi(tk.donem),
        beyan: YUKUMLULUK_TANIMLARI[tk.tip].ad,
        tutar: tk.odenecek !== undefined ? formatTRY(tk.odenecek) : "—",
        vade: tk.vade ? formatDate(tk.vade) : "—",
      },
      ekArsivDosyaId: tk.arsivDosyaId,
      kaynak: "TAHAKKUK",
      kaynakId: tk.id,
    }
  }
  const hareketler = db.cari.where((h) => h.mukellefId === m.id)
  const durum = cariDurum(hareketler, bugun())
  const byId = new Map(hareketler.map((h) => [h.id, h]))
  const donemler = [
    ...new Set(
      acikBorclar(hareketler).map((b) => {
        const h = byId.get(b.id)!
        return h.donem
          ? formatDonem(h.donem)
          : (h.aciklama ?? formatDate(h.tarih))
      })
    ),
  ]
  return {
    degiskenler: {
      ...temel,
      bakiye: formatTRY(durum.acikBorc),
      donemler: donemler.join(", "),
      iban: ibanBicimle(iban),
    },
    kaynak: "BORC",
    hata: durum.acikBorc <= 0 ? "Açık borcu yok" : undefined,
  }
}

/** Şablondaki değişkenlerin geçiş sırası → WhatsApp şablon parametreleri */
function parametreler(sablonMetni: string, d: SablonDegiskenleri): string[] {
  return [...sablonMetni.matchAll(/\{(\w+)\}/g)].map(
    ([, ad]) => d[ad as keyof SablonDegiskenleri] ?? ""
  )
}

/**
 * Mükellef(ler)e şablonlu mesaj. Kanal sunucudan gönderebiliyorsa gönderir; değilse wa.me / mailto
 * bağlantısı döner (ELLE). `onizleme` true ise hiçbir şey yazılmaz.
 */
export function mukellefeGonder(
  req: MukellefGonderRequest,
  gonderenId: string
): MukellefGonderSonucu[] {
  const [buro] = db.buro.all()
  const sablonMetni =
    buro?.mesajSablonlari?.[req.sablon] ?? VARSAYILAN_SABLONLAR[req.sablon]
  const sonuclar: MukellefGonderSonucu[] = []
  const yazilacak: [MukellefGonderSonucu, YeniGonderim][] = []

  for (const hedef of req.hedefler) {
    const m = db.mukellef.find(hedef.mukellefId)
    if (!m) continue
    const kanal = mukellefKanali(m, req.kanal)
    const ayar = kanalAyari(kanal)
    const sunucudan = kanalHazir(ayar)
    const h = degiskenleriHazirla(
      req.sablon,
      m,
      hedef,
      buro?.ad ?? "",
      buro?.iban,
      req.neden
    )
    const adres = kanal === "WHATSAPP" ? m.telefon : m.eposta
    const konu = `${E_POSTA_KONU[req.sablon] ?? "Bilgilendirme"} — ${buro?.ad ?? ""}`
    // WhatsApp Business onaylı şablonla gider; serbest metin yalnızca e-posta ve wa.me'de
    const serbest = req.metin?.trim() && req.hedefler.length === 1
    const mesaj =
      serbest && !(kanal === "WHATSAPP" && sunucudan)
        ? req.metin!.trim()
        : mesajOlustur(sablonMetni, h.degiskenler)
    const sonuc: MukellefGonderSonucu = {
      mukellefId: m.id,
      unvan: m.unvan,
      kanal,
      adres,
      konu,
      mesaj,
      sunucudan,
      hataMesaji: h.hata,
    }
    sonuclar.push(sonuc)
    if (req.onizleme) continue
    if (h.hata) {
      sonuc.durum = "HATA"
      continue
    }

    const kayit = {
      aliciTip: "MUKELLEF" as const,
      aliciId: m.id,
      aliciAd: m.unvan,
      kaynak: h.kaynak,
      kaynakId: h.kaynakId,
      gonderenId,
    }
    let yeni: YeniGonderim
    if (sunucudan && ayar) {
      yeni = gonderimHazirla(
        ayar,
        {
          adres,
          konu,
          metin: mesaj,
          whatsappSablon: kanal === "WHATSAPP" ? req.sablon : undefined,
          parametreler: parametreler(sablonMetni, h.degiskenler),
          ekArsivDosyaId: h.ekArsivDosyaId,
        },
        kayit
      )
    } else {
      const link =
        kanal === "WHATSAPP"
          ? whatsappLinki(adres, mesaj)
          : epostaLinki(adres, konu, mesaj)
      if (!link) {
        sonuc.durum = "HATA"
        sonuc.hataMesaji =
          kanal === "WHATSAPP"
            ? "Mükellefin geçerli cep telefonu yok"
            : "Mükellefin geçerli e-posta adresi yok"
        continue
      }
      sonuc.link = link
      yeni = {
        ...kayit,
        kanal,
        adres: adresMaskele(kanal, adres),
        konu,
        ozet: mesaj.slice(0, 280),
        durum: "ELLE",
        denemeSayisi: 0,
        zaman: new Date().toISOString(),
      }
    }
    sonuc.durum = yeni.durum
    sonuc.hataMesaji = yeni.hataMesaji
    yazilacak.push([sonuc, yeni])
  }

  const eklenen = db.gonderim.insertMany(yazilacak.map(([, g]) => g))
  yazilacak.forEach(([sonuc], i) => (sonuc.gonderimId = eklenen[i]!.id))
  return sonuclar
}
