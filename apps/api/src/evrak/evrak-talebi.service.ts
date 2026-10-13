import { randomBytes } from "node:crypto"

import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm"

import {
  TALEP_MAKS_GUN,
  sonKullanmaHesapla,
  talepDurumu,
  yenidenAcSonKullanma,
} from "@prime/shared/evrak-talebi/durum"
import {
  ISTENEN_EVRAKLAR,
  ISTENEN_SIRASI,
  KANAL_ETIKET,
} from "@prime/shared/evrak-talebi/sabitler"
import { formatDonem } from "@prime/shared/lib/format"
import type { GorevBagliTalep, TalepDetay, TalepView } from "@prime/shared/types/api"
import type {
  EvrakTalebi,
  GelenEvrak,
  IstenenEvrak,
  Personel,
  TalepDurumu,
  TalepKanal,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { aktorOzeti, BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { evrakTalebi, gelenEvrak, mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { GorevService } from "../gorev/gorev.service.js"

export interface TalepListeSorgusu {
  mukellefId?: string
  durum?: string
  q?: string
}

type Govde = Record<string, unknown>

export const KANALLAR: TalepKanal[] = ["WHATSAPP", "EPOSTA", "LINK"]
const DONEM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })
const cakisma = (message: string) => new ConflictException({ message })
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const icerir = (metin: string, q: string) => kucuk(metin).includes(kucuk(q))

export const talepSatirindan = (t: typeof evrakTalebi.$inferSelect): EvrakTalebi => nullsuz(t)
export const gelenSatirindan = (g: typeof gelenEvrak.$inferSelect): GelenEvrak => nullsuz(g)

/** Magic link token'ı: 32 bayt rastgele, base64url (43 karakter) */
export const tokenUret = () => randomBytes(32).toString("base64url")

function talepAciklama(t: Pick<EvrakTalebi, "istenenler" | "donem">) {
  const evraklar = t.istenenler.map((i) => ISTENEN_EVRAKLAR[i].ad).join(", ")
  return t.donem ? `${formatDonem(t.donem)} · ${evraklar}` : evraklar
}

@Injectable()
export class EvrakTalebiService implements OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly bildirimler: BildirimService,
    private readonly gorevler: GorevService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    // EVRAK olaylarının alıcısı talebi oluşturan (gelen evraksa onun talebi)
    this.bildirimler.cozucuEkle({
      oncelik: 20,
      cozumle: async (log) => {
        if (log.hedefTip !== "EVRAK" || !log.hedefId) return undefined
        const [g] = await this.txHost.tx
          .select({ talepId: gelenEvrak.talepId })
          .from(gelenEvrak)
          .where(eq(gelenEvrak.id, log.hedefId))
        const talepId = g?.talepId ?? log.hedefId
        const [t] = await this.txHost.tx
          .select({ olusturan: evrakTalebi.olusturanId })
          .from(evrakTalebi)
          .where(eq(evrakTalebi.id, talepId))
        return { ...(t && { alici: t.olusturan }), ...(g && { baglam: { talepId } }) }
      },
    })
    this.gorevler.talepKaynagiAyarla({
      ozetler: (ids) => this.gorevOzetleri(ids),
      mukellefleri: async (ids) => {
        const satirlar = await this.txHost.tx
          .select({ id: evrakTalebi.id, mukellefId: evrakTalebi.mukellefId })
          .from(evrakTalebi)
          .where(inArray(evrakTalebi.id, ids))
        return new Map(satirlar.map((s) => [s.id, s.mukellefId]))
      },
    })
    this.seed.adimEkle(async (state, db) => {
      if (state.talep.length) await db.insert(evrakTalebi).values(state.talep)
      if (state.gelen.length) await db.insert(gelenEvrak).values(state.gelen)
    })
  }

  durum(t: Pick<EvrakTalebi, "durum" | "sonKullanma">): TalepDurumu {
    return talepDurumu(t, this.saat.simdi())
  }

  // --- Okuma ---------------------------------------------------------------

  /** Mükellef iletişim bilgisi, oluşturan ve yükleme sayılarıyla talepler */
  async gorunumler(...kosullar: (SQL | undefined)[]): Promise<TalepView[]> {
    const sayilar = this.txHost.tx
      .select({
        talepId: gelenEvrak.talepId,
        toplam: sql<number>`count(*)::int`.as("toplam"),
        bekleyen: sql<number>`count(*) filter (where ${gelenEvrak.durum} = 'BEKLIYOR')::int`.as(
          "bekleyen"
        ),
      })
      .from(gelenEvrak)
      .groupBy(gelenEvrak.talepId)
      .as("sayilar")
    const satirlar = await this.txHost.tx
      .select({
        t: evrakTalebi,
        unvan: mukellef.unvan,
        telefon: mukellef.telefon,
        eposta: mukellef.eposta,
        olusturan: aktorOzeti,
        toplam: sayilar.toplam,
        bekleyen: sayilar.bekleyen,
      })
      .from(evrakTalebi)
      .innerJoin(mukellef, eq(mukellef.id, evrakTalebi.mukellefId))
      .leftJoin(personel, eq(personel.id, evrakTalebi.olusturanId))
      .leftJoin(sayilar, eq(sayilar.talepId, evrakTalebi.id))
      .where(and(...kosullar))
    return satirlar.map((s) => {
      const t = talepSatirindan(s.t)
      return {
        ...t,
        durum: this.durum(t),
        mukellefUnvan: s.unvan,
        mukellefTelefon: s.telefon,
        mukellefEposta: s.eposta,
        olusturan: s.olusturan,
        yuklemeSayisi: s.toplam ?? 0,
        bekleyenSayisi: s.bekleyen ?? 0,
      }
    })
  }

  async gorunum(id: string): Promise<TalepView> {
    const [v] = await this.gorunumler(eq(evrakTalebi.id, id))
    if (!v) throw new NotFoundException({ message: "Talep bulunamadı" })
    return v
  }

  async liste(s: TalepListeSorgusu): Promise<TalepView[]> {
    const q = s.q?.trim()
    return (await this.gorunumler(s.mukellefId ? eq(evrakTalebi.mukellefId, s.mukellefId) : undefined))
      .filter(
        (t) =>
          (!s.durum || t.durum === s.durum) &&
          (!q ||
            icerir(t.mukellefUnvan, q) ||
            t.istenenler.some((i) => icerir(ISTENEN_EVRAKLAR[i].ad, q)))
      )
      .sort((a, b) => b.olusturmaTarihi.localeCompare(a.olusturmaTarihi))
  }

  async detay(id: string): Promise<TalepDetay> {
    const v = await this.gorunum(id)
    const gelenler = await this.txHost.tx
      .select()
      .from(gelenEvrak)
      .where(eq(gelenEvrak.talepId, id))
      .orderBy(desc(gelenEvrak.yuklemeTarihi))
    return { ...v, gelenler: gelenler.map(gelenSatirindan) }
  }

  private async gorevOzetleri(ids: string[]): Promise<GorevBagliTalep[]> {
    const satirlar = await this.txHost.tx
      .select()
      .from(evrakTalebi)
      .where(inArray(evrakTalebi.id, ids))
    const harita = new Map(satirlar.map((s) => [s.id, talepSatirindan(s)]))
    return ids.flatMap((id) => {
      const t = harita.get(id)
      return t
        ? [
            {
              id: t.id,
              durum: this.durum(t),
              istenenler: t.istenenler,
              ...(t.donem ? { donem: t.donem } : {}),
              olusturmaTarihi: t.olusturmaTarihi,
            },
          ]
        : []
    })
  }

  // --- Yazma ---------------------------------------------------------------

  /** Talep satırını kilitler (yükleme / tamamlama / inceleme ile yarışmasın) */
  async kilitle(id: string): Promise<EvrakTalebi> {
    const [t] = await this.txHost.tx
      .select()
      .from(evrakTalebi)
      .where(eq(evrakTalebi.id, id))
      .for("update")
    if (!t) throw new NotFoundException({ message: "Talep bulunamadı" })
    return talepSatirindan(t)
  }

  /** Müşterinin tekrar yükleyebileceği hale getirir: aktif + en az 7 gün süre */
  async yenidenAcYaz(t: EvrakTalebi) {
    await this.txHost.tx
      .update(evrakTalebi)
      .set({
        durum: "AKTIF",
        tamamlanmaTarihi: null,
        sonKullanma: yenidenAcSonKullanma(t, this.saat.simdi()),
      })
      .where(eq(evrakTalebi.id, t.id))
  }

  private gunDogrula(deger: unknown, mesaj: string) {
    const gun = Number(deger)
    if (!Number.isInteger(gun) || gun < 1 || gun > TALEP_MAKS_GUN) throw hata(mesaj)
    return gun
  }

  @Transactional()
  async olustur(aktor: Personel, body: unknown): Promise<TalepView> {
    const b = govde(body)
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id })
      .from(mukellef)
      .where(eq(mukellef.id, typeof b.mukellefId === "string" ? b.mukellefId : ""))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    const secilen = new Set(Array.isArray(b.istenenler) ? b.istenenler : [])
    const istenenler = ISTENEN_SIRASI.filter((i) => secilen.has(i))
    if (istenenler.length === 0) throw hata("En az bir evrak seçin")
    if (!KANALLAR.includes(b.kanal as TalepKanal)) throw hata("Geçersiz kanal")
    const donem = b.donem || undefined
    if (donem !== undefined && (typeof donem !== "string" || !DONEM_RE.test(donem)))
      throw hata("Geçersiz dönem")
    const gun = this.gunDogrula(b.gecerlilikGun, `Geçerlilik 1-${TALEP_MAKS_GUN} gün olmalı`)
    const aciklama = typeof b.aciklama === "string" ? b.aciklama.trim() : ""

    const simdi = this.saat.simdi()
    const t: EvrakTalebi = {
      id: newId("e"),
      mukellefId: m.id,
      token: tokenUret(),
      kanal: b.kanal as TalepKanal,
      istenenler: istenenler as IstenenEvrak[],
      ...(donem ? { donem } : {}),
      ...(aciklama ? { aciklama } : {}),
      durum: "AKTIF",
      sonKullanma: sonKullanmaHesapla(gun, simdi),
      olusturanId: aktor.id,
      olusturmaTarihi: simdi.toISOString(),
      gonderimler: [],
    }
    await this.txHost.tx.insert(evrakTalebi).values(t)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TALEP_OLUSTURULDU",
      hedefTip: "EVRAK",
      hedefId: t.id,
      mukellefId: m.id,
      aciklama: talepAciklama(t),
    })
    return this.gorunum(t.id)
  }

  @Transactional()
  async gonderim(aktor: Personel, id: string, body: unknown): Promise<TalepView> {
    const t = await this.kilitle(id)
    if (this.durum(t) !== "AKTIF") throw cakisma("Yalnızca aktif talepler gönderilebilir")
    const kanal = govde(body).kanal as TalepKanal
    if (!KANALLAR.includes(kanal)) throw hata("Geçersiz kanal")
    await this.txHost.tx
      .update(evrakTalebi)
      .set({
        kanal,
        gonderimler: [
          ...t.gonderimler,
          { kanal, zaman: this.saat.simdiIso(), gonderenId: aktor.id },
        ],
      })
      .where(eq(evrakTalebi.id, id))
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TALEP_GONDERILDI",
      hedefTip: "EVRAK",
      hedefId: id,
      mukellefId: t.mukellefId,
      aciklama: KANAL_ETIKET[kanal],
    })
    return this.gorunum(id)
  }

  @Transactional()
  async uzat(aktor: Personel, id: string, body: unknown): Promise<TalepView> {
    const t = await this.kilitle(id)
    if (t.durum !== "AKTIF")
      throw cakisma("Yalnızca aktif veya süresi dolmuş talepler uzatılabilir")
    const gun = this.gunDogrula(
      govde(body).gun,
      `1-${TALEP_MAKS_GUN} gün arasında bir süre seçin`
    )
    // Süresi dolmuşsa bugünden, dolmamışsa mevcut son günden itibaren uzatılır
    const simdi = this.saat.simdi()
    const mevcut = new Date(t.sonKullanma)
    await this.txHost.tx
      .update(evrakTalebi)
      .set({ sonKullanma: sonKullanmaHesapla(gun, mevcut > simdi ? mevcut : simdi) })
      .where(eq(evrakTalebi.id, id))
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TALEP_UZATILDI",
      hedefTip: "EVRAK",
      hedefId: id,
      mukellefId: t.mukellefId,
      aciklama: `${gun} gün`,
    })
    return this.gorunum(id)
  }

  @Transactional()
  async iptal(aktor: Personel, id: string): Promise<TalepView> {
    const t = await this.kilitle(id)
    if (t.durum === "IPTAL") throw cakisma("Talep zaten iptal edilmiş")
    await this.txHost.tx.update(evrakTalebi).set({ durum: "IPTAL" }).where(eq(evrakTalebi.id, id))
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TALEP_IPTAL_EDILDI",
      hedefTip: "EVRAK",
      hedefId: id,
      mukellefId: t.mukellefId,
      aciklama: talepAciklama(t),
    })
    return this.gorunum(id)
  }

  @Transactional()
  async yenidenAc(aktor: Personel, id: string): Promise<TalepView> {
    const t = await this.kilitle(id)
    if (t.durum !== "TAMAMLANDI")
      throw cakisma("Yalnızca tamamlanmış talepler yeniden açılabilir")
    await this.yenidenAcYaz(t)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "TALEP_YENIDEN_ACILDI",
      hedefTip: "EVRAK",
      hedefId: id,
      mukellefId: t.mukellefId,
    })
    return this.gorunum(id)
  }
}
