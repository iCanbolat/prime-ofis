import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common"
import { and, desc, eq, inArray } from "drizzle-orm"

import { KDF_ITERATIONS } from "@prime/shared/kasa/kripto"
import { demoKasasi, type KasaKurulumu } from "@prime/mock-data/kasa"
import type {
  CredentialErisimRequest,
  CredentialKaydi,
  KasaMetaResponse,
  SonErisim,
  TopluAktarimSonucu,
} from "@prime/shared/types/api"
import type {
  AktiviteEylem,
  Credential,
  EncryptedPayload,
  Personel,
  Sistem,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { newId } from "../core/id.js"
import { nullsuz } from "../core/nullsuz.js"
import { Saat } from "../core/saat.js"
import type { DrizzleTx } from "../db/db.module.js"
import { aktivite, credential, kasaMeta, mukellef, personel } from "../db/schema/index.js"
import { SeedYukleyici } from "../dev/seed-yukleyici.js"

const KASA_ID = "kasa"
const SISTEMLER: Sistem[] = ["GIB", "SGK", "IVD", "EBILDIRGE"]
const ERISIM_EYLEMLERI: CredentialErisimRequest["eylem"][] = [
  "SIFRE_GORUNTULENDI",
  "SIFRE_KOPYALANDI",
]
/** Son erişim bu eylemlerden türetilir (saklanmaz) */
const SON_ERISIM_EYLEMLERI: AktiviteEylem[] = [
  "SIFRE_GORUNTULENDI",
  "SIFRE_KOPYALANDI",
  "SIFRE_TEBLIGATA_AKTARILDI",
]
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const KULLANICI_ADI_EN_FAZLA = 200
const NOT_EN_FAZLA = 1000
/** Şifreli metin üst sınırı (base64): şifre + ek şifre JSON'u için fazlasıyla yeterli */
const SIFRELI_EN_FAZLA = 8192
/** Kurulum / ana şifre değişiminde kabul edilen PBKDF2 tur aralığı */
const TUR_EN_AZ = 100_000
const TUR_EN_FAZLA = 10_000_000

const SIFRELI_DEGIL = "Şifre şifrelenmiş olarak gönderilmelidir"
const KASA_YOK = "Kasa henüz kurulmadı"

const baytUzunlugu = (b64: string) => Buffer.from(b64, "base64").length

/**
 * Sunucu yalnızca şifreli veri kabul eder: düz metin gönderimini engellemek için biçim kontrolü.
 * AES-GCM: IV 12 bayt, şifreli metin en az 16 bayt (etiket).
 */
function sifreliMi(body: { cipherText?: unknown; iv?: unknown }): body is EncryptedPayload {
  const { cipherText, iv } = body
  return (
    typeof cipherText === "string" &&
    typeof iv === "string" &&
    cipherText.length <= SIFRELI_EN_FAZLA &&
    BASE64.test(cipherText) &&
    BASE64.test(iv) &&
    baytUzunlugu(iv) === 12 &&
    baytUzunlugu(cipherText) >= 16
  )
}

interface KayitGirdisi {
  kullaniciAdi: string
  not?: string
  cipherText: string
  iv: string
}

/** Kayıt gövdesi (kullanıcı adı, not, şifreli alanlar); hata mesajı ya da temiz alanlar */
function kayitAlanlari(body: Record<string, unknown>): string | KayitGirdisi {
  const kullaniciAdi = typeof body.kullaniciAdi === "string" ? body.kullaniciAdi.trim() : ""
  if (!kullaniciAdi) return "Kullanıcı adı zorunludur"
  if (kullaniciAdi.length > KULLANICI_ADI_EN_FAZLA) return "Kullanıcı adı çok uzun"
  const not = typeof body.not === "string" ? body.not.trim() : ""
  if (not.length > NOT_EN_FAZLA) return "Not çok uzun"
  if (!sifreliMi(body)) return SIFRELI_DEGIL
  return { kullaniciAdi, not: not || undefined, cipherText: body.cipherText, iv: body.iv }
}

const nesne = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** Kurulum ve ana şifre değişimindeki meta: salt ≥ 16 bayt, tur aralıkta, doğrulayıcı şifreli */
function metaDogrula(v: unknown): KasaMetaResponse {
  const { salt, iterations, verifier } = nesne(v)
  if (typeof salt !== "string" || !BASE64.test(salt) || baytUzunlugu(salt) < 16) {
    throw new BadRequestException({ message: "Geçersiz kasa tuzu (salt)" })
  }
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < TUR_EN_AZ ||
    iterations > TUR_EN_FAZLA
  ) {
    throw new BadRequestException({ message: "Geçersiz anahtar türetme tur sayısı" })
  }
  if (!sifreliMi(nesne(verifier))) {
    throw new BadRequestException({ message: "Geçersiz kasa doğrulayıcısı" })
  }
  const { cipherText, iv } = verifier as EncryptedPayload
  return { salt, iterations, verifier: { cipherText, iv } }
}

@Injectable()
export class KasaService implements OnModuleInit {
  /** Demo kasası anahtar türetmesi pahalı; aynı mükellef listesi için bir kez hesaplanır */
  private readonly demoOnbellegi = new Map<string, Promise<KasaKurulumu>>()

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly aktiviteler: AktiviteService,
    private readonly seed: SeedYukleyici,
    private readonly saat: Saat
  ) {}

  onModuleInit() {
    // Dev / test seed'i: demo ana şifreyle (`demo1234`) kurulu kasa ve örnek şifreler
    this.seed.adimEkle(async (state, db) => {
      if (!state.mukellef.length) return
      const anahtar = state.mukellef.map((m) => m.id).join(",")
      let kurulum = this.demoOnbellegi.get(anahtar)
      if (!kurulum) {
        const guncelleyenId = state.personel.find((p) => p.rol === "YONETICI")?.id ?? "sistem"
        kurulum = demoKasasi(state.mukellef, {
          iterations: KDF_ITERATIONS,
          guncelleyenId,
          zaman: this.saat.simdiIso(),
        })
        this.demoOnbellegi.set(anahtar, kurulum)
      }
      const { meta, credentials } = await kurulum
      await db.insert(kasaMeta).values({ id: KASA_ID, ...meta })
      await db
        .insert(credential)
        .values(credentials.map((c, i) => ({ ...c, id: `c_demo${String(i).padStart(4, "0")}` })))
    })
  }

  async meta(): Promise<KasaMetaResponse> {
    const [m] = await this.txHost.tx.select().from(kasaMeta).where(eq(kasaMeta.id, KASA_ID))
    if (!m) throw new NotFoundException({ message: KASA_YOK })
    return { salt: m.salt, iterations: m.iterations, verifier: m.verifier }
  }

  async liste(mukellefId?: string): Promise<CredentialKaydi[]> {
    const satirlar = await this.txHost.tx
      .select()
      .from(credential)
      .where(mukellefId ? eq(credential.mukellefId, mukellefId) : undefined)
      .orderBy(credential.mukellefId, credential.sistem)
    const erisimler = await this.sonErisimler(satirlar.map((c) => c.id))
    return satirlar.map((c) => ({ ...nullsuz(c), sonErisim: erisimler.get(c.id) ?? null }))
  }

  @Transactional()
  async olustur(aktor: Personel, govde: unknown): Promise<CredentialKaydi> {
    await this.kasaKilitle("paylasimli")
    const body = nesne(govde)
    const mukellefId = typeof body.mukellefId === "string" ? body.mukellefId : ""
    if (!(await this.mukellefVarMi(mukellefId))) {
      throw new NotFoundException({ message: "Mükellef bulunamadı" })
    }
    if (!SISTEMLER.includes(body.sistem as Sistem)) {
      throw new BadRequestException({ message: "Geçersiz sistem" })
    }
    const alanlar = kayitAlanlari(body)
    if (typeof alanlar === "string") throw new BadRequestException({ message: alanlar })
    const sistem = body.sistem as Sistem
    if (await this.bul(mukellefId, sistem)) {
      throw new ConflictException({ message: "Bu sistem için zaten kayıtlı bir şifre var" })
    }

    const [yeni] = await this.txHost.tx
      .insert(credential)
      .values({
        id: newId("c"),
        mukellefId,
        sistem,
        ...alanlar,
        sonGuncelleme: this.saat.simdiIso(),
        guncelleyenId: aktor.id,
      })
      .returning()
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "SIFRE_EKLENDI",
      hedefTip: "CREDENTIAL",
      hedefId: yeni!.id,
      mukellefId,
      aciklama: sistem,
    })
    return { ...nullsuz(yeni!), sonErisim: null }
  }

  /**
   * Hızlı başlangıç: Excel'den şifreler. İstemci her kaydı kasa anahtarıyla şifreler; sunucu
   * yalnızca şifreli veriyi alır. Mevcut kayıt `uzerineYaz` ile güncellenir, yoksa atlanır.
   */
  @Transactional()
  async toplu(aktor: Personel, govde: unknown): Promise<TopluAktarimSonucu> {
    const { uzerineYaz, kayitlar } = nesne(govde)
    if (!Array.isArray(kayitlar) || kayitlar.length === 0) {
      throw new BadRequestException({ message: "Aktarılacak kayıt yok" })
    }
    await this.kasaKilitle("paylasimli")

    const sonuc: TopluAktarimSonucu = { olusturulan: 0, guncellenen: 0, atlanan: 0, hatalar: [] }
    const zaman = this.saat.simdiIso()
    for (const ham of kayitlar) {
      const k = nesne(ham)
      const satir = Number(k.satir) || 0
      const mukellefId = typeof k.mukellefId === "string" ? k.mukellefId : ""
      const alanlar = kayitAlanlari(k)
      const hata = !(await this.mukellefVarMi(mukellefId))
        ? "Mükellef bulunamadı"
        : !SISTEMLER.includes(k.sistem as Sistem)
          ? "Geçersiz sistem"
          : typeof alanlar === "string"
            ? alanlar
            : null
      if (hata || typeof alanlar === "string") {
        sonuc.hatalar.push({ satir, mesaj: hata ?? String(alanlar) })
        continue
      }
      const sistem = k.sistem as Sistem
      const mevcut = await this.bul(mukellefId, sistem)
      if (mevcut && uzerineYaz !== true) {
        sonuc.atlanan++
        continue
      }
      const degerler = {
        not: null,
        ...alanlar,
        sonGuncelleme: zaman,
        guncelleyenId: aktor.id,
      }
      const [kayit] = mevcut
        ? await this.txHost.tx
            .update(credential)
            .set(degerler)
            .where(eq(credential.id, mevcut.id))
            .returning()
        : await this.txHost.tx
            .insert(credential)
            .values({ id: newId("c"), mukellefId, sistem, ...degerler })
            .returning()
      await this.aktiviteler.log(
        {
          aktorId: aktor.id,
          eylem: mevcut ? "SIFRE_GUNCELLENDI" : "SIFRE_EKLENDI",
          hedefTip: "CREDENTIAL",
          hedefId: kayit!.id,
          mukellefId,
          aciklama: `${sistem} (içe aktarım)`,
        },
        false
      )
      if (mevcut) sonuc.guncellenen++
      else sonuc.olusturulan++
    }
    return sonuc
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, govde: unknown): Promise<CredentialKaydi> {
    await this.kasaKilitle("paylasimli")
    const mevcut = await this.getir(id)
    const alanlar = kayitAlanlari(nesne(govde))
    if (typeof alanlar === "string") throw new BadRequestException({ message: alanlar })

    const [guncel] = await this.txHost.tx
      .update(credential)
      .set({
        not: null,
        ...alanlar,
        sonGuncelleme: this.saat.simdiIso(),
        guncelleyenId: aktor.id,
      })
      .where(eq(credential.id, mevcut.id))
      .returning()
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "SIFRE_GUNCELLENDI",
      hedefTip: "CREDENTIAL",
      hedefId: mevcut.id,
      mukellefId: mevcut.mukellefId,
      aciklama: mevcut.sistem,
    })
    return { ...nullsuz(guncel!), sonErisim: await this.sonErisim(mevcut.id) }
  }

  @Transactional()
  async sil(aktor: Personel, id: string) {
    const mevcut = await this.getir(id)
    await this.txHost.tx.delete(credential).where(eq(credential.id, mevcut.id))
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: "SIFRE_SILINDI",
      hedefTip: "CREDENTIAL",
      hedefId: mevcut.id,
      mukellefId: mevcut.mukellefId,
      aciklama: mevcut.sistem,
    })
  }

  /** Şifre görüntüleme / kopyalama istemcide olur; sunucu yalnızca kaydını tutar */
  @Transactional()
  async erisim(aktor: Personel, id: string, govde: unknown): Promise<{ sonErisim: SonErisim | null }> {
    const kayit = await this.getir(id)
    const { eylem } = nesne(govde)
    if (!ERISIM_EYLEMLERI.includes(eylem as CredentialErisimRequest["eylem"])) {
      throw new BadRequestException({ message: "Geçersiz erişim türü" })
    }
    await this.aktiviteler.log({
      aktorId: aktor.id,
      eylem: eylem as CredentialErisimRequest["eylem"],
      hedefTip: "CREDENTIAL",
      hedefId: kayit.id,
      mukellefId: kayit.mukellefId,
      aciklama: kayit.sistem,
    })
    return { sonErisim: await this.sonErisim(kayit.id) }
  }

  /** İlk kurulum (yönetici): meta istemcide ana şifreden üretilir; kurulu kasa 409 */
  @Transactional()
  async kurulum(aktor: Personel, govde: unknown): Promise<KasaMetaResponse> {
    const meta = metaDogrula(govde)
    const eklenen = await this.txHost.tx
      .insert(kasaMeta)
      .values({ id: KASA_ID, ...meta, olusturmaTarihi: this.saat.simdiIso() })
      .onConflictDoNothing()
      .returning({ id: kasaMeta.id })
    if (!eklenen.length) throw new ConflictException({ message: "Kasa zaten kurulu" })
    await this.aktiviteler.log({ aktorId: aktor.id, eylem: "KASA_KURULDU" }, false)
    return meta
  }

  /**
   * Ana şifre değişimi (yönetici): yeni meta + istemcide yeni anahtarla yeniden şifrelenmiş tüm
   * kayıtlar tek transaction'da yazılır. Kasa satırı kilitlenir; bu sırada eklenen / değişen
   * kayıt beklenir. Gönderilen küme sunucudakiyle birebir değilse (arada eklendi / silindi) 409.
   */
  @Transactional()
  async anahtarDegistir(aktor: Personel, govde: unknown): Promise<KasaMetaResponse> {
    const body = nesne(govde)
    const meta = metaDogrula(body.meta)
    if (!Array.isArray(body.kayitlar)) {
      throw new BadRequestException({ message: "Kayıt listesi zorunludur" })
    }
    const kayitlar = body.kayitlar.map(nesne)
    if (kayitlar.some((k) => typeof k.id !== "string" || !sifreliMi(k))) {
      throw new BadRequestException({ message: SIFRELI_DEGIL })
    }
    await this.kasaKilitle("ozel")

    const mevcutlar = await this.txHost.tx.select({ id: credential.id }).from(credential)
    const gelen = new Set(kayitlar.map((k) => k.id as string))
    if (
      gelen.size !== kayitlar.length ||
      gelen.size !== mevcutlar.length ||
      mevcutlar.some((c) => !gelen.has(c.id))
    ) {
      throw new ConflictException({
        message: "Kasadaki kayıtlar değişti; sayfayı yenileyip yeniden deneyin",
      })
    }

    await this.txHost.tx.update(kasaMeta).set(meta).where(eq(kasaMeta.id, KASA_ID))
    for (const k of kayitlar) {
      const { cipherText, iv } = k as unknown as EncryptedPayload
      await this.txHost.tx
        .update(credential)
        .set({ cipherText, iv })
        .where(eq(credential.id, k.id as string))
    }
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "KASA_ANAHTARI_DEGISTI",
        aciklama: `${kayitlar.length} kayıt yeniden şifrelendi`,
      },
      false
    )
    return meta
  }

  /**
   * Kasa satırını kilitler: yazmalar paylaşımlı, ana şifre değişimi özel kilit alır; böylece
   * değişim sürerken eski anahtarla şifrelenmiş kayıt yazılamaz. Kasa kurulu değilse 409.
   */
  private async kasaKilitle(tur: "paylasimli" | "ozel") {
    const sorgu = this.txHost.tx
      .select({ id: kasaMeta.id })
      .from(kasaMeta)
      .where(eq(kasaMeta.id, KASA_ID))
    const [m] = await (tur === "ozel" ? sorgu.for("update") : sorgu.for("share"))
    if (!m) throw new ConflictException({ message: KASA_YOK })
  }

  private async getir(id: string): Promise<Credential> {
    const [c] = await this.txHost.tx.select().from(credential).where(eq(credential.id, id))
    if (!c) throw new NotFoundException({ message: "Şifre kaydı bulunamadı" })
    return nullsuz(c)
  }

  private async bul(mukellefId: string, sistem: Sistem) {
    const [c] = await this.txHost.tx
      .select({ id: credential.id })
      .from(credential)
      .where(and(eq(credential.mukellefId, mukellefId), eq(credential.sistem, sistem)))
    return c
  }

  private async mukellefVarMi(id: string) {
    if (!id) return false
    const [m] = await this.txHost.tx
      .select({ id: mukellef.id })
      .from(mukellef)
      .where(eq(mukellef.id, id))
    return Boolean(m)
  }

  private async sonErisim(id: string) {
    return (await this.sonErisimler([id])).get(id) ?? null
  }

  /** Her kaydın son erişimi (görüntüleme / kopyalama / tebligata aktarım) ve yapanın adı */
  private async sonErisimler(ids: string[]): Promise<Map<string, SonErisim>> {
    if (!ids.length) return new Map()
    const satirlar = await this.txHost.tx
      .selectDistinctOn([aktivite.hedefId], {
        hedefId: aktivite.hedefId,
        eylem: aktivite.eylem,
        zaman: aktivite.zaman,
        ad: personel.ad,
        soyad: personel.soyad,
      })
      .from(aktivite)
      .leftJoin(personel, eq(personel.id, aktivite.aktorId))
      .where(and(inArray(aktivite.hedefId, ids), inArray(aktivite.eylem, SON_ERISIM_EYLEMLERI)))
      .orderBy(aktivite.hedefId, desc(aktivite.zaman), desc(aktivite.id))
    return new Map(
      satirlar.map((s) => [
        s.hedefId!,
        {
          eylem: s.eylem,
          zaman: s.zaman,
          aktorAdi: s.ad ? `${s.ad} ${s.soyad}` : "Bilinmiyor",
        },
      ])
    )
  }
}
