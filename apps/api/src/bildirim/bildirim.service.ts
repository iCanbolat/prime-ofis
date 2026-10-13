import { TransactionHost } from "@nestjs-cls/transactional"
import { Injectable, NotFoundException } from "@nestjs/common"
import { and, count, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm"

import {
  BILDIRIM_BASLIKLARI,
  bildirimLinki,
  type BildirimSecenekleri,
  type LinkBaglami,
} from "@prime/shared/bildirim/kurallar"
import type { BildirimListResponse, BildirimView } from "@prime/shared/types/api"
import type { AktiviteLog, Bildirim } from "@prime/shared/types/domain"

import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import type { DrizzleTx } from "../db/db.module.js"
import { bildirim, personel } from "../db/schema/index.js"

/**
 * Bir aktivitenin alıcısını ve bağlantı bağlamını veriden çözer. Modüller kendi hedef tipleri
 * için kaydeder (görev → atanan, talep → oluşturan, mükellef → sorumlu …). `alici: undefined`
 * → bu çözücü karar vermedi, sıradakine geçilir.
 */
export interface BildirimCozucu {
  /** Küçük önce çalışır; mükellef sorumlusu gibi genel kurallar sona (100) */
  oncelik: number
  cozumle(
    log: AktiviteLog
  ): Promise<{ alici?: string | null; baglam?: LinkBaglami } | undefined>
}

/** Bildirim eklendikten sonra dış kanallara (e-posta, Telegram, WhatsApp) gönderim — Faz 6 */
export abstract class BildirimGonderimKancasi {
  abstract eklendi(bildirimler: Bildirim[]): Promise<void>
}

export class BosGonderimKancasi extends BildirimGonderimKancasi {
  async eklendi() {}
}

const LISTE_VARSAYILAN = 30
const LISTE_EN_FAZLA = 100

@Injectable()
export class BildirimService {
  private readonly cozuculer: BildirimCozucu[] = []

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly kanca: BildirimGonderimKancasi
  ) {}

  cozucuEkle(cozucu: BildirimCozucu) {
    this.cozuculer.push(cozucu)
    this.cozuculer.sort((a, b) => a.oncelik - b.oncelik)
  }

  /**
   * Aktivite kaydından bildirim(ler) üretir. Alıcı: olayın atananı; yoksa yayın (`null`).
   * Aktör kendi eylemi için kişisel bildirim almaz; yayında baştan "okumuş" sayılır.
   */
  async uret(log: AktiviteLog, secenek: BildirimSecenekleri = {}): Promise<Bildirim[]> {
    const baslik = secenek.baslik ?? BILDIRIM_BASLIKLARI[log.eylem]
    if (!baslik) return []

    let alici: string | null = null
    let baglam: LinkBaglami = {}
    for (const c of this.cozuculer) {
      const sonuc = await c.cozumle(log)
      if (sonuc?.baglam) baglam = { ...baglam, ...sonuc.baglam }
      if (sonuc?.alici !== undefined) {
        alici = sonuc.alici
        break
      }
    }

    const alicilar = secenek.alicilar ?? [alici]
    const satirlar: Bildirim[] = alicilar
      .filter((aliciId) => aliciId === null || aliciId !== log.aktorId)
      .map((aliciId) => ({
        id: newId("i"),
        tur: secenek.tur ?? log.eylem,
        aliciId,
        aktorId: log.aktorId,
        baslik,
        aciklama: log.aciklama,
        link: bildirimLinki(log, baglam),
        mukellefId: log.mukellefId,
        hedefTip: log.hedefTip,
        hedefId: log.hedefId,
        zaman: log.zaman,
        okuyanlar: aliciId === null ? [log.aktorId] : [],
      }))
    if (!satirlar.length) return []
    await this.txHost.tx.insert(bildirim).values(satirlar)
    await this.kanca.eklendi(satirlar)
    return satirlar
  }

  async liste(
    kullaniciId: string,
    { sadeceOkunmamis, limit }: { sadeceOkunmamis: boolean; limit?: number }
  ): Promise<BildirimListResponse> {
    const tx = this.txHost.tx
    const gorunur = this.gorunur(kullaniciId)
    const okunmamis = and(gorunur, this.okunmamis(kullaniciId))
    const adet = Math.min(limit || LISTE_VARSAYILAN, LISTE_EN_FAZLA)

    const [satirlar, [toplam]] = await Promise.all([
      tx
        .select({ bildirim, aktor: aktorOzeti })
        .from(bildirim)
        .leftJoin(personel, eq(personel.id, bildirim.aktorId))
        .where(sadeceOkunmamis ? okunmamis : gorunur)
        .orderBy(desc(bildirim.zaman), desc(bildirim.id))
        .limit(adet),
      tx.select({ n: count() }).from(bildirim).where(okunmamis),
    ])

    return {
      items: satirlar.map(({ bildirim: b, aktor }): BildirimView => {
        const { okuyanlar, anahtar, ...rest } = b
        return {
          ...nullsuz(rest, ["aliciId"]),
          ...(anahtar ? { anahtar } : {}),
          okundu: okuyanlar.includes(kullaniciId),
          aktor: aktor?.id ? aktor : null,
        } as BildirimView
      }),
      okunmamis: toplam?.n ?? 0,
    }
  }

  async tumunuOkundu(kullaniciId: string) {
    await this.txHost.tx
      .update(bildirim)
      .set({ okuyanlar: this.okuyanaEkle(kullaniciId) })
      .where(and(this.gorunur(kullaniciId), this.okunmamis(kullaniciId)))
  }

  async okundu(kullaniciId: string, id: string) {
    const [b] = await this.txHost.tx
      .select({ id: bildirim.id })
      .from(bildirim)
      .where(and(eq(bildirim.id, id), this.gorunur(kullaniciId)))
    if (!b) throw new NotFoundException({ message: "Bildirim bulunamadı" })
    await this.txHost.tx
      .update(bildirim)
      .set({ okuyanlar: this.okuyanaEkle(kullaniciId) })
      .where(and(eq(bildirim.id, id), this.okunmamis(kullaniciId)))
  }

  /** `bildirimGorunurMu` (shared) ile aynı kural, SQL olarak */
  private gorunur(kullaniciId: string): SQL {
    return or(
      eq(bildirim.aliciId, kullaniciId),
      and(
        isNull(bildirim.aliciId),
        or(isNull(bildirim.aktorId), ne(bildirim.aktorId, kullaniciId))
      )
    )!
  }

  private okunmamis(kullaniciId: string): SQL {
    return sql`not (${kullaniciId} = any(${bildirim.okuyanlar}))`
  }

  private okuyanaEkle(kullaniciId: string): SQL {
    return sql`array_append(${bildirim.okuyanlar}, ${kullaniciId}::text)`
  }
}

/** Aktivite / bildirim yanıtlarındaki aktör özeti */
export const aktorOzeti = {
  id: personel.id,
  ad: personel.ad,
  soyad: personel.soyad,
  renk: personel.renk,
}
