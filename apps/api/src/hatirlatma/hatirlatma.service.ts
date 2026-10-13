import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { addDays, getISOWeek, getISOWeekYear } from "date-fns"
import { and, eq, isNotNull, ne, lt } from "drizzle-orm"

import { gecerlilikDurumu, kalanGun } from "@prime/shared/arsiv/kurallar"
import { formatTRY } from "@prime/shared/lib/format"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"
import { cariDurum } from "@prime/shared/tahsilat/kurallar"
import { ARSIV_KATEGORI_ETIKET, type Bildirim, type CariHareket } from "@prime/shared/types/domain"

import { BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { arsivDosya, cariHareket, gorev, mukellef, personel } from "../db/schema/index.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"
import { cariSatirindan } from "../tahsilat/cari-yazici.js"
import { TakvimService } from "../takvim/takvim.service.js"

export const HATIRLATMA_ISI = "hatirlatma"
/** Belge geçerliliği için hatırlatma penceresi (gün): dolmadan önce ve dolduktan sonra */
const GECERLILIK_PENCERE_GUN = 7
/** Beyan son gününe kaç gün kala hatırlatılır */
const BEYAN_PENCERE_GUN = 3

/** Tekilleştirme anahtarıyla bildirim adayı; aynı anahtar ikinci kez yazılmaz */
export type Hatirlatma = Omit<Bildirim, "id" | "okuyanlar" | "zaman"> & { anahtar: string }

/** `bugun` yyyy-MM-dd; `simdi` saatli kurallar (e-Fatura yanıt süresi) için */
export type HatirlatmaUretici = (bugun: string, simdi: Date) => Promise<Hatirlatma[]>

/**
 * Zamana bağlı hatırlatmalar (mock `hatirlatmalariUret`). Saat başı ve açılışta çalışır;
 * `bildirim.anahtar` tekil olduğu için her durum bir kez bildirilir, eklenenler dış kanallara
 * kuyruğa alınır. Modüller kendi kurallarını `ureticiEkle` ile kaydeder (e-Belge, tebligat,
 * bordro …); görev, belge geçerliliği, beyan ve ödeme hatırlatmaları burada.
 */
@Injectable()
export class HatirlatmaService implements OnModuleInit {
  private readonly logger = new Logger(HatirlatmaService.name)
  private readonly ureticiler: { ad: string; uret: HatirlatmaUretici }[] = []

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly bildirimler: BildirimService,
    private readonly takvim: TakvimService,
    private readonly isler: IsKuyrugu,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.ureticiEkle("gorev", (b) => this.gecikenGorevler(b))
    this.ureticiEkle("belge-gecerlilik", (b) => this.belgeGecerlilikleri(b))
    this.ureticiEkle("beyan", (b) => this.yaklasanBeyanlar(b))
    this.ureticiEkle("odeme", (b) => this.gecikenOdemeler(b))
    this.isler.tanimla(
      HATIRLATMA_ISI,
      async () => {
        const n = await this.uret()
        if (n) this.logger.log(`${n} hatırlatma üretildi`)
      },
      { cron: "0 * * * *", acilista: true }
    )
  }

  ureticiEkle(ad: string, uret: HatirlatmaUretici) {
    this.ureticiler.push({ ad, uret })
  }

  /** Tüm kuralları çalıştırır; eklenen bildirim sayısı */
  @Transactional()
  async uret(): Promise<number> {
    const simdi = this.saat.simdi()
    const bugun = toYmd(simdi)
    const adaylar: Hatirlatma[] = []
    for (const u of this.ureticiler) adaylar.push(...(await u.uret(bugun, simdi)))
    // Aynı çalışmada aynı anahtar bir kez
    const tekil = [...new Map(adaylar.map((h) => [h.anahtar, h])).values()]
    const zaman = simdi.toISOString()
    const eklenen = await this.bildirimler.ekle(
      tekil.map((h) => ({ ...h, id: newId("i"), zaman, okuyanlar: [] }))
    )
    return eklenen.length
  }

  private async gecikenGorevler(bugun: string): Promise<Hatirlatma[]> {
    const satirlar = await this.txHost.tx
      .select()
      .from(gorev)
      .where(and(ne(gorev.durum, "TAMAM"), lt(gorev.sonTarih, bugun)))
    return satirlar.map((g) => ({
      tur: "GOREV_GECIKTI",
      anahtar: `GOREV_GECIKTI:${g.id}:${g.sonTarih}`,
      aliciId: g.atananId,
      baslik: "Görevin son tarihi geçti",
      aciklama: g.baslik,
      link: `/gorevler?gorev=${g.id}`,
      mukellefId: g.mukellefId,
      hedefTip: "GOREV",
      hedefId: g.id,
    }))
  }

  private async belgeGecerlilikleri(bugun: string): Promise<Hatirlatma[]> {
    const satirlar = await this.txHost.tx
      .select({ d: arsivDosya, m: mukellef })
      .from(arsivDosya)
      .innerJoin(mukellef, eq(mukellef.id, arsivDosya.mukellefId))
      .where(
        and(
          eq(arsivDosya.silindi, false),
          isNotNull(arsivDosya.gecerlilikTarihi),
          eq(mukellef.aktif, true)
        )
      )
    const sonuc: Hatirlatma[] = []
    for (const { d, m } of satirlar) {
      const kalan = kalanGun(d.gecerlilikTarihi!, bugun)
      if (Math.abs(kalan) > GECERLILIK_PENCERE_GUN) continue
      const durum = gecerlilikDurumu(d.gecerlilikTarihi!, bugun)
      sonuc.push({
        tur: "BELGE_GECERLILIK",
        anahtar: `BELGE_GECERLILIK:${d.id}:${d.gecerlilikTarihi}:${durum}`,
        aliciId: m.sorumluPersonelId,
        baslik:
          durum === "DOLDU"
            ? "Belgenin geçerlilik süresi doldu"
            : kalan === 0
              ? "Belgenin geçerliliği bugün doluyor"
              : `Belgenin geçerliliği ${kalan} gün içinde doluyor`,
        aciklama: `${m.unvan} · ${ARSIV_KATEGORI_ETIKET[d.kategori]}`,
        link: `/arsiv?mukellef=${m.id}&kategori=${d.kategori}`,
        mukellefId: m.id,
        hedefTip: "ARSIV",
        hedefId: d.id,
      })
    }
    return sonuc
  }

  /** Sorumlu + son gün bazında gruplanır (aynı güne düşen onlarca beyan tek bildirim) */
  private async yaklasanBeyanlar(bugun: string): Promise<Hatirlatma[]> {
    const beyanlar = (
      await this.takvim.olaylariHesapla(
        { baslangic: bugun, bitis: toYmd(addDays(fromYmd(bugun), BEYAN_PENCERE_GUN)) },
        bugun
      )
    ).filter((o) => o.durum !== "ONAYLANDI")
    const gruplar = new Map<string, typeof beyanlar>()
    for (const o of beyanlar) {
      const k = `${o.sorumluPersonelId}:${o.sonTarih}`
      gruplar.set(k, [...(gruplar.get(k) ?? []), o])
    }
    return [...gruplar].map(([k, liste]) => {
      const ilk = liste[0]!
      const kalan = kalanGun(ilk.sonTarih, bugun)
      return {
        tur: "BEYAN_YAKLASIYOR",
        anahtar: `BEYAN_YAKLASIYOR:${k}`,
        aliciId: ilk.sorumluPersonelId,
        baslik:
          kalan === 0
            ? `${liste.length} beyanın son günü bugün`
            : `${liste.length} beyanın son gününe ${kalan} gün kaldı`,
        aciklama:
          liste.length === 1
            ? ilk.mukellefUnvan
            : `${ilk.mukellefUnvan} ve ${liste.length - 1} mükellef daha`,
        link: "/takvim?durum=bekliyor",
        hedefTip: "TAKVIM",
      }
    })
  }

  /** Geciken ücret ödemeleri: yöneticilere haftada bir özet */
  private async gecikenOdemeler(bugun: string): Promise<Hatirlatma[]> {
    const tx = this.txHost.tx
    const gruplar = new Map<string, CariHareket[]>()
    for (const h of (await tx.select().from(cariHareket)).map(cariSatirindan))
      gruplar.set(h.mukellefId, [...(gruplar.get(h.mukellefId) ?? []), h])
    const gecikenler = [...gruplar.values()]
      .map((hs) => cariDurum(hs, bugun))
      .filter((d) => d.geciken)
    if (!gecikenler.length) return []
    const tarih = fromYmd(bugun)
    const hafta = `${getISOWeekYear(tarih)}-W${getISOWeek(tarih)}`
    const toplam = gecikenler.reduce((t, d) => t + d.acikBorc, 0)
    const yoneticiler = await tx
      .select({ id: personel.id })
      .from(personel)
      .where(and(eq(personel.aktif, true), eq(personel.rol, "YONETICI")))
    return yoneticiler.map((y) => ({
      tur: "ODEME_GECIKTI",
      anahtar: `ODEME_GECIKTI:${y.id}:${hafta}`,
      aliciId: y.id,
      baslik: `${gecikenler.length} mükellefin ücret ödemesi gecikti`,
      aciklama: `Vadesi geçmiş açık alacak ${formatTRY(toplam)}`,
      link: "/tahsilat/cari?geciken=true",
      hedefTip: "TAHSILAT",
    }))
  }
}
