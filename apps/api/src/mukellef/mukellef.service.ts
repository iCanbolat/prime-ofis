import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, count, eq, inArray, ne, type SQL } from "drizzle-orm"

import {
  MUKELLEF_TURLERI,
  kimlikCakismaMesaji,
  mukellefGirdiSemasi,
  mukellefKimlikHatasi,
  mukellefNormalize,
} from "@prime/shared/mukellef/girdi"
import type {
  MukellefDurumFiltre,
  MukellefListResponse,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type { Mukellef, MukellefTur, Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import { istegeBagliSayfala } from "../core/sayfala.js"
import { zodDogrula } from "../core/zod.pipe.js"
import type { DrizzleTx } from "../db/db.module.js"
import { mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { PersonelService } from "../personel/personel.service.js"

export interface MukellefListeSorgusu {
  q?: string
  tur?: string | string[]
  sorumlu?: string
  durum?: string
  sirala?: string
  yon?: string
  sayfa?: string
  sayfaBoyutu?: string
}

type Girdi = ReturnType<typeof mukellefNormalize>

const DURUMLAR: MukellefDurumFiltre[] = ["aktif", "pasif", "tumu"]

/** Sorumlu değişince yeni sorumluya giden bildirim */
const SORUMLU_BILDIRIMI = { baslik: "Bir mükellefin sorumlusu oldunuz" } as const

const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")
const satirdan = (m: typeof mukellef.$inferSelect): Mukellef => nullsuz(m)

@Injectable()
export class MukellefService implements OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly bildirimler: BildirimService,
    private readonly personeller: PersonelService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    // Mükellefli olayın alıcısı (başka kural karar vermediyse) mükellefin sorumlusu
    this.bildirimler.cozucuEkle({
      oncelik: 100,
      cozumle: async (log) => {
        if (!log.mukellefId) return undefined
        const [m] = await this.txHost.tx
          .select({ sorumlu: mukellef.sorumluPersonelId })
          .from(mukellef)
          .where(eq(mukellef.id, log.mukellefId))
        return m ? { alici: m.sorumlu } : undefined
      },
    })
    this.personeller.silmeKontroluEkle(async (personelId) => {
      const [sonuc] = await this.txHost.tx
        .select({ n: count() })
        .from(mukellef)
        .where(eq(mukellef.sorumluPersonelId, personelId))
      const n = sonuc?.n ?? 0
      return n ? `${n} mükellefin sorumlusu` : null
    })
    this.seed.adimEkle(async (state, db) => {
      if (state.mukellef.length) await db.insert(mukellef).values(state.mukellef)
    })
  }

  async liste(s: MukellefListeSorgusu): Promise<MukellefListResponse> {
    const turler = [s.tur ?? []]
      .flat()
      .filter((t): t is MukellefTur => MUKELLEF_TURLERI.includes(t as MukellefTur))
    const durum = DURUMLAR.includes(s.durum as MukellefDurumFiltre)
      ? (s.durum as MukellefDurumFiltre)
      : "tumu"

    const kosullar: SQL[] = []
    if (turler.length) kosullar.push(inArray(mukellef.tur, turler))
    if (s.sorumlu) kosullar.push(eq(mukellef.sorumluPersonelId, s.sorumlu))
    if (durum !== "tumu") kosullar.push(eq(mukellef.aktif, durum === "aktif"))
    const satirlar = await this.txHost.tx
      .select()
      .from(mukellef)
      .where(and(...kosullar))

    // Arama ve unvan sıralaması Türkçe kurallarla (İ/ı) — mock ile aynı; kayıt sayısı küçük
    const q = s.q?.trim() ?? ""
    const yon = s.yon === "desc" ? -1 : 1
    const sirala = s.sirala === "olusturmaTarihi" ? "olusturmaTarihi" : "unvan"
    const liste = satirlar
      .map(satirdan)
      .filter(
        (m) =>
          !q ||
          kucuk(m.unvan).includes(kucuk(q)) ||
          Boolean(m.vkn?.includes(q)) ||
          Boolean(m.tckn?.includes(q))
      )
      .sort((a, b) =>
        sirala === "unvan"
          ? yon * a.unvan.localeCompare(b.unvan, "tr-TR")
          : yon * a.olusturmaTarihi.localeCompare(b.olusturmaTarihi)
      )
    return istegeBagliSayfala(liste, s)
  }

  async getir(id: string): Promise<Mukellef> {
    const [m] = await this.txHost.tx.select().from(mukellef).where(eq(mukellef.id, id))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    return satirdan(m)
  }

  @Transactional()
  async olustur(aktor: Personel, body: unknown): Promise<Mukellef> {
    const input = await this.dogrula(body)
    const yeni = await this.ekle(input)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "MUKELLEF_OLUSTURULDU",
      hedefTip: "MUKELLEF",
      hedefId: yeni.id,
      mukellefId: yeni.id,
      aciklama: yeni.unvan,
    })
    return yeni
  }

  /** Hızlı başlangıç: Excel'den mükellefler. Kayıtlı VKN/TCKN atlanır, geçersiz satır raporlanır. */
  @Transactional()
  async toplu(aktor: Personel, body: unknown): Promise<TopluAktarimSonucu> {
    const kayitlar = (body as { kayitlar?: unknown } | null)?.kayitlar
    if (!Array.isArray(kayitlar) || kayitlar.length === 0) {
      throw new BadRequestException({ message: "Aktarılacak kayıt yok" })
    }
    const sonuc: TopluAktarimSonucu = { olusturulan: 0, guncellenen: 0, atlanan: 0, hatalar: [] }
    for (const kayit of kayitlar as { satir?: unknown; mukellef?: unknown }[]) {
      const satir = Number(kayit?.satir) || 0
      let input: Girdi
      try {
        input = await this.dogrula(kayit?.mukellef)
      } catch (e) {
        if (!(e instanceof HttpException)) throw e
        if (e.getStatus() === 409) sonuc.atlanan++
        else sonuc.hatalar.push({ satir, mesaj: hataMesaji(e) })
        continue
      }
      const yeni = await this.ekle(input)
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: "MUKELLEF_OLUSTURULDU",
          hedefTip: "MUKELLEF",
          hedefId: yeni.id,
          mukellefId: yeni.id,
          aciklama: `${yeni.unvan} (içe aktarım)`,
        },
        false
      )
      sonuc.olusturulan++
    }
    return sonuc
  }

  @Transactional()
  async topluAtama(aktor: Personel, body: unknown): Promise<{ guncellenen: number }> {
    const { ids, sorumluPersonelId } = (body ?? {}) as { ids?: unknown; sorumluPersonelId?: unknown }
    const sorumlu =
      typeof sorumluPersonelId === "string" ? await this.personelBul(sorumluPersonelId) : null
    if (!sorumlu) throw new BadRequestException({ message: "Sorumlu personel bulunamadı" })
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException({ message: "En az bir mükellef seçiniz" })
    }

    const guncellenenler = await this.txHost.tx
      .update(mukellef)
      .set({ sorumluPersonelId: sorumlu.id })
      .where(inArray(mukellef.id, ids.filter((id): id is string => typeof id === "string")))
      .returning({ id: mukellef.id })
    for (const { id } of guncellenenler) {
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: "MUKELLEF_GUNCELLENDI",
          hedefTip: "MUKELLEF",
          hedefId: id,
          mukellefId: id,
          aciklama: `Sorumlu: ${sorumlu.ad} ${sorumlu.soyad}`,
        },
        SORUMLU_BILDIRIMI
      )
    }
    return { guncellenen: guncellenenler.length }
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, body: unknown): Promise<Mukellef> {
    const onceki = await this.getir(id)
    const input = await this.dogrula(body, id)
    // Ücret bu uçla değişmez (Faz 5: `PUT /mukellefler/:id/ucret`); yok sayılan alanlar null'lanır
    const [guncel] = await this.txHost.tx
      .update(mukellef)
      .set(nullDoldur(input))
      .where(eq(mukellef.id, id))
      .returning()
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "MUKELLEF_GUNCELLENDI",
        hedefTip: "MUKELLEF",
        hedefId: id,
        mukellefId: id,
      },
      onceki.sorumluPersonelId !== input.sorumluPersonelId ? SORUMLU_BILDIRIMI : {}
    )
    return satirdan(guncel!)
  }

  /** Yapı + kimlik doğrulaması, sorumlu personel (400) ve VKN/TCKN çakışması (409) */
  private async dogrula(body: unknown, mevcutId?: string): Promise<Girdi> {
    const input = mukellefNormalize(
      zodDogrula(mukellefGirdiSemasi, body ?? {}, 400, { yolOneki: false })
    )
    if (!(await this.personelBul(input.sorumluPersonelId))) {
      throw new BadRequestException({ message: "Sorumlu personel bulunamadı" })
    }
    const kimlikHatasi = mukellefKimlikHatasi(input)
    if (kimlikHatasi) throw new BadRequestException({ message: kimlikHatasi })

    const kimlik =
      input.tur === "SAHIS" ? eq(mukellef.tckn, input.tckn!) : eq(mukellef.vkn, input.vkn!)
    const [cakisan] = await this.txHost.tx
      .select({ unvan: mukellef.unvan })
      .from(mukellef)
      .where(mevcutId ? and(kimlik, ne(mukellef.id, mevcutId)) : kimlik)
    if (cakisan) {
      throw new ConflictException({ message: kimlikCakismaMesaji(input.tur, cakisan.unvan) })
    }
    return input
  }

  private async ekle(input: Girdi): Promise<Mukellef> {
    const [yeni] = await this.txHost.tx
      .insert(mukellef)
      .values({ ...input, id: newId("m"), olusturmaTarihi: this.saat.simdiIso() })
      .returning()
    return satirdan(yeni!)
  }

  private async personelBul(id: string) {
    const [p] = await this.txHost.tx.select().from(personel).where(eq(personel.id, id))
    return p
  }
}

/** `update().set()` undefined alanları atlar; formda boşaltılan isteğe bağlı alan null yazılmalı */
function nullDoldur(input: Girdi) {
  const { vkn, tckn, ticaretSicilNo, mersisNo, tercihKanal } = input
  return {
    ...input,
    vkn: vkn ?? null,
    tckn: tckn ?? null,
    ticaretSicilNo: ticaretSicilNo ?? null,
    mersisNo: mersisNo ?? null,
    tercihKanal: tercihKanal ?? null,
  }
}

function hataMesaji(e: HttpException): string {
  const yanit = e.getResponse()
  return typeof yanit === "object" && yanit && "message" in yanit
    ? String((yanit as { message: unknown }).message)
    : e.message
}
