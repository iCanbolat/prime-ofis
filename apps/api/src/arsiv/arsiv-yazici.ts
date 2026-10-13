import { TransactionHost } from "@nestjs-cls/transactional"
import { Injectable, Logger } from "@nestjs/common"

import { GECERLILIK_GEREKEN } from "@prime/shared/arsiv/kurallar"
import { DONEMLI_KATEGORILER } from "@prime/shared/bordro/kurallar"
import {
  ARSIV_KATEGORI_ETIKET,
  type ArsivDosya,
  type ArsivKategori,
  type BordroBelgeTur,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { arsivDosya } from "../db/schema/index.js"
import { arsivAnahtari, DosyaService } from "../dosya/dosya.service.js"

export interface ArsivYazGirdisi {
  mukellefId: string
  kategori: ArsivKategori
  ad: string
  mimeType: string
  boyut: number
  yukleyenId: string
  /** Yalnızca süreli kategorilerde saklanır */
  gecerlilikTarihi?: string
  /** Yalnızca dönemli kategorilerde saklanır; dönemsiz tür saklanmaz */
  donem?: string
  bordroBelge?: BordroBelgeTur
}

/** Yeni içerik ya da depodaki bir nesnenin kopyası (gelen evrak onayı) */
export type ArsivKaynagi =
  | { icerik: Buffer }
  | {
      kaynakAnahtar: string
      /**
       * Kaynak nesne yoksa hata yerine nesnesiz kayıt (seed verisi; içerik ucu production
       * dışında örnek içerik gösterir)
       */
      eksikseAtla?: boolean
    }

export interface ArsivYazSecenekleri<T> {
  /** `ARSIV_YUKLENDI` aktivitesi (varsayılan açık) */
  aktivite?: boolean
  /** Aynı transaction'da, kayıttan sonra çalışır (ör. gelen evrakı kilitleyip güncellemek) */
  sonra?: (dosya: ArsivDosya) => Promise<T>
}

export const arsivSatirindan = (d: typeof arsivDosya.$inferSelect): ArsivDosya => nullsuz(d)

/**
 * Arşive dosya yazan tek servis (mock `arsiveYaz`): arşiv yükleme, gelen evrak onayı, sonraki
 * fazlarda bordro ve e-Belge. Önce nesne yazılır, sonra satır transaction'da eklenir; transaction
 * hata verirse nesne silinir. Nesne işlemi transaction'a katılamadığı için **açık bir
 * transaction'ın içinden çağrılmamalı** (dış transaction geri alınırsa nesne öksüz kalır).
 */
@Injectable()
export class ArsivYazici {
  private readonly logger = new Logger(ArsivYazici.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly dosyalar: DosyaService,
    private readonly aktiviteler: AktiviteService,
    private readonly saat: Saat
  ) {}

  async yaz<T = undefined>(
    girdi: ArsivYazGirdisi,
    kaynak: ArsivKaynagi,
    { aktivite = true, sonra }: ArsivYazSecenekleri<T> = {}
  ): Promise<{ dosya: ArsivDosya; sonuc: T | undefined }> {
    const id = newId("d")
    const anahtar = arsivAnahtari(girdi.mukellefId, id)
    await this.nesneYaz(anahtar, girdi.mimeType, kaynak)

    try {
      return await this.txHost.withTransaction(async () => {
        const donemli = DONEMLI_KATEGORILER.includes(girdi.kategori) && girdi.donem
        const [satir] = await this.txHost.tx
          .insert(arsivDosya)
          .values({
            id,
            mukellefId: girdi.mukellefId,
            kategori: girdi.kategori,
            ad: girdi.ad,
            mimeType: girdi.mimeType,
            boyut: girdi.boyut,
            yukleyenId: girdi.yukleyenId,
            yuklemeTarihi: this.saat.simdiIso(),
            gecerlilikTarihi: GECERLILIK_GEREKEN.includes(girdi.kategori)
              ? girdi.gecerlilikTarihi || null
              : null,
            donem: donemli ? girdi.donem : null,
            bordroBelge: donemli ? (girdi.bordroBelge ?? null) : null,
            silindi: false,
          })
          .returning()
        const dosya = arsivSatirindan(satir!)
        if (aktivite) {
          await this.aktiviteler.log({
            aktorId: girdi.yukleyenId,
            eylem: "ARSIV_YUKLENDI",
            hedefTip: "ARSIV",
            hedefId: dosya.id,
            mukellefId: dosya.mukellefId,
            aciklama: `${dosya.ad} (${ARSIV_KATEGORI_ETIKET[dosya.kategori]})`,
          })
        }
        return { dosya, sonuc: sonra ? await sonra(dosya) : undefined }
      })
    } catch (hata) {
      await this.dosyalar.sil(anahtar).catch((e: unknown) => {
        this.logger.warn({ err: e, anahtar }, "Öksüz arşiv nesnesi silinemedi")
      })
      throw hata
    }
  }

  private async nesneYaz(anahtar: string, mimeType: string, kaynak: ArsivKaynagi) {
    if ("icerik" in kaynak) {
      await this.dosyalar.koy(anahtar, { icerik: kaynak.icerik, mimeType })
      return
    }
    try {
      await this.dosyalar.kopyala(kaynak.kaynakAnahtar, anahtar)
    } catch (hata) {
      if (!kaynak.eksikseAtla) throw hata
      this.logger.warn({ anahtar: kaynak.kaynakAnahtar }, "Kaynak nesne yok, kopyalanmadı")
    }
  }
}
