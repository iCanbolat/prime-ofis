import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { BadRequestException, Inject, Injectable } from "@nestjs/common"
import { eq, inArray, sql } from "drizzle-orm"

import { KANAL_ETIKET as TALEP_KANAL_ETIKET, VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"
import {
  epostaLinki,
  mesajOlustur,
  portalLinki,
  talepDegiskenleri,
  whatsappLinki,
  type SablonDegiskenleri,
} from "@prime/shared/evrak-talebi/mesaj"
import { mukellefGonderHatasi } from "@prime/shared/kanal/girdi"
import { mukellefKanali } from "@prime/shared/kanal/kurallar"
import { E_POSTA_KONU } from "@prime/shared/kanal/sabitler"
import { formatDate, formatDonem, formatTRY } from "@prime/shared/lib/format"
import { toYmd } from "@prime/shared/lib/tarih"
import { acikBorclar, cariDurum } from "@prime/shared/tahsilat/kurallar"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import type {
  MukellefGonderHedef,
  MukellefGonderRequest,
  MukellefGonderResponse,
  MukellefGonderSonucu,
} from "@prime/shared/types/api"
import type {
  Buro,
  GonderimKaynak,
  MesajSablonTip,
  Mukellef,
  Personel,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { BuroService } from "../buro/buro.service.js"
import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { cariHareket, evrakTalebi, mukellef, tahakkuk } from "../db/schema/index.js"
import { cariSatirindan } from "../tahsilat/cari-yazici.js"
import { UcretBorclari } from "../tahsilat/ucret-borclari.js"
import { GonderimService, type YeniGonderim } from "./gonderim.service.js"
import { KanalService } from "./kanal.service.js"

interface HazirMesaj {
  degiskenler: SablonDegiskenleri
  ekArsivDosyaId?: string
  kaynak: GonderimKaynak
  kaynakId?: string
  hata?: string
}

const ibanBicimle = (iban: string | undefined) =>
  iban ? iban.replace(/(.{4})/g, "$1 ").trim() : "—"

/** Şablondaki değişkenlerin geçiş sırası → WhatsApp şablon parametreleri */
const parametreler = (sablonMetni: string, d: SablonDegiskenleri): string[] =>
  [...sablonMetni.matchAll(/\{(\w+)\}/g)].map(
    ([, ad]) => d[ad as keyof SablonDegiskenleri] ?? ""
  )

/**
 * `POST /gonderim/mukellef` (mock `mukellefeGonder` + handler yan etkileri). Kanal sunucudan
 * gönderebiliyorsa outbox'a `KUYRUKTA` yazılır; değilse wa.me / mailto bağlantısı (ELLE).
 * `onizleme` hiçbir şey yazmaz.
 */
@Injectable()
export class MukellefGonderimi {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    @Inject(ENV) private readonly env: Env,
    private readonly kanallar: KanalService,
    private readonly gonderimler: GonderimService,
    private readonly buro: BuroService,
    private readonly aktiviteler: AktiviteService,
    private readonly ucretler: UcretBorclari,
    private readonly saat: Saat
  ) {}

  async gonder(aktor: Personel, body: MukellefGonderRequest): Promise<MukellefGonderResponse> {
    const hata = mukellefGonderHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const idler = [...new Set(body.hedefler.map((h) => h.mukellefId))]
    // Borç hatırlatması bu ayın ücret borcu oluşmuş hâliyle hesaplansın
    if (body.sablon === "BORC_HATIRLATMA") {
      for (const id of idler) await this.ucretler.mukellefIcin(id)
    }
    const sonuclar = await this.yaz(aktor, body, idler)
    return { sonuclar }
  }

  @Transactional()
  private async yaz(
    aktor: Personel,
    req: MukellefGonderRequest,
    idler: string[]
  ): Promise<MukellefGonderSonucu[]> {
    const tx = this.txHost.tx
    // Transaction tek bağlantı kullanır: sorgular sırayla
    const buro = await this.buro.getir()
    const mukellefler = await tx.select().from(mukellef).where(inArray(mukellef.id, idler))
    const hazir = await this.kanallar.hazirKanallar()
    const mMap = new Map(mukellefler.map((m) => [m.id, m as unknown as Mukellef]))
    const sablonMetni = buro.mesajSablonlari?.[req.sablon] ?? VARSAYILAN_SABLONLAR[req.sablon]
    const konu = `${E_POSTA_KONU[req.sablon] ?? "Bilgilendirme"} — ${buro.ad}`
    const sonuclar: MukellefGonderSonucu[] = []

    for (const hedef of req.hedefler) {
      const m = mMap.get(hedef.mukellefId)
      if (!m) continue
      const kanal = mukellefKanali(m, req.kanal)
      const sunucudan = hazir.has(kanal)
      const h = await this.degiskenler(req.sablon, m, hedef, buro, req.neden)
      const adres = kanal === "WHATSAPP" ? m.telefon : m.eposta
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
        ...(h.hata ? { hataMesaji: h.hata } : {}),
      }
      sonuclar.push(sonuc)
      if (req.onizleme) continue
      if (h.hata) {
        sonuc.durum = "HATA"
        continue
      }

      const yeni: YeniGonderim = {
        kanal,
        aliciTip: "MUKELLEF",
        aliciId: m.id,
        aliciAd: m.unvan,
        hedefAdres: adres,
        konu,
        metin: mesaj,
        kaynak: h.kaynak,
        kaynakId: h.kaynakId,
        gonderenId: aktor.id,
      }
      if (sunucudan) {
        const [g] = await this.gonderimler.kuyrugaAl([
          {
            ...yeni,
            sablon: kanal === "WHATSAPP" ? req.sablon : undefined,
            parametreler: parametreler(sablonMetni, h.degiskenler),
            ekArsivDosyaId: h.ekArsivDosyaId,
          },
        ])
        sonuc.durum = "KUYRUKTA"
        sonuc.gonderimId = g!.id
      } else {
        const link =
          kanal === "WHATSAPP" ? whatsappLinki(adres, mesaj) : epostaLinki(adres, konu, mesaj)
        if (!link) {
          sonuc.durum = "HATA"
          sonuc.hataMesaji =
            kanal === "WHATSAPP"
              ? "Mükellefin geçerli cep telefonu yok"
              : "Mükellefin geçerli e-posta adresi yok"
          continue
        }
        sonuc.link = link
        sonuc.durum = "ELLE"
        sonuc.gonderimId = (await this.gonderimler.elleYaz(yeni)).id
      }
      await this.gecmiseYaz(aktor, req, hedef, sonuc)
    }
    return sonuclar
  }

  /** Evrak talebinin gönderim geçmişi ya da mükellef aktivitesi */
  private async gecmiseYaz(
    aktor: Personel,
    req: MukellefGonderRequest,
    hedef: MukellefGonderHedef,
    s: MukellefGonderSonucu
  ) {
    if ((req.sablon === "TALEP" || req.sablon === "RED") && hedef.talepId) {
      const kayit = { kanal: s.kanal, zaman: this.saat.simdiIso(), gonderenId: aktor.id }
      const [t] = await this.txHost.tx
        .update(evrakTalebi)
        .set({
          kanal: s.kanal,
          gonderimler: sql`${evrakTalebi.gonderimler} || ${JSON.stringify([kayit])}::jsonb`,
        })
        .where(eq(evrakTalebi.id, hedef.talepId))
        .returning({ id: evrakTalebi.id, mukellefId: evrakTalebi.mukellefId })
      if (t) {
        await this.aktiviteler.log(
          {
            aktorId: aktor.id,
            eylem: "TALEP_GONDERILDI",
            hedefTip: "EVRAK",
            hedefId: t.id,
            mukellefId: t.mukellefId,
            aciklama: TALEP_KANAL_ETIKET[s.kanal],
          },
          false
        )
        return
      }
    }
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "MUKELLEFE_GONDERILDI",
        hedefTip: "MUKELLEF",
        hedefId: s.mukellefId,
        mukellefId: s.mukellefId,
        aciklama: `${s.konu.split(" — ")[0]} · ${s.kanal === "WHATSAPP" ? "WhatsApp" : "E-posta"}`,
      },
      false
    )
  }

  private async degiskenler(
    sablon: MesajSablonTip,
    m: Mukellef,
    hedef: MukellefGonderHedef,
    buro: Buro,
    neden?: string
  ): Promise<HazirMesaj> {
    const tx = this.txHost.tx
    const temel = { unvan: m.unvan, buro: buro.ad }
    if (sablon === "TALEP" || sablon === "RED") {
      const [t] = hedef.talepId
        ? await tx.select().from(evrakTalebi).where(eq(evrakTalebi.id, hedef.talepId))
        : []
      if (!t || t.mukellefId !== m.id)
        return { degiskenler: temel, kaynak: "TALEP", hata: "Evrak talebi bulunamadı" }
      return {
        degiskenler: talepDegiskenleri({
          mukellefUnvan: m.unvan,
          buroAd: buro.ad,
          donem: t.donem ?? undefined,
          istenenler: t.istenenler,
          link: portalLinki(t.token, this.env.APP_URL),
          sonKullanma: t.sonKullanma,
          neden,
        }),
        kaynak: "TALEP",
        kaynakId: t.id,
        hata:
          t.durum !== "AKTIF" || new Date(t.sonKullanma) < this.saat.simdi()
            ? "Talep aktif değil"
            : undefined,
      }
    }
    if (sablon === "TAHAKKUK") {
      const [tk] = hedef.tahakkukId
        ? await tx.select().from(tahakkuk).where(eq(tahakkuk.id, hedef.tahakkukId))
        : []
      if (!tk || tk.mukellefId !== m.id)
        return { degiskenler: temel, kaynak: "TAHAKKUK", hata: "Tahakkuk bulunamadı" }
      return {
        degiskenler: {
          ...temel,
          donem: donemEtiketi(tk.donem),
          beyan: YUKUMLULUK_TANIMLARI[tk.tip].ad,
          tutar: tk.odenecek !== null ? formatTRY(tk.odenecek) : "—",
          vade: tk.vade ? formatDate(tk.vade) : "—",
        },
        ekArsivDosyaId: tk.arsivDosyaId ?? undefined,
        kaynak: "TAHAKKUK",
        kaynakId: tk.id,
      }
    }
    const hareketler = (
      await tx.select().from(cariHareket).where(eq(cariHareket.mukellefId, m.id))
    ).map(cariSatirindan)
    const durum = cariDurum(hareketler, toYmd(this.saat.simdi()))
    const byId = new Map(hareketler.map((h) => [h.id, h]))
    const donemler = [
      ...new Set(
        acikBorclar(hareketler).map((b) => {
          const h = byId.get(b.id)!
          return h.donem ? formatDonem(h.donem) : (h.aciklama ?? formatDate(h.tarih))
        })
      ),
    ]
    return {
      degiskenler: {
        ...temel,
        bakiye: formatTRY(durum.acikBorc),
        donemler: donemler.join(", "),
        iban: ibanBicimle(buro.iban),
      },
      kaynak: "BORC",
      hata: durum.acikBorc <= 0 ? "Açık borcu yok" : undefined,
    }
  }
}
