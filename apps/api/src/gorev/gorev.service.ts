import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, count, eq, getTableColumns, inArray, isNotNull, ne, type SQL } from "drizzle-orm"

import {
  bahsedilenleriCoz,
  donemGorevleriniPlanla,
  gecikmisMi,
  otomatikGorevBasligi,
  tamamaTasiyabilirMi,
} from "@prime/shared/gorev/kurallar"
import {
  CHECKLIST_SABLONLARI,
  GOREV_DURUM_ETIKET,
  GOREV_DURUM_SIRASI,
  GOREV_ONCELIK_SIRASI,
  GOREV_TIP_ETIKET,
  GOREV_TIP_SIRASI,
  TAKVIM_SENKRON,
} from "@prime/shared/gorev/sabitler"
import { toYmd } from "@prime/shared/lib/tarih"
import { YUKUMLULUK_SIRASI } from "@prime/shared/takvim/kurallar"
import { takvimOlayId } from "@prime/shared/takvim/motor"
import type {
  DonemOlusturResponse,
  DonemPlanSatiri,
  GorevBagliTalep,
  GorevDetay,
  GorevOzetResponse,
  GorevTopluResponse,
  GorevView,
} from "@prime/shared/types/api"
import type {
  Gorev,
  GorevChecklistMaddesi,
  GorevDurum,
  GorevOncelik,
  GorevTip,
  Mukellef,
  MukellefTur,
  Personel,
  YukumlulukTip,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { BildirimService } from "../bildirim/bildirim.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { gorev, mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"
import { PersonelService } from "../personel/personel.service.js"
import { BeyanDurumuService } from "../takvim/beyan-durumu.service.js"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const DONEM_RE = /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/
const MAKS_BASLIK = 200
const MAKS_METIN = 2000

export interface GorevListeSorgusu {
  atanan?: string | string[]
  mukellefId?: string
  tip?: string | string[]
  durum?: string | string[]
  donem?: string
  geciken?: string
  q?: string
}

/**
 * Evrak talepleri (Faz 4) görev detayında özetlenir ve görevlere bağlanır. Talep modülü
 * kendini `talepKaynagiAyarla` ile kaydeder; kayıt yokken bağlı talep listesi boştur.
 */
export interface GorevTalepKaynagi {
  ozetler(ids: string[]): Promise<GorevBagliTalep[]>
  /** id → mükellef id (bulunamayanlar yok) */
  mukellefleri(ids: string[]): Promise<Map<string, string>>
}

type GorevSatiri = typeof gorev.$inferSelect
type Govde = Record<string, unknown>

const satirdan = (g: GorevSatiri): Gorev => nullsuz(g)
const govde = (b: unknown): Govde => (b && typeof b === "object" ? (b as Govde) : {})
const metin = (v: unknown) => (typeof v === "string" ? v : undefined)
const dizi = (v: string | string[] | undefined) => [v ?? []].flat()
const adSoyad = (p: Pick<Personel, "ad" | "soyad">) => `${p.ad} ${p.soyad}`
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR")

const yetkisiz = () =>
  new ForbiddenException({
    message: "Başkasına atanmış bir görevi yalnızca yönetici tamamlayabilir",
  })
const hata = (message: string) => new BadRequestException({ message })
const bulunamadi = () => new NotFoundException({ message: "Görev bulunamadı" })

function checklistOlustur(metinler: unknown[]): GorevChecklistMaddesi[] {
  return metinler
    .flatMap((m) => (typeof m === "string" && m.trim() ? [m.trim()] : []))
    .map((metin) => ({ id: newId("c"), metin, tamam: false }))
}

/** Gelen kontrol listesini öncekiyle birleştirir: tamamlayan / zaman yalnızca yeni işarette yazılır */
function checklistBirlestir(
  eski: GorevChecklistMaddesi[],
  yeni: unknown[],
  aktorId: string,
  simdi: string
): GorevChecklistMaddesi[] {
  const eskiMap = new Map(eski.map((m) => [m.id, m]))
  return yeni.flatMap((ham) => {
    const m = govde(ham)
    const metinDegeri = metin(m.metin)?.trim()
    if (!metinDegeri) return []
    const id = metin(m.id) || newId("c")
    const onceki = eskiMap.get(id)
    const tamam = Boolean(m.tamam)
    const base = { id, metin: metinDegeri.slice(0, MAKS_BASLIK), tamam }
    if (!tamam) return [base]
    if (onceki?.tamam) {
      return [
        {
          ...base,
          ...(onceki.tamamlayanId ? { tamamlayanId: onceki.tamamlayanId } : {}),
          ...(onceki.tamamlanmaTarihi ? { tamamlanmaTarihi: onceki.tamamlanmaTarihi } : {}),
        },
      ]
    }
    return [{ ...base, tamamlayanId: aktorId, tamamlanmaTarihi: simdi }]
  })
}

function degisiklikAciklamasi(eski: Gorev, yeni: Gorev, atananAdi: string): string {
  const parcalar: string[] = []
  if (eski.baslik !== yeni.baslik) parcalar.push("başlık")
  if ((eski.aciklama ?? "") !== (yeni.aciklama ?? "")) parcalar.push("açıklama")
  if (eski.oncelik !== yeni.oncelik) parcalar.push("öncelik")
  if (eski.sonTarih !== yeni.sonTarih) parcalar.push("son tarih")
  if (eski.atananId !== yeni.atananId) parcalar.push(`atanan: ${atananAdi}`)
  if (JSON.stringify(eski.bagliTalepIdler) !== JSON.stringify(yeni.bagliTalepIdler))
    parcalar.push("bağlı talepler")
  const eskiMap = new Map(eski.checklist.map((m) => [m.id, m]))
  for (const m of yeni.checklist) {
    const o = eskiMap.get(m.id)
    if (!o) parcalar.push(`kontrol maddesi eklendi: “${m.metin}”`)
    else if (!o.tamam && m.tamam) parcalar.push(`“${m.metin}” tamamlandı`)
    else if (o.tamam && !m.tamam) parcalar.push(`“${m.metin}” geri alındı`)
  }
  if (yeni.checklist.length < eski.checklist.length) parcalar.push("kontrol maddesi silindi")
  return parcalar.join(", ")
}

@Injectable()
export class GorevService implements OnModuleInit {
  private talepKaynagi: GorevTalepKaynagi | null = null

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly bildirimler: BildirimService,
    private readonly personeller: PersonelService,
    private readonly beyanDurumu: BeyanDurumuService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    // Görev olaylarının alıcısı görevin atananı (mükellef sorumlusundan önce)
    this.bildirimler.cozucuEkle({
      oncelik: 10,
      cozumle: async (log) => {
        if (log.hedefTip !== "GOREV" || !log.hedefId) return undefined
        const [g] = await this.txHost.tx
          .select({ atanan: gorev.atananId })
          .from(gorev)
          .where(eq(gorev.id, log.hedefId))
        return g ? { alici: g.atanan } : undefined
      },
    })
    this.personeller.silmeKontroluEkle(async (personelId) => {
      const [sonuc] = await this.txHost.tx
        .select({ n: count() })
        .from(gorev)
        .where(and(eq(gorev.atananId, personelId), ne(gorev.durum, "TAMAM")))
      const n = sonuc?.n ?? 0
      return n ? `${n} açık görevin atananı` : null
    })
    this.seed.adimEkle(async (state, db) => {
      if (state.gorev.length) await db.insert(gorev).values(state.gorev)
    })
  }

  talepKaynagiAyarla(kaynak: GorevTalepKaynagi) {
    this.talepKaynagi = kaynak
  }

  private bugun() {
    return toYmd(this.saat.simdi())
  }

  // --- Okuma ---------------------------------------------------------------

  async ozet(atanan?: string): Promise<GorevOzetResponse> {
    const bugunYmd = this.bugun()
    const kosullar: SQL[] = [ne(gorev.durum, "TAMAM")]
    if (atanan) kosullar.push(eq(gorev.atananId, atanan))
    const acik = await this.txHost.tx
      .select({ atananId: gorev.atananId, durum: gorev.durum, sonTarih: gorev.sonTarih })
      .from(gorev)
      .where(and(...kosullar))

    const personelMap = new Map<string, { acik: number; geciken: number }>()
    let geciken = 0
    for (const g of acik) {
      const p = personelMap.get(g.atananId) ?? { acik: 0, geciken: 0 }
      p.acik++
      if (gecikmisMi(g, bugunYmd)) {
        p.geciken++
        geciken++
      }
      personelMap.set(g.atananId, p)
    }
    return {
      acik: acik.length,
      geciken,
      personel: [...personelMap.entries()].map(([personelId, v]) => ({ personelId, ...v })),
    }
  }

  async liste(s: GorevListeSorgusu): Promise<GorevView[]> {
    const atananlar = dizi(s.atanan)
    const tipler = dizi(s.tip) as GorevTip[]
    const durumlar = dizi(s.durum) as GorevDurum[]
    const kosullar: SQL[] = []
    if (atananlar.length) kosullar.push(inArray(gorev.atananId, atananlar))
    if (s.mukellefId) kosullar.push(eq(gorev.mukellefId, s.mukellefId))
    if (tipler.length) kosullar.push(inArray(gorev.tip, tipler))
    if (durumlar.length) kosullar.push(inArray(gorev.durum, durumlar))
    if (s.donem) kosullar.push(eq(gorev.donem, s.donem))

    const bugunYmd = this.bugun()
    const geciken = s.geciken === "true"
    const q = kucuk(s.q?.trim() ?? "")
    const satirlar = await this.viewSorgusu().where(and(...kosullar))
    return satirlar
      .map((r) => this.view(r, bugunYmd))
      .filter(
        (g) =>
          (!geciken || g.gecikti) &&
          (!q || kucuk(g.baslik).includes(q) || kucuk(g.mukellefUnvan).includes(q))
      )
      .sort(
        (a, b) =>
          a.sonTarih.localeCompare(b.sonTarih) ||
          GOREV_ONCELIK_SIRASI.indexOf(a.oncelik) - GOREV_ONCELIK_SIRASI.indexOf(b.oncelik) ||
          a.mukellefUnvan.localeCompare(b.mukellefUnvan, "tr-TR")
      )
  }

  async detay(id: string): Promise<GorevDetay> {
    const [r] = await this.viewSorgusu().where(eq(gorev.id, id))
    if (!r) throw bulunamadi()
    return this.detayOlustur(this.view(r))
  }

  // --- Yazma ---------------------------------------------------------------

  @Transactional()
  async olustur(aktor: Personel, ham: unknown): Promise<GorevView> {
    const body = govde(ham)
    const baslik = metin(body.baslik)?.trim()
    if (!baslik || baslik.length > MAKS_BASLIK)
      throw hata("Başlık zorunludur (en fazla 200 karakter)")
    const m = await this.mukellefBul(metin(body.mukellefId))
    if (!m) throw new NotFoundException({ message: "Mükellef bulunamadı" })
    const atananId = metin(body.atananId)
    if (!(await this.personelBul(atananId))) throw hata("Atanan personel bulunamadı")
    const tip = body.tip as GorevTip
    if (!GOREV_TIP_SIRASI.includes(tip)) throw hata("Geçersiz görev tipi")
    const oncelik = body.oncelik as GorevOncelik
    if (!GOREV_ONCELIK_SIRASI.includes(oncelik)) throw hata("Geçersiz öncelik")
    const sonTarih = metin(body.sonTarih) ?? ""
    if (!YMD_RE.test(sonTarih)) throw hata("Geçerli bir son tarih giriniz")
    const donem = body.donem ? metin(body.donem) : undefined
    if (body.donem && !DONEM_RE.test(donem ?? "")) throw hata("Geçersiz dönem")

    // Beyanname görevleri takvim olayına bağlanır; aynı dönem için ikinci görev açılmaz
    const otomatikAnahtar = tip !== "DIGER" && donem ? takvimOlayId(m.id, tip, donem) : undefined
    const simdi = this.saat.simdiIso()
    const [eklenen] = await this.txHost.tx
      .insert(gorev)
      .values({
        id: newId("o"),
        baslik,
        aciklama: metin(body.aciklama)?.trim().slice(0, MAKS_METIN) || null,
        mukellefId: m.id,
        tip,
        donem: donem || null,
        atananId: atananId!,
        durum: "YAPILACAK",
        oncelik,
        sonTarih,
        checklist: checklistOlustur(Array.isArray(body.checklist) ? body.checklist : []),
        yorumlar: [],
        bagliTalepIdler: [],
        olusturanId: aktor.id,
        olusturmaTarihi: simdi,
        guncellemeTarihi: simdi,
        otomatikAnahtar: otomatikAnahtar ?? null,
      })
      .onConflictDoNothing()
      .returning()
    if (!eklenen) {
      const [mevcut] = await this.txHost.tx
        .select({ baslik: gorev.baslik })
        .from(gorev)
        .where(eq(gorev.otomatikAnahtar, otomatikAnahtar!))
      throw new ConflictException({
        message: `Bu dönem için zaten bir görev var: ${mevcut?.baslik ?? ""}`,
      })
    }

    const g = satirdan(eklenen)
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "GOREV_OLUSTURULDU",
      hedefTip: "GOREV",
      hedefId: g.id,
      mukellefId: g.mukellefId,
      aciklama: `${g.baslik} → ${await this.personelAdi(g.atananId)}`,
    })
    return this.viewMukellefle(g, m)
  }

  @Transactional()
  async toplu(aktor: Personel, ham: unknown): Promise<GorevTopluResponse> {
    const { ids, durum, atananId } = govde(ham) as {
      ids?: unknown
      durum?: GorevDurum
      atananId?: string
    }
    if (!Array.isArray(ids) || ids.length === 0) throw hata("En az bir görev seçin")
    if (durum && !GOREV_DURUM_SIRASI.includes(durum)) throw hata("Geçersiz durum")
    if (atananId && !(await this.personelBul(atananId))) throw hata("Atanan personel bulunamadı")
    if (!durum && !atananId) throw hata("Değişiklik belirtilmedi")

    const sonuc: GorevTopluResponse = { guncellenen: [], reddedilen: [] }
    for (const id of new Set(ids.filter((i): i is string => typeof i === "string"))) {
      let g = await this.kilitle(id)
      if (!g) continue
      if (atananId && g.atananId !== atananId) {
        g = await this.yaz(g.id, { atananId })
        await this.aktiviteler.log({
          aktorId: aktor.id,
          eylem: "GOREV_ATANDI",
          hedefTip: "GOREV",
          hedefId: g.id,
          mukellefId: g.mukellefId,
          aciklama: `${g.baslik} → ${await this.personelAdi(atananId)}`,
        })
      }
      if (durum && !(await this.durumDegistir(g, durum, aktor))) {
        sonuc.reddedilen.push(g.id)
        continue
      }
      sonuc.guncellenen.push(g.id)
    }
    return sonuc
  }

  async donemOnizleme(ham: unknown): Promise<DonemPlanSatiri[]> {
    const { tip, donem } = this.donemDogrula(ham)
    return this.donemPlani(tip, donem)
  }

  @Transactional()
  async donemOlustur(aktor: Personel, ham: unknown): Promise<DonemOlusturResponse> {
    const { tip, donem } = this.donemDogrula(ham)
    const { mukellefIdler } = govde(ham)
    const secili = new Set(Array.isArray(mukellefIdler) ? mukellefIdler : [])
    const plan = (await this.donemPlani(tip, donem)).filter((s) => secili.has(s.mukellefId))

    const simdi = this.saat.simdiIso()
    const yeniler = plan
      .filter((s) => !s.mevcutGorevId)
      .map((s) => ({
        id: newId("o"),
        baslik: otomatikGorevBasligi(tip, donem),
        mukellefId: s.mukellefId,
        tip,
        donem,
        atananId: s.atananId,
        durum: "YAPILACAK" as const,
        oncelik: "NORMAL" as const,
        sonTarih: s.sonTarih,
        checklist: checklistOlustur(CHECKLIST_SABLONLARI[tip]),
        yorumlar: [],
        bagliTalepIdler: [],
        olusturanId: aktor.id,
        olusturmaTarihi: simdi,
        guncellemeTarihi: simdi,
        otomatikAnahtar: takvimOlayId(s.mukellefId, tip, donem),
      }))
    // Eşzamanlı ikinci çağrı aynı anahtarı ekleyemez (unique); eklenmeyenler atlanmış sayılır
    const eklenen = yeniler.length
      ? await this.txHost.tx
          .insert(gorev)
          .values(yeniler)
          .onConflictDoNothing()
          .returning({ id: gorev.id })
      : []
    const olusturulan = eklenen.length
    if (olusturulan > 0) {
      await this.aktiviteler.log({
        aktorId: aktor.id,
        eylem: "DONEM_GOREVLERI_OLUSTURULDU",
        hedefTip: "GOREV",
        aciklama: `${GOREV_TIP_ETIKET[tip]} ${donem}: ${olusturulan} görev`,
      })
    }
    return { olusturulan, atlanan: plan.length - olusturulan }
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, ham: unknown): Promise<GorevDetay> {
    const g = await this.kilitle(id)
    if (!g) throw bulunamadi()
    const body = govde(ham)

    const patch: Partial<GorevSatiri> = {}
    if (body.baslik !== undefined) {
      const baslik = metin(body.baslik)?.trim()
      if (!baslik || baslik.length > MAKS_BASLIK)
        throw hata("Başlık zorunludur (en fazla 200 karakter)")
      patch.baslik = baslik
    }
    if (body.aciklama !== undefined)
      patch.aciklama = metin(body.aciklama)?.trim().slice(0, MAKS_METIN) || null
    if (body.atananId !== undefined) {
      const atananId = metin(body.atananId)
      if (!(await this.personelBul(atananId))) throw hata("Atanan personel bulunamadı")
      patch.atananId = atananId
    }
    if (body.oncelik !== undefined) {
      if (!GOREV_ONCELIK_SIRASI.includes(body.oncelik as GorevOncelik))
        throw hata("Geçersiz öncelik")
      patch.oncelik = body.oncelik as GorevOncelik
    }
    if (body.sonTarih !== undefined) {
      const sonTarih = metin(body.sonTarih)
      if (!sonTarih || !YMD_RE.test(sonTarih)) throw hata("Geçerli bir son tarih giriniz")
      patch.sonTarih = sonTarih
    }
    const simdi = this.saat.simdiIso()
    if (body.checklist !== undefined) {
      if (!Array.isArray(body.checklist)) throw hata("Geçersiz kontrol listesi")
      patch.checklist = checklistBirlestir(g.checklist, body.checklist, aktor.id, simdi)
    }
    if (body.bagliTalepIdler !== undefined) {
      const ham = body.bagliTalepIdler
      const ids = Array.isArray(ham) ? [...new Set(ham)] : null
      const mukellefleri =
        ids?.length && ids.every((i) => typeof i === "string") && this.talepKaynagi
          ? await this.talepKaynagi.mukellefleri(ids as string[])
          : new Map<string, string>()
      if (!ids || ids.some((i) => mukellefleri.get(i as string) !== g.mukellefId))
        throw hata("Yalnızca aynı mükellefin evrak talepleri bağlanabilir")
      patch.bagliTalepIdler = ids as string[]
    }

    const guncel = await this.yaz(g.id, patch, simdi)
    const atananAdi =
      patch.atananId && patch.atananId !== g.atananId ? await this.personelAdi(patch.atananId) : ""
    const aciklama = degisiklikAciklamasi(g, guncel, atananAdi)
    if (aciklama) {
      await this.aktiviteler.log({
        aktorId: aktor.id,
        eylem:
          patch.atananId && patch.atananId !== g.atananId ? "GOREV_ATANDI" : "GOREV_GUNCELLENDI",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: `${guncel.baslik}: ${aciklama}`,
      })
    }
    return this.detay(g.id)
  }

  @Transactional()
  async tasi(aktor: Personel, id: string, ham: unknown): Promise<GorevView> {
    const g = await this.kilitle(id)
    if (!g) throw bulunamadi()
    const durum = govde(ham).durum as GorevDurum
    if (!GOREV_DURUM_SIRASI.includes(durum)) throw hata("Geçersiz durum")
    const guncel = await this.durumDegistir(g, durum, aktor)
    if (!guncel) throw yetkisiz()
    const [r] = await this.viewSorgusu().where(eq(gorev.id, g.id))
    return this.view(r!)
  }

  @Transactional()
  async yorum(aktor: Personel, id: string, ham: unknown): Promise<GorevDetay> {
    const g = await this.kilitle(id)
    if (!g) throw bulunamadi()
    const yorumMetni = metin(govde(ham).metin)?.trim()
    if (!yorumMetni || yorumMetni.length > MAKS_METIN)
      throw hata("Yorum boş olamaz (en fazla 2000 karakter)")

    const aktifler = await this.txHost.tx
      .select({ id: personel.id, ad: personel.ad, soyad: personel.soyad })
      .from(personel)
      .where(eq(personel.aktif, true))
    const bahsedilenler = bahsedilenleriCoz(yorumMetni, aktifler)
    const simdi = this.saat.simdiIso()
    await this.yaz(
      g.id,
      {
        yorumlar: [
          ...g.yorumlar,
          { id: newId("y"), yazarId: aktor.id, metin: yorumMetni, bahsedilenler, zaman: simdi },
        ],
      },
      simdi
    )

    const adlar = new Map(aktifler.map((p) => [p.id, adSoyad(p)]))
    const log = await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "GOREV_YORUMLANDI",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: bahsedilenler.length
          ? `${g.baslik} · ${bahsedilenler.map((b) => adlar.get(b) ?? "—").join(", ")} anıldı`
          : g.baslik,
      },
      // Anılan atanana ayrıca "yorum" bildirimi gitmez
      { alicilar: bahsedilenler.includes(g.atananId) ? [] : [g.atananId] }
    )
    await this.bildirimler.uret(
      { ...log, aciklama: `${g.baslik}: ${yorumMetni.slice(0, 140)}` },
      {
        tur: "GOREV_ANILDI",
        baslik: `${adSoyad(aktor)} sizi bir yorumda andı`,
        alicilar: bahsedilenler,
      }
    )
    return this.detay(g.id)
  }

  @Transactional()
  async sil(aktor: Personel, id: string): Promise<void> {
    const g = await this.kilitle(id)
    if (!g) throw bulunamadi()
    if (aktor.rol !== "YONETICI" && g.olusturanId !== aktor.id) {
      throw new ForbiddenException({
        message: "Görevi yalnızca oluşturan kişi veya yönetici silebilir",
      })
    }
    await this.txHost.tx.delete(gorev).where(eq(gorev.id, g.id))
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "GOREV_SILINDI",
        hedefTip: "GOREV",
        hedefId: g.id,
        mukellefId: g.mukellefId,
        aciklama: g.baslik,
      },
      // Kayıt silindiği için atanan kuraldan çözülemez
      { alicilar: [g.atananId] }
    )
  }

  // --- Yardımcılar ---------------------------------------------------------

  /**
   * Görevi yeni sütuna taşır; "Tamam" yetkisini denetler, takvimdeki beyan durumunu yalnızca
   * ileri yönde günceller ve aktiviteye yazar. Yetki yoksa `null`.
   */
  private async durumDegistir(g: Gorev, durum: GorevDurum, aktor: Personel) {
    if (g.durum === durum) return g
    if (durum === "TAMAM" && !tamamaTasiyabilirMi(aktor, g)) return null

    const simdi = this.saat.simdiIso()
    const guncel = await this.yaz(
      g.id,
      { durum, tamamlanmaTarihi: durum === "TAMAM" ? simdi : null },
      simdi
    )
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "GOREV_DURUMU_DEGISTI",
      hedefTip: "GOREV",
      hedefId: g.id,
      mukellefId: g.mukellefId,
      aciklama: `${g.baslik}: ${GOREV_DURUM_ETIKET[g.durum]} → ${GOREV_DURUM_ETIKET[durum]}`,
    })

    const hedef = TAKVIM_SENKRON[durum]
    if (g.otomatikAnahtar && hedef) {
      await this.beyanDurumu.yaz(g.otomatikAnahtar, hedef, aktor.id, {
        aciklamaEki: " (görevden)",
        yalnizIleri: true,
      })
    }
    return guncel
  }

  /** Satırı transaction sonuna kadar kilitler (yorum / kontrol listesi eşzamanlı yazılmasın) */
  private async kilitle(id: string): Promise<Gorev | undefined> {
    const [g] = await this.txHost.tx.select().from(gorev).where(eq(gorev.id, id)).for("update")
    return g && satirdan(g)
  }

  private async yaz(id: string, patch: Partial<GorevSatiri>, simdi = this.saat.simdiIso()) {
    const [g] = await this.txHost.tx
      .update(gorev)
      .set({ ...patch, guncellemeTarihi: simdi })
      .where(eq(gorev.id, id))
      .returning()
    return satirdan(g!)
  }

  private viewSorgusu() {
    return this.txHost.tx
      .select({
        ...getTableColumns(gorev),
        mukellefUnvan: mukellef.unvan,
        mukellefTur: mukellef.tur,
      })
      .from(gorev)
      .leftJoin(mukellef, eq(mukellef.id, gorev.mukellefId))
  }

  private view(
    {
      mukellefUnvan,
      mukellefTur,
      ...g
    }: GorevSatiri & {
      mukellefUnvan: string | null
      mukellefTur: MukellefTur | null
    },
    bugunYmd = this.bugun()
  ): GorevView {
    const gorevKaydi = satirdan(g)
    return {
      ...gorevKaydi,
      mukellefUnvan: mukellefUnvan ?? "",
      mukellefTur: mukellefTur ?? "SAHIS",
      gecikti: gecikmisMi(gorevKaydi, bugunYmd),
    }
  }

  private viewMukellefle(g: Gorev, m: Pick<Mukellef, "unvan" | "tur">): GorevView {
    return {
      ...g,
      mukellefUnvan: m.unvan,
      mukellefTur: m.tur,
      gecikti: gecikmisMi(g, this.bugun()),
    }
  }

  private async detayOlustur(v: GorevView): Promise<GorevDetay> {
    const bagliTalepler =
      v.bagliTalepIdler.length && this.talepKaynagi
        ? await this.talepKaynagi.ozetler(v.bagliTalepIdler)
        : []
    return {
      ...v,
      bagliTalepler,
      ...(v.otomatikAnahtar ? { beyanDurumu: await this.beyanDurumu.oku(v.otomatikAnahtar) } : {}),
    }
  }

  private donemDogrula(ham: unknown): { tip: YukumlulukTip; donem: string } {
    const { tip, donem } = govde(ham)
    if (!YUKUMLULUK_SIRASI.includes(tip as YukumlulukTip) || !DONEM_RE.test(metin(donem) ?? ""))
      throw hata("Geçerli bir tip ve dönem seçin")
    return { tip: tip as YukumlulukTip, donem: donem as string }
  }

  private async donemPlani(tip: YukumlulukTip, donem: string) {
    const tx = this.txHost.tx
    const [mukellefler, mevcut] = await Promise.all([
      tx.select().from(mukellef),
      tx
        .select({ id: gorev.id, anahtar: gorev.otomatikAnahtar })
        .from(gorev)
        .where(and(eq(gorev.tip, tip), eq(gorev.donem, donem), isNotNull(gorev.otomatikAnahtar))),
    ])
    return donemGorevleriniPlanla(
      mukellefler.map((m) => nullsuz(m)),
      tip,
      donem,
      new Map(mevcut.map((g) => [g.anahtar!, g.id]))
    )
  }

  private async mukellefBul(id: string | undefined) {
    if (!id) return undefined
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id, unvan: mukellef.unvan, tur: mukellef.tur })
      .from(mukellef)
      .where(eq(mukellef.id, id))
    return m
  }

  private async personelBul(id: string | undefined) {
    if (!id) return undefined
    const [p] = await this.txHost.tx
      .select({ ad: personel.ad, soyad: personel.soyad })
      .from(personel)
      .where(eq(personel.id, id))
    return p
  }

  private async personelAdi(id: string) {
    const p = await this.personelBul(id)
    return p ? adSoyad(p) : "—"
  }
}
