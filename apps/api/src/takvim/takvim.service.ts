import { TransactionHost } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { addDays, differenceInCalendarDays, subMonths } from "date-fns"
import { and, eq, inArray, isNotNull, type SQL } from "drizzle-orm"

import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { takvimOlayId, uygulananTipler, yukumlulukleriHesapla } from "@prime/shared/takvim/motor"
import { BEYAN_DURUM_SIRASI } from "@prime/shared/takvim/sabitler"
import type { TakvimDurumFiltre, TakvimOlayi, TakvimOzetResponse } from "@prime/shared/types/api"
import type {
  BeyanDurumu,
  Mukellef,
  MukellefTur,
  Personel,
  YukumlulukTip,
} from "@prime/shared/types/domain"

import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { gorev, mukellef, takvimDurum } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { BeyanDurumuService, takvimIdCoz } from "./beyan-durumu.service.js"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const DONEM_RE = /^\d{4}(-\d{2}|-Q[1-4])?$/
const MAKS_ARALIK_GUN = 400

export interface TakvimSorgusu {
  baslangic?: string
  bitis?: string
  mukellefId?: string
  tip?: string | string[]
  tur?: string | string[]
  sorumlu?: string
  durum?: string
}

interface Filtre {
  baslangic: string
  bitis: string
  mukellefId?: string
  tipler?: YukumlulukTip[]
  turler?: MukellefTur[]
  sorumlu?: string
  durum?: TakvimDurumFiltre
}

const dizi = (v: string | string[] | undefined) => [v ?? []].flat()

@Injectable()
export class TakvimService implements OnModuleInit {
  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly beyanDurumu: BeyanDurumuService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      const kayitlar = state.takvim.flatMap(({ id: _id, durum, ...k }) =>
        durum === "BEKLIYOR" ? [] : [{ ...k, durum }]
      )
      if (kayitlar.length) await db.insert(takvimDurum).values(kayitlar)
    })
  }

  bugun(): string {
    return toYmd(this.saat.simdi())
  }

  async liste(s: TakvimSorgusu): Promise<TakvimOlayi[]> {
    const baslangic = s.baslangic ?? ""
    const bitis = s.bitis ?? ""
    if (!YMD_RE.test(baslangic) || !YMD_RE.test(bitis) || baslangic > bitis) {
      throw new BadRequestException({
        message: "Geçerli bir tarih aralığı giriniz (baslangic, bitis)",
      })
    }
    if (differenceInCalendarDays(fromYmd(bitis), fromYmd(baslangic)) > MAKS_ARALIK_GUN) {
      throw new BadRequestException({
        message: `Tarih aralığı en fazla ${MAKS_ARALIK_GUN} gün olabilir`,
      })
    }
    return this.olaylariHesapla({
      baslangic,
      bitis,
      mukellefId: s.mukellefId,
      tipler: dizi(s.tip) as YukumlulukTip[],
      turler: dizi(s.tur) as MukellefTur[],
      sorumlu: s.sorumlu,
      durum: s.durum as TakvimDurumFiltre | undefined,
    })
  }

  async ozet(sorumlu?: string): Promise<TakvimOzetResponse> {
    const bugunYmd = this.bugun()
    const bugunTarih = fromYmd(bugunYmd)
    const haftaSonu = toYmd(addDays(bugunTarih, 7))

    // Son 6 ay + gelecek 2 ay tek hesaplamada
    const tumu = await this.olaylariHesapla(
      {
        baslangic: toYmd(subMonths(bugunTarih, 6)),
        bitis: toYmd(addDays(bugunTarih, 62)),
        sorumlu,
      },
      bugunYmd
    )
    const acik = tumu.filter((o) => o.durum !== "ONAYLANDI")
    const ayBaslangic = `${bugunYmd.slice(0, 7)}-01`

    const personelMap = new Map<string, { acik: number; geciken: number }>()
    for (const o of acik) {
      if (o.sonTarih > haftaSonu && !o.gecikti) continue
      const p = personelMap.get(o.sorumluPersonelId) ?? { acik: 0, geciken: 0 }
      p.acik++
      if (o.gecikti) p.geciken++
      personelMap.set(o.sorumluPersonelId, p)
    }

    const onayBekleyenListe = tumu.filter(
      (o) => o.durum === "HAZIRLANDI" && o.sonTarih >= ayBaslangic
    )
    const gunlukAdet = new Map<string, number>()
    for (const o of acik) gunlukAdet.set(o.sonTarih, (gunlukAdet.get(o.sonTarih) ?? 0) + 1)
    const yogunluk = Array.from({ length: 14 }, (_, i) => {
      const tarih = toYmd(addDays(bugunTarih, i))
      return { tarih, adet: gunlukAdet.get(tarih) ?? 0 }
    })

    return {
      bugun: bugunYmd,
      buHafta: acik.filter((o) => o.sonTarih >= bugunYmd && o.sonTarih <= haftaSonu),
      geciken: acik.filter((o) => o.gecikti),
      onayBekleyen: onayBekleyenListe.length,
      onayBekleyenListe,
      yogunluk,
      personel: [...personelMap.entries()].map(([personelId, v]) => ({
        personelId,
        ...v,
      })),
    }
  }

  async durumGuncelle(aktor: Personel, id: string, body: unknown) {
    const { mukellefId, tip, donem } = takvimIdCoz(id)
    const [m] = await this.txHost.tx.select().from(mukellef).where(eq(mukellef.id, mukellefId))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    if (!uygulananTipler(nullsuz(m)).includes(tip) || !DONEM_RE.test(donem)) {
      throw new NotFoundException({
        message: "Bu mükellef için böyle bir yükümlülük yok",
      })
    }
    const durum = (body as { durum?: unknown } | null)?.durum as BeyanDurumu
    if (!BEYAN_DURUM_SIRASI.includes(durum)) {
      throw new BadRequestException({ message: "Geçersiz durum" })
    }
    await this.beyanDurumu.yaz(id, durum, aktor.id)
    return { id, durum }
  }

  /** Aktif mükellefler için kural motorunu çalıştırır, saklanan durum ve görevlerle birleştirir */
  async olaylariHesapla(f: Filtre, bugunYmd = this.bugun()): Promise<TakvimOlayi[]> {
    const tx = this.txHost.tx
    const kosullar: SQL[] = [eq(mukellef.aktif, true)]
    if (f.mukellefId) kosullar.push(eq(mukellef.id, f.mukellefId))
    if (f.turler?.length) kosullar.push(inArray(mukellef.tur, f.turler))
    if (f.sorumlu) kosullar.push(eq(mukellef.sorumluPersonelId, f.sorumlu))
    const mukellefler: Mukellef[] = (
      await tx
        .select()
        .from(mukellef)
        .where(and(...kosullar))
    ).map((m) => nullsuz(m))
    if (!mukellefler.length) return []

    const idler = mukellefler.map((m) => m.id)
    const [durumSatirlari, gorevSatirlari] = await Promise.all([
      tx.select().from(takvimDurum).where(inArray(takvimDurum.mukellefId, idler)),
      tx
        .select({
          id: gorev.id,
          durum: gorev.durum,
          anahtar: gorev.otomatikAnahtar,
        })
        .from(gorev)
        .where(and(inArray(gorev.mukellefId, idler), isNotNull(gorev.otomatikAnahtar))),
    ])
    const durumlar = new Map(
      durumSatirlari.map((d) => [takvimOlayId(d.mukellefId, d.tip, d.donem), d])
    )
    const gorevler = new Map(gorevSatirlari.map((g) => [g.anahtar!, g]))

    const olaylar: TakvimOlayi[] = []
    for (const m of mukellefler) {
      for (const y of yukumlulukleriHesapla(m, f)) {
        if (f.tipler?.length && !f.tipler.includes(y.tip)) continue
        const id = takvimOlayId(m.id, y.tip, y.donem)
        const kayit = durumlar.get(id)
        const durum: BeyanDurumu = kayit?.durum ?? "BEKLIYOR"
        const gecikti = y.sonTarih < bugunYmd && durum !== "ONAYLANDI"
        if (f.durum) {
          if (f.durum === "gecikti" ? !gecikti : durum !== f.durum.toUpperCase()) continue
        }
        const g = gorevler.get(id)
        olaylar.push({
          id,
          mukellefId: m.id,
          mukellefUnvan: m.unvan,
          mukellefTur: m.tur,
          sorumluPersonelId: m.sorumluPersonelId,
          ...y,
          durum,
          gecikti,
          ...(kayit
            ? {
                guncelleyenId: kayit.guncelleyenId,
                guncellemeTarihi: kayit.guncellemeTarihi,
              }
            : {}),
          ...(g ? { gorevId: g.id, gorevDurum: g.durum } : {}),
        })
      }
    }

    return olaylar.sort(
      (a, b) =>
        a.sonTarih.localeCompare(b.sonTarih) ||
        a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR")
    )
  }
}
