import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { Injectable } from "@nestjs/common"
import { and, eq, ne } from "drizzle-orm"

import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { donemEtiketi } from "@prime/shared/takvim/motor"
import { BEYAN_DURUM_ETIKET } from "@prime/shared/takvim/sabitler"
import type { BeyanDurumu, YukumlulukTip } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { takvimDurum } from "../db/schema/index.js"

export interface TakvimAnahtari {
  mukellefId: string
  tip: YukumlulukTip
  donem: string
}

/** `${mukellefId}:${tip}:${donem}` → parçalar (biçim denetimi çağıranda) */
export function takvimIdCoz(id: string): TakvimAnahtari {
  const [mukellefId = "", tip = "", donem = ""] = id.split(":")
  return { mukellefId, tip: tip as YukumlulukTip, donem }
}

const anahtarKosulu = ({ mukellefId, tip, donem }: TakvimAnahtari) =>
  and(
    eq(takvimDurum.mukellefId, mukellefId),
    eq(takvimDurum.tip, tip),
    eq(takvimDurum.donem, donem)
  )

export interface BeyanDurumuYazSecenekleri {
  /** Aktivite açıklamasının sonuna eklenir (ör. " (görevden)") */
  aciklamaEki?: string
  /**
   * Yalnızca ileri yönde yaz (Bekliyor → Hazırlandı → Onaylandı): görev senkronu, tahakkuk,
   * e-Defter beratı. Mevcut durum aynı ya da ileride ise hiçbir şey yazılmaz.
   */
  yalnizIleri?: boolean
}

/**
 * Takvimdeki beyan durumunu yazan tek servis (mock `beyanDurumuYaz`). "Bekliyor" varsayılan
 * durumdur: kaydı siler. Her yazma `BEYAN_DURUMU_GUNCELLENDI` aktivitesi (+ bildirim) üretir.
 */
@Injectable()
export class BeyanDurumuService {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly saat: Saat
  ) {}

  /** Mevcut beyan durumu (kayıt yoksa "Bekliyor") */
  async oku(id: string): Promise<BeyanDurumu> {
    const [kayit] = await this.txHost.tx
      .select({ durum: takvimDurum.durum })
      .from(takvimDurum)
      .where(anahtarKosulu(takvimIdCoz(id)))
    return kayit?.durum ?? "BEKLIYOR"
  }

  /** Yazıldıysa `true`; `yalnizIleri` ile geri / aynı yöne yazma atlandıysa `false` */
  @Transactional()
  async yaz(
    id: string,
    durum: BeyanDurumu,
    aktorId: string,
    { aciklamaEki = "", yalnizIleri = false }: BeyanDurumuYazSecenekleri = {}
  ): Promise<boolean> {
    const anahtar = takvimIdCoz(id)
    const tx = this.txHost.tx

    if (durum === "BEKLIYOR") {
      if (yalnizIleri) return false
      await tx.delete(takvimDurum).where(anahtarKosulu(anahtar))
    } else {
      const kayit = {
        ...anahtar,
        durum,
        guncelleyenId: aktorId,
        guncellemeTarihi: this.saat.simdiIso(),
      }
      const ekle = tx.insert(takvimDurum).values(kayit)
      const target = [takvimDurum.mukellefId, takvimDurum.tip, takvimDurum.donem]
      if (!yalnizIleri) {
        await ekle.onConflictDoUpdate({ target, set: kayit })
      } else {
        // Tek ifadede, kilitsiz: yalnızca kayıt yoksa ya da mevcut durum geride ise yazılır
        const yazilan =
          durum === "HAZIRLANDI"
            ? await ekle.onConflictDoNothing().returning({ d: takvimDurum.durum })
            : await ekle
                .onConflictDoUpdate({
                  target,
                  set: kayit,
                  setWhere: ne(takvimDurum.durum, "ONAYLANDI"),
                })
                .returning({ d: takvimDurum.durum })
        if (!yazilan.length) return false
      }
    }

    await this.aktiviteler.log({
      aktorId,
      eylem: "BEYAN_DURUMU_GUNCELLENDI",
      hedefTip: "TAKVIM",
      hedefId: id,
      mukellefId: anahtar.mukellefId,
      aciklama: `${YUKUMLULUK_TANIMLARI[anahtar.tip].kisaAd} ${donemEtiketi(anahtar.donem)}: ${BEYAN_DURUM_ETIKET[durum]}${aciklamaEki}`,
    })
    return true
  }
}
