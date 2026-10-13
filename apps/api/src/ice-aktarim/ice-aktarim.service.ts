import { TransactionHost } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm"

import { mizanKontrolleri, mizanOzeti } from "@prime/shared/ice-aktarim/mizan"
import { donemBaslangici, donemGecerliMi } from "@prime/shared/ice-aktarim/tahakkuk"
import { formatDonem, formatTRY } from "@prime/shared/lib/format"
import { toYmd } from "@prime/shared/lib/tarih"
import { YUKUMLULUK_TANIMLARI } from "@prime/shared/takvim/kurallar"
import { donemEtiketi, takvimOlayId, uygulananTipler } from "@prime/shared/takvim/motor"
import type {
  IceAktarSonucu,
  MizanDetay,
  MizanView,
  TahakkukIceAktarResponse,
  TahakkukView,
} from "@prime/shared/types/api"
import type {
  Mizan,
  MizanHesap,
  Mukellef,
  Personel,
  YukumlulukTip,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { ArsivYazici } from "../arsiv/arsiv-yazici.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { mizan, mukellef, tahakkuk } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { DosyaService } from "../dosya/dosya.service.js"
import { GorevMaddesiService } from "../gorev/gorev-maddesi.service.js"
import { BeyanDurumuService } from "../takvim/beyan-durumu.service.js"

type Govde = Record<string, unknown>

const MAKS_KALEM = 50
const MAKS_HESAP = 1000
const MIZAN_KONTROL_MADDESI = "Mizan kontrol edildi"
const HESAP_KOD_RE = /^[1-9]\d{2}$/
const AY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const hata = (message: string) => new BadRequestException({ message })
const metin = (v: unknown) => (typeof v === "string" ? v.trim() : "")
/** Mock `DATA_URL_RE` ön denetimi: içerik hiç yoksa "eksik"; biçim / tür hatası `DosyaService`'ten */
const dataUrlVar = (d: unknown) => {
  const url = govde(d).dataUrl
  return typeof url === "string" && url.startsWith("data:") && url.includes(",")
}
/** `INSERT … ON CONFLICT DO UPDATE` sonrası satır yeni mi (güncellenen satırda `xmax` dolu) */
const yeniSatir = sql<boolean>`(xmax = 0)`

interface GecerliKalem {
  m: Mukellef
  tip: YukumlulukTip
  donem: string
  beyannameKodu?: string
  tahakkukNo?: string
  odenecek?: number
  vade?: string
  dosyaAdi: string
  dataUrl: unknown
}

/**
 * Tahakkuk fişi ve mizan içe aktarımı (mock `ice-aktarim.ts`). Ayrıştırma istemcide yapılır;
 * burada onaylanan kalemler doğrulanır, dosya arşive yazılır, takvim ve görev güncellenir.
 */
@Injectable()
export class IceAktarimService implements OnModuleInit {
  private readonly logger = new Logger(IceAktarimService.name)

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly yazici: ArsivYazici,
    private readonly dosyalar: DosyaService,
    private readonly beyanlar: BeyanDurumuService,
    private readonly maddeler: GorevMaddesiService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    this.seed.adimEkle(async (state, db) => {
      if (state.tahakkuk.length) await db.insert(tahakkuk).values(state.tahakkuk)
      if (state.mizan.length) await db.insert(mizan).values(state.mizan)
    })
  }

  private bugun() {
    return toYmd(this.saat.simdi())
  }

  // --- Tahakkuk ------------------------------------------------------------

  async tahakkuklar(mukellefId?: string): Promise<TahakkukView[]> {
    const satirlar = await this.txHost.tx
      .select({ ...getTableColumns(tahakkuk), mukellefUnvan: mukellef.unvan })
      .from(tahakkuk)
      .innerJoin(mukellef, eq(mukellef.id, tahakkuk.mukellefId))
      .where(mukellefId ? eq(tahakkuk.mukellefId, mukellefId) : undefined)
      .orderBy(desc(tahakkuk.yuklemeTarihi))
    return satirlar.map((s) => nullsuz(s))
  }

  /**
   * Kalem bazında kısmi başarı: hatalı kalem `HATA` sonucu alır, diğerleri işlenir. Her kalem
   * kendi transaction'ında (arşiv nesnesi + satır + takvim + aktivite) yazılır.
   */
  async tahakkukAktar(aktor: Personel, body: unknown): Promise<TahakkukIceAktarResponse> {
    const { kalemler } = govde(body)
    if (!Array.isArray(kalemler) || kalemler.length === 0)
      throw hata("İçe aktarılacak tahakkuk yok")
    if (kalemler.length > MAKS_KALEM) throw hata(`Tek seferde en fazla ${MAKS_KALEM} tahakkuk`)

    const idler = [...new Set(kalemler.map((k) => govde(k).mukellefId).filter(Boolean))]
    const mukellefler = new Map(
      (
        await this.txHost.tx
          .select()
          .from(mukellef)
          .where(inArray(mukellef.id, idler.filter((id): id is string => typeof id === "string")))
      ).map((m) => [m.id, nullsuz(m) as Mukellef])
    )

    const sonuclar: IceAktarSonucu[] = []
    for (const [sira, ham] of kalemler.entries()) {
      const k = this.tahakkukDogrula(govde(ham), mukellefler)
      if (typeof k === "string") {
        sonuclar.push({ sira, durum: "HATA", mesaj: k })
        continue
      }
      try {
        const yeni = await this.tahakkukYaz(aktor, k)
        sonuclar.push({ sira, durum: yeni ? "EKLENDI" : "GUNCELLENDI" })
      } catch (e) {
        if (!(e instanceof HttpException)) {
          this.logger.error({ err: e, sira }, "Tahakkuk kalemi yazılamadı")
        }
        sonuclar.push({ sira, durum: "HATA", mesaj: hataMesaji(e, "Tahakkuk kaydedilemedi") })
      }
    }
    return { sonuclar }
  }

  /** Mock `tahakkukDogrula` sırası; hata mesajı ya da geçerli kalem */
  private tahakkukDogrula(k: Govde, mukellefler: Map<string, Mukellef>): GecerliKalem | string {
    const m = typeof k.mukellefId === "string" ? mukellefler.get(k.mukellefId) : undefined
    if (!m) return "Mükellef bulunamadı"
    const tip = k.tip as YukumlulukTip
    if (!(typeof tip === "string" && tip in YUKUMLULUK_TANIMLARI))
      return "Geçersiz yükümlülük"
    if (!uygulananTipler(m).includes(tip))
      return `${m.unvan} ${YUKUMLULUK_TANIMLARI[tip].ad} yükümlüsü değil`
    const donem = typeof k.donem === "string" ? k.donem : ""
    if (!donemGecerliMi(tip, donem)) return "Dönem geçersiz"
    if (tip === "KDV") {
      const ucAylik = /Q\d$/.test(donem)
      if (ucAylik !== (m.kdvPeriyodu === "UC_AYLIK"))
        return `Mükellef ${m.kdvPeriyodu === "UC_AYLIK" ? "üç aylık" : "aylık"} KDV veriyor; dönem uyuşmuyor`
    }
    if (donemBaslangici(donem) > this.bugun()) return "Gelecek dönemin tahakkuku olamaz"
    if (!dataUrlVar(k.dosya)) return "Dosya içeriği eksik"
    if (k.odenecek !== undefined && k.odenecek !== null) {
      if (!(typeof k.odenecek === "number" && Number.isFinite(k.odenecek) && k.odenecek >= 0))
        return "Ödenecek tutar geçersiz"
    }
    const vade = metin(k.vade)
    if (vade && !YMD_RE.test(vade)) return "Vade tarihi geçersiz"
    return {
      m,
      tip,
      donem,
      beyannameKodu: metin(k.beyannameKodu) || undefined,
      tahakkukNo: metin(k.tahakkukNo) || undefined,
      odenecek: typeof k.odenecek === "number" ? k.odenecek : undefined,
      vade: vade || undefined,
      dosyaAdi: metin(govde(k.dosya).ad) || "tahakkuk.pdf",
      dataUrl: govde(k.dosya).dataUrl,
    }
  }

  /** Yeni kayıtsa `true` */
  private async tahakkukYaz(aktor: Personel, k: GecerliKalem): Promise<boolean> {
    const dosya = await this.dosyalar.dataUrlCoz(k.dataUrl)
    const { sonuc } = await this.yazici.yaz(
      {
        mukellefId: k.m.id,
        kategori: "TAHAKKUK",
        ad: k.dosyaAdi,
        mimeType: dosya.mimeType,
        boyut: dosya.boyut,
        yukleyenId: aktor.id,
      },
      { icerik: dosya.icerik },
      {
        // Mock'ta da arşiv aktivitesi yok; içe aktarım aktivitesi yeterli
        aktivite: false,
        sonra: async (arsiv) => {
          const kayit = {
            beyannameKodu: k.beyannameKodu ?? null,
            tahakkukNo: k.tahakkukNo ?? null,
            odenecek: k.odenecek ?? null,
            vade: k.vade ?? null,
            arsivDosyaId: arsiv.id,
            yukleyenId: aktor.id,
            yuklemeTarihi: this.saat.simdiIso(),
          }
          const [satir] = await this.txHost.tx
            .insert(tahakkuk)
            .values({ id: newId("h"), mukellefId: k.m.id, tip: k.tip, donem: k.donem, ...kayit })
            .onConflictDoUpdate({
              target: [tahakkuk.mukellefId, tahakkuk.tip, tahakkuk.donem],
              set: kayit,
            })
            .returning({ yeni: yeniSatir })

          const takvimId = takvimOlayId(k.m.id, k.tip, k.donem)
          await this.beyanlar.yaz(takvimId, "ONAYLANDI", aktor.id, {
            aciklamaEki: " (tahakkuk)",
            yalnizIleri: true,
          })
          await this.aktiviteler.log({
            aktorId: aktor.id,
            eylem: "TAHAKKUK_ICE_AKTARILDI",
            hedefTip: "TAKVIM",
            hedefId: takvimId,
            mukellefId: k.m.id,
            aciklama: `${YUKUMLULUK_TANIMLARI[k.tip].kisaAd} ${donemEtiketi(k.donem)}${
              k.odenecek !== undefined ? ` · ${formatTRY(k.odenecek)}` : ""
            }`,
          })
          return satir!.yeni
        },
      }
    )
    return sonuc!
  }

  // --- Mizan ---------------------------------------------------------------

  async mizanlar(mukellefId?: string): Promise<MizanView[]> {
    const satirlar = await this.mizanSatirlari(
      mukellefId ? eq(mizan.mukellefId, mukellefId) : undefined
    )
    return satirlar.map(({ z, unvan }) => mizanView(z, unvan))
  }

  async mizanDetay(id: string): Promise<MizanDetay> {
    const [s] = await this.mizanSatirlari(eq(mizan.id, id))
    if (!s) throw new NotFoundException({ message: "Mizan bulunamadı" })
    return { ...mizanView(s.z, s.unvan), hesaplar: s.z.hesaplar }
  }

  private async mizanSatirlari(kosul: ReturnType<typeof eq> | undefined) {
    const satirlar = await this.txHost.tx
      .select({ z: mizan, unvan: mukellef.unvan })
      .from(mizan)
      .innerJoin(mukellef, eq(mukellef.id, mizan.mukellefId))
      .where(kosul)
      .orderBy(desc(mizan.donem), desc(mizan.yuklemeTarihi))
    return satirlar.map(({ z, unvan }) => ({ z: nullsuz(z) as Mizan, unvan }))
  }

  async mizanAktar(
    aktor: Personel,
    body: unknown
  ): Promise<{ yanit: MizanView; yeni: boolean }> {
    const b = govde(body)
    const [mRow] = await this.txHost.tx
      .select({ id: mukellef.id })
      .from(mukellef)
      .where(eq(mukellef.id, typeof b.mukellefId === "string" ? b.mukellefId : ""))
    if (!mRow) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    const donem = typeof b.donem === "string" ? b.donem : ""
    if (!AY_RE.test(donem)) throw hata("Dönem geçersiz")
    if (`${donem}-01` > this.bugun()) throw hata("Gelecek dönemin mizanı olamaz")
    if (!dataUrlVar(b.dosya)) throw hata("Dosya içeriği eksik")
    const hesaplar = hesaplariOku(b.hesaplar)
    if (!hesaplar) throw hata("Mizan satırları geçersiz")
    const dosyaAdi = metin(govde(b.dosya).ad) || "mizan"
    const dosya = await this.dosyalar.dataUrlCoz(govde(b.dosya).dataUrl, { tablo: true })

    const kontroller = mizanKontrolleri(hesaplar, {
      tahakkukToplami: await this.donemTahakkukToplami(mRow.id, donem),
    })
    const { sonuc } = await this.yazici.yaz(
      {
        mukellefId: mRow.id,
        kategori: "MIZAN",
        ad: dosyaAdi,
        mimeType: dosya.mimeType,
        boyut: dosya.boyut,
        yukleyenId: aktor.id,
      },
      { icerik: dosya.icerik },
      {
        aktivite: false,
        sonra: async (arsiv) => {
          const kayit = {
            dosyaAdi,
            hesaplar,
            kontroller,
            arsivDosyaId: arsiv.id,
            yukleyenId: aktor.id,
            yuklemeTarihi: this.saat.simdiIso(),
          }
          const [satir] = await this.txHost.tx
            .insert(mizan)
            .values({ id: newId("z"), mukellefId: mRow.id, donem, ...kayit })
            .onConflictDoUpdate({ target: [mizan.mukellefId, mizan.donem], set: kayit })
            .returning({ id: mizan.id, yeni: yeniSatir })

          const isaretlenenGorevId = await this.gorevMaddesiniIsaretle(
            mRow.id,
            donem,
            kontroller,
            aktor
          )
          const hataSayisi = kontroller.filter((k) => k.durum === "HATA").length
          const uyari = kontroller.filter((k) => k.durum === "UYARI").length
          await this.aktiviteler.log({
            aktorId: aktor.id,
            eylem: "MIZAN_ICE_AKTARILDI",
            hedefTip: "MUKELLEF",
            hedefId: mRow.id,
            mukellefId: mRow.id,
            aciklama: `${formatDonem(donem)} · ${
              hataSayisi || uyari ? `${hataSayisi} hata, ${uyari} uyarı` : "sorun yok"
            }`,
          })
          return { id: satir!.id, yeni: satir!.yeni, isaretlenenGorevId }
        },
      }
    )
    const { id, yeni, isaretlenenGorevId } = sonuc!
    const [s] = await this.mizanSatirlari(eq(mizan.id, id))
    return { yanit: { ...mizanView(s!.z, s!.unvan), isaretlenenGorevId }, yeni }
  }

  /**
   * 360 karşılaştırması için dönemin KDV + MUHSGK tahakkukları. Üç aylık KDV, çeyreğin son ayının
   * mizanına sayılır. Hiç tahakkuk yoksa karşılaştırma yapılmaz.
   */
  private async donemTahakkukToplami(mukellefId: string, donem: string) {
    const ay = Number(donem.slice(5, 7))
    const kdvDonemleri = ay % 3 === 0 ? [donem, `${donem.slice(0, 4)}-Q${ay / 3}`] : [donem]
    const [s] = await this.txHost.tx
      .select({
        adet: sql<number>`count(*)::int`,
        toplam: sql<string>`coalesce(sum(${tahakkuk.odenecek}), 0)`,
      })
      .from(tahakkuk)
      .where(
        and(
          eq(tahakkuk.mukellefId, mukellefId),
          or(
            and(eq(tahakkuk.tip, "MUHTASAR_SGK"), eq(tahakkuk.donem, donem)),
            and(eq(tahakkuk.tip, "KDV"), inArray(tahakkuk.donem, kdvDonemleri))
          )
        )
      )
    return s && s.adet > 0 ? Number(s.toplam) : undefined
  }

  /** Çeyrek sonu mizanı hatasızsa geçici vergi görevindeki "Mizan kontrol edildi" maddesi */
  private async gorevMaddesiniIsaretle(
    mukellefId: string,
    donem: string,
    kontroller: Mizan["kontroller"],
    aktor: Personel
  ) {
    const ay = Number(donem.slice(5, 7))
    if (ay % 3 !== 0 || kontroller.some((k) => k.durum === "HATA")) return undefined
    const anahtar = takvimOlayId(mukellefId, "GECICI_VERGI", `${donem.slice(0, 4)}-Q${ay / 3}`)
    return this.maddeler.tamamla(anahtar, MIZAN_KONTROL_MADDESI, aktor.id)
  }
}

function mizanView(z: Mizan, unvan: string): MizanView {
  const { hesaplar, ...rest } = z
  return { ...rest, mukellefUnvan: unvan, ozet: mizanOzeti(hesaplar), hesapSayisi: hesaplar.length }
}

/** Mizan satırları: 3 haneli ana hesap kodu, sonlu borç / alacak; en çok 1000 satır */
function hesaplariOku(v: unknown): MizanHesap[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAKS_HESAP) return null
  const hesaplar: MizanHesap[] = []
  for (const ham of v) {
    const h = govde(ham)
    if (
      typeof h.kod !== "string" ||
      !HESAP_KOD_RE.test(h.kod) ||
      typeof h.borc !== "number" ||
      !Number.isFinite(h.borc) ||
      typeof h.alacak !== "number" ||
      !Number.isFinite(h.alacak)
    )
      return null
    hesaplar.push({ kod: h.kod, ad: String(h.ad ?? ""), borc: h.borc, alacak: h.alacak })
  }
  return hesaplar
}

function hataMesaji(e: unknown, varsayilan: string) {
  if (e instanceof HttpException) {
    const yanit = e.getResponse()
    if (typeof yanit === "object" && yanit && "message" in yanit) {
      const m = (yanit as { message: unknown }).message
      if (typeof m === "string") return m
    }
  }
  return varsayilan
}
