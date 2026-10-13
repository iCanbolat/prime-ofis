import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleInit,
} from "@nestjs/common"
import { eq, inArray } from "drizzle-orm"

import { KANAL_TIPLERI, kanalKaydiHazirla, tercihHatasi } from "@prime/shared/kanal/girdi"
import { kanalHazir, VARSAYILAN_TERCIH } from "@prime/shared/kanal/kurallar"
import { KANAL_ETIKET } from "@prime/shared/kanal/sabitler"
import type {
  BildirimTercihKaydetRequest,
  BildirimTercihView,
  KanalKaydetRequest,
  KanallarResponse,
} from "@prime/shared/types/api"
import type { BildirimTercihi, KanalAyari, KanalTip, Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { SecretBox, sonDort } from "../core/secret-box.js"
import type { DrizzleTx } from "../db/db.module.js"
import { bildirimTercihi, kanalAyari, type KanalAyarAlanlari } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { KanalSaglayici } from "./saglayici.js"

/** Telegram ertelendi: yapılandırılamaz, `GET /kanallar`'da hep `null` */
export const DESTEKLENEN_KANALLAR: KanalTip[] = ["EPOSTA", "WHATSAPP"]
const TELEGRAM_YOK = "Telegram kanalı henüz desteklenmiyor"

type KanalSatiri = typeof kanalAyari.$inferSelect

export function kanalSatirindan(s: KanalSatiri): KanalAyari {
  const { tip, ayar, gizli: _gizli, ...rest } = s
  return { ...nullsuz(rest), ...ayar, id: tip, tip } as KanalAyari
}

/** Sunucuda gönderim için ayar ve çözülmüş gizli değer */
export interface HazirKanal {
  ayar: KanalAyari
  gizli?: string
}

@Injectable()
export class KanalService implements OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly saglayici: KanalSaglayici,
    private readonly kutu: SecretBox,
    private readonly saat: Saat,
    private readonly seed: SeedYukleyici
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      const kanallar = state.kanal.filter((k) => DESTEKLENEN_KANALLAR.includes(k.tip))
      if (kanallar.length) await db.insert(kanalAyari).values(kanallar.map(kanalSatiri))
      if (state.bildirimTercihi.length) {
        await db.insert(bildirimTercihi).values(
          state.bildirimTercihi.map((t) => ({ personelId: t.id, kanallar: t.kanallar }))
        )
      }
    })
  }

  async liste(): Promise<KanallarResponse> {
    const satirlar = await this.txHost.tx.select().from(kanalAyari)
    const bul = (tip: KanalTip) => {
      const s = satirlar.find((k) => k.tip === tip)
      return s && DESTEKLENEN_KANALLAR.includes(tip) ? kanalSatirindan(s) : null
    }
    return { EPOSTA: bul("EPOSTA"), TELEGRAM: null, WHATSAPP: bul("WHATSAPP") }
  }

  async bul(tip: KanalTip): Promise<KanalAyari | undefined> {
    if (!DESTEKLENEN_KANALLAR.includes(tip)) return undefined
    const [s] = await this.txHost.tx.select().from(kanalAyari).where(eq(kanalAyari.tip, tip))
    return s && kanalSatirindan(s)
  }

  /** Sunucudan gönderebilen (aktif + bağlı) kanallar, gizli değerleriyle */
  async hazirKanallar(): Promise<Map<KanalTip, HazirKanal>> {
    const satirlar = await this.txHost.tx
      .select()
      .from(kanalAyari)
      .where(inArray(kanalAyari.tip, DESTEKLENEN_KANALLAR))
    const sonuc = new Map<KanalTip, HazirKanal>()
    for (const s of satirlar) {
      const ayar = kanalSatirindan(s)
      if (!kanalHazir(ayar)) continue
      sonuc.set(s.tip, { ayar, gizli: s.gizli ? this.kutu.coz(s.gizli) : undefined })
    }
    return sonuc
  }

  async kaydet(aktor: Personel, tip: KanalTip, body: KanalKaydetRequest): Promise<KanalAyari> {
    if (!KANAL_TIPLERI.includes(tip)) throw new NotFoundException({ message: "Kanal bulunamadı" })
    if (tip === "TELEGRAM") throw new BadRequestException({ message: TELEGRAM_YOK })
    if (body?.tip !== tip) throw new BadRequestException({ message: "Kanal tipi uyuşmuyor" })
    const [mevcut] = await this.txHost.tx.select().from(kanalAyari).where(eq(kanalAyari.tip, tip))
    const hazir = kanalKaydiHazirla(body, Boolean(mevcut))
    if (typeof hazir === "string") throw new BadRequestException({ message: hazir })

    const { id: _id, tip: _tip, aktif, ...alanlar } = hazir.ayar
    const satir: KanalSatiri = {
      tip,
      aktif,
      durum: "BAGLI",
      ayar: alanlar as KanalAyarAlanlari,
      gizli: hazir.gizli ? this.kutu.sifrele(hazir.gizli) : (mevcut?.gizli ?? null),
      gizliIpucu: hazir.gizli ? sonDort(hazir.gizli) : (mevcut?.gizliIpucu ?? null),
      sonTest: mevcut?.sonTest ?? null,
      hataMesaji: null,
      guncelleyenId: aktor.id,
      guncellemeTarihi: this.saat.simdiIso(),
    }
    if (hazir.gizli) {
      // Sağlayıcıya (ağ) bağlanılırken transaction açık tutulmaz
      const d = await this.saglayici.dogrula(kanalSatirindan(satir), hazir.gizli)
      if (!d.gecerli)
        throw new UnprocessableEntityException({ message: d.hataMesaji ?? "Bağlantı kurulamadı" })
    }
    return this.yaz(aktor, satir)
  }

  @Transactional()
  private async yaz(aktor: Personel, satir: KanalSatiri): Promise<KanalAyari> {
    const { tip: _tip, ...guncelleme } = satir
    await this.txHost.tx
      .insert(kanalAyari)
      .values(satir)
      .onConflictDoUpdate({ target: kanalAyari.tip, set: guncelleme })
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "KANAL_GUNCELLENDI",
        aciklama: `${KANAL_ETIKET[satir.tip]}${satir.aktif ? "" : " (pasif)"}`,
      },
      false
    )
    return kanalSatirindan(satir)
  }

  @Transactional()
  async kaldir(aktor: Personel, tip: KanalTip) {
    const silinen = await this.txHost.tx
      .delete(kanalAyari)
      .where(eq(kanalAyari.tip, tip))
      .returning({ tip: kanalAyari.tip })
    if (!silinen.length) throw new NotFoundException({ message: "Kanal yapılandırılmamış" })
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "KANAL_KALDIRILDI", aciklama: KANAL_ETIKET[tip] },
      false
    )
  }

  async sonTestYaz(tip: KanalTip) {
    await this.txHost.tx
      .update(kanalAyari)
      .set({ sonTest: this.saat.simdiIso() })
      .where(eq(kanalAyari.tip, tip))
  }

  // --- Bildirim tercihleri -----------------------------------------------------------

  async tercih(aktor: Personel): Promise<BildirimTercihView> {
    const [t] = await this.tercihler([aktor.id])
    return tercihView(aktor, t)
  }

  async tercihKaydet(aktor: Personel, body: BildirimTercihKaydetRequest) {
    const hata = tercihHatasi(body?.kanallar)
    if (hata) throw new BadRequestException({ message: hata })
    await this.txHost.tx
      .insert(bildirimTercihi)
      .values({ personelId: aktor.id, kanallar: body.kanallar })
      .onConflictDoUpdate({ target: bildirimTercihi.personelId, set: { kanallar: body.kanallar } })
    return this.tercih(aktor)
  }

  async tercihler(personelIdler: string[]): Promise<BildirimTercihi[]> {
    if (!personelIdler.length) return []
    const satirlar = await this.txHost.tx
      .select()
      .from(bildirimTercihi)
      .where(inArray(bildirimTercihi.personelId, personelIdler))
    return satirlar.map((t) => ({ id: t.personelId, kanallar: t.kanallar }))
  }
}

function tercihView(p: Personel, t: BildirimTercihi | undefined): BildirimTercihView {
  return {
    id: p.id,
    // Kayıt yoksa varsayılan tercih geçerlidir
    kanallar: t?.kanallar ?? VARSAYILAN_TERCIH,
    eposta: p.eposta,
    telefon: p.telefon,
    telegramBagli: false,
  }
}

/** Seed / fixture kaydı → satır (seed'de gizli değer yok; mock sağlayıcı istemez) */
function kanalSatiri(k: KanalAyari): KanalSatiri {
  const {
    id: _id,
    tip,
    aktif,
    durum,
    gizliIpucu,
    sonTest,
    hataMesaji,
    guncelleyenId,
    guncellemeTarihi,
    ...ayar
  } = k
  return {
    tip,
    aktif,
    durum,
    ayar: ayar as KanalAyarAlanlari,
    gizli: null,
    gizliIpucu: gizliIpucu ?? null,
    sonTest: sonTest ?? null,
    hataMesaji: hataMesaji ?? null,
    guncelleyenId: guncelleyenId ?? null,
    guncellemeTarihi: guncellemeTarihi ?? null,
  }
}
