import { TransactionHost } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common"
import { addMinutes } from "date-fns"
import { eq } from "drizzle-orm"

import { lucaDogrulamaHatasi, lucaHesapHatasi } from "@prime/shared/e-belge/girdi"
import {
  lucaOturumDustuMu,
  type LucaGirisSonucu,
  type LucaPortalKimlik,
  type LucaPortalOturum,
} from "@prime/shared/e-belge/luca-portal"
import type {
  LucaDogrulamaView,
  LucaFirma,
  LucaHesapRequest,
  LucaHesapView,
} from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../../aktivite/aktivite.service.js"
import { ENV } from "../../config/config.module.js"
import type { Env } from "../../config/env.js"
import { nullsuz } from "../../core/nullsuz.js"
import { Saat } from "../../core/saat.js"
import { SecretBox, sonDort } from "../../core/secret-box.js"
import type { DrizzleTx } from "../../db/db.module.js"
import { entegratorBaglanti, lucaHesap, mukellef } from "../../db/schema/index.js"
import { LucaPortal } from "./luca-portal.js"

const HESAP_ID = "buro"
/** Doğrulama görselinin geçerlilik süresi */
const DOGRULAMA_DAKIKA = 5
const HESAP_YOK = "Luca hesabı tanımlı değil (Ayarlar → Luca hesabı)"

type HesapSatiri = typeof lucaHesap.$inferSelect

/** Doğrulama kodu bekleniyor: istemci `dogrulama: true` görünce kod diyaloğunu açar */
export class LucaDogrulamaGerekli extends ConflictException {
  constructor() {
    super({ message: "Luca doğrulama kodu bekleniyor", dogrulama: true })
  }
}

/**
 * Büronun Luca portal oturumu. Oturum (portal çerezleri) yalnızca bu süreçte bellekte tutulur;
 * düşerse bir kez yeniden giriş denenir. Doğrulama istenirse robot durur, kayıt açılır ve personel
 * kodu `POST /luca-dogrulama` ile girer. `HATA` durumunda şifre güncellenene kadar giriş denenmez
 * (hesap kilitlenmesin). Portal çağrıları sıralıdır ve aralarında `LUCA_ISTEK_ARALIGI_MS` beklenir.
 */
@Injectable()
export class LucaOturumService {
  private oturum: LucaPortalOturum | null = null
  private kuyruk: Promise<unknown> = Promise.resolve()
  private sonIstek = 0

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly portal: LucaPortal,
    private readonly kutu: SecretBox,
    private readonly aktiviteler: AktiviteService,
    private readonly saat: Saat,
    @Inject(ENV) private readonly env: Env
  ) {}

  // --- Hesap -------------------------------------------------------------------------

  async hesap(): Promise<LucaHesapView> {
    const h = await this.satir()
    if (!h) throw new NotFoundException({ message: HESAP_YOK })
    return hesapView(h)
  }

  /** Yeni bilgilerle giriş denenir; sonuç ne olursa olsun kayıt yazılır */
  async kaydet(aktor: Personel, body: LucaHesapRequest): Promise<LucaHesapView> {
    const mevcut = await this.satir()
    const hata = lucaHesapHatasi(body, mevcut?.kullanici)
    if (hata) throw new BadRequestException({ message: hata })
    const kullanici = body.kullanici.trim()
    const sifre = body.sifre || this.kutu.coz(mevcut!.sifre)
    this.oturum = null

    const sonuc = await this.sirala(() => this.portal.giris({ kullanici, sifre }))
    const simdi = this.saat.simdiIso()
    const satir: HesapSatiri = {
      id: HESAP_ID,
      kullanici,
      sifre: this.kutu.sifrele(sifre),
      sifreIpucu: sonDort(sifre),
      ...this.girisAlanlari(sonuc),
      kontorBakiye: mevcut?.kontorBakiye ?? null,
      kontorTarihi: mevcut?.kontorTarihi ?? null,
      guncelleyenId: aktor.id,
      guncellemeTarihi: simdi,
    }
    await this.txHost.withTransaction(async () => {
      const { id: _id, ...guncelleme } = satir
      await this.txHost.tx
        .insert(lucaHesap)
        .values(satir)
        .onConflictDoUpdate({ target: lucaHesap.id, set: guncelleme })
      await this.aktiviteler.log(
        { aktorId: aktor.id, eylem: "LUCA_HESABI_GUNCELLENDI", aciklama: kullanici },
        false
      )
    })
    if (sonuc.durum === "HATA") throw new UnprocessableEntityException({ message: sonuc.hataMesaji })
    if (sonuc.durum === "DOGRULAMA") throw new LucaDogrulamaGerekli()
    return hesapView(satir)
  }

  async kaldir(aktor: Personel) {
    await this.txHost.withTransaction(async () => {
      const silinen = await this.txHost.tx
        .delete(lucaHesap)
        .where(eq(lucaHesap.id, HESAP_ID))
        .returning({ id: lucaHesap.id })
      if (!silinen.length) throw new NotFoundException({ message: HESAP_YOK })
      await this.aktiviteler.log({ aktorId: aktor.id, eylem: "LUCA_HESABI_KALDIRILDI" }, false)
    })
    this.oturum = null
  }

  /** Portalın firma listesi (firma kartıyla) */
  firmalarHam() {
    return this.calistir((o) => this.portal.firmalar(o))
  }

  /**
   * Luca kullanıcısının firmaları: eşlenmiş mükellef (`mukellefId`) ya da VKN/TCKN'si kayıtlı
   * mükellef (`eslesenMukellefId`, aktarımda ona eşlenir) işaretlenir.
   */
  async firmalar(): Promise<LucaFirma[]> {
    const firmalar = await this.firmalarHam()
    const [eslemeler, mukellefler] = await Promise.all([
      this.txHost.tx
        .select({ mukellefId: entegratorBaglanti.mukellefId, firmaId: entegratorBaglanti.lucaFirmaId })
        .from(entegratorBaglanti),
      this.txHost.tx.select({ id: mukellef.id, vkn: mukellef.vkn, tckn: mukellef.tckn }).from(mukellef),
    ])
    const esleme = new Map(eslemeler.map((e) => [e.firmaId, e.mukellefId]))
    const kimlikler = new Map(
      mukellefler.flatMap((m) => [m.vkn, m.tckn].filter(Boolean).map((k) => [k!, m.id] as const))
    )
    return firmalar
      .map((f): LucaFirma => {
        const mukellefId = esleme.get(f.firmaId)
        const eslesen = !mukellefId && f.vknTckn ? kimlikler.get(f.vknTckn) : undefined
        return {
          firmaId: f.firmaId,
          unvan: f.unvan,
          ...(f.vknTckn ? { vknTckn: f.vknTckn } : {}),
          ...(f.vergiDairesi ? { vergiDairesi: f.vergiDairesi } : {}),
          eFatura: f.eFatura,
          eArsiv: f.eArsiv,
          eDefter: f.eDefter,
          ...(mukellefId ? { mukellefId } : {}),
          ...(eslesen ? { eslesenMukellefId: eslesen } : {}),
        }
      })
      .sort((a, b) => a.unvan.localeCompare(b.unvan, "tr-TR"))
  }

  async firma(firmaId: string) {
    return (await this.firmalarHam()).find((f) => f.firmaId === firmaId)
  }

  async kontorYaz(kalan: number) {
    await this.txHost.tx
      .update(lucaHesap)
      .set({ kontorBakiye: kalan, kontorTarihi: this.saat.simdiIso() })
      .where(eq(lucaHesap.id, HESAP_ID))
  }

  // --- Doğrulama ---------------------------------------------------------------------

  async dogrulama(): Promise<LucaDogrulamaView> {
    const h = await this.satir()
    if (!h?.dogrulamaGorsel || !h.dogrulamaSonGecerlilik)
      throw new NotFoundException({ message: "Bekleyen Luca doğrulaması yok" })
    return { gorselDataUrl: h.dogrulamaGorsel, sonGecerlilik: h.dogrulamaSonGecerlilik }
  }

  /** Yanlış kod → 422 + yeni görsel; süresi dolmuşsa 410 (yenile) */
  async dogrula(body: unknown): Promise<LucaHesapView> {
    const hata = lucaDogrulamaHatasi(body)
    if (hata) throw new BadRequestException({ message: hata })
    const h = await this.satir()
    if (!h?.dogrulamaOturumId || !h.dogrulamaSonGecerlilik)
      throw new NotFoundException({ message: "Bekleyen Luca doğrulaması yok" })
    if (h.dogrulamaSonGecerlilik < this.saat.simdiIso())
      throw new GoneException({ message: "Doğrulama görselinin süresi doldu, yenileyin" })

    const kod = (body as { kod: string }).kod.trim()
    const sonuc = await this.sirala(() =>
      this.portal.giris(this.kimlik(h), { oturumId: h.dogrulamaOturumId!, kod })
    )
    const guncel = { ...h, ...this.girisAlanlari(sonuc) }
    await this.txHost.tx.update(lucaHesap).set(guncel).where(eq(lucaHesap.id, HESAP_ID))
    if (sonuc.durum === "DOGRULAMA")
      throw new UnprocessableEntityException({ message: "Doğrulama kodu hatalı", dogrulama: true })
    if (sonuc.durum === "HATA") throw new UnprocessableEntityException({ message: sonuc.hataMesaji })
    return hesapView(guncel)
  }

  async dogrulamaYenile(): Promise<LucaDogrulamaView> {
    const h = await this.satir()
    if (!h) throw new NotFoundException({ message: HESAP_YOK })
    if (h.durum !== "DOGRULAMA")
      throw new ConflictException({ message: "Bekleyen Luca doğrulaması yok" })
    const yeni = await this.sirala(() => this.portal.dogrulamaYenile(this.kimlik(h)))
    const alanlar = this.dogrulamaAlanlari(yeni)
    await this.txHost.tx.update(lucaHesap).set(alanlar).where(eq(lucaHesap.id, HESAP_ID))
    return { gorselDataUrl: yeni.gorselDataUrl, sonGecerlilik: alanlar.dogrulamaSonGecerlilik }
  }

  // --- Portal çağrıları --------------------------------------------------------------

  /**
   * Açık oturumla portal çağrısı. Oturum yoksa giriş denenir; doğrulama gerekirse
   * `LucaDogrulamaGerekli`. Oturum düşmüşse bir kez yeniden giriş yapılır.
   */
  async calistir<T>(is: (oturum: LucaPortalOturum) => Promise<T>): Promise<T> {
    for (let deneme = 0; ; deneme++) {
      const oturum = await this.oturumAl()
      try {
        return await this.sirala(() => is(oturum))
      } catch (e) {
        if (!lucaOturumDustuMu(e) || deneme > 0) throw e
        if (this.oturum === oturum) this.oturum = null
      }
    }
  }

  private async oturumAl(): Promise<LucaPortalOturum> {
    // Kayıt her seferinde okunur: hesap silinmiş ya da başka süreçte değişmişse bellekteki
    // oturum kullanılmaz
    const h = await this.satir()
    if (h?.durum !== "BAGLI") this.oturum = null
    if (this.oturum) return this.oturum
    if (!h) throw new ConflictException({ message: HESAP_YOK })
    if (h.durum === "HATA")
      throw new ConflictException({
        message: `${h.hataMesaji ?? "Luca girişi başarısız"}. Şifreyi Ayarlar → Luca hesabı'ndan güncelleyin`,
      })
    if (h.durum === "DOGRULAMA" && h.dogrulamaSonGecerlilik && h.dogrulamaSonGecerlilik >= this.saat.simdiIso())
      throw new LucaDogrulamaGerekli()

    const sonuc = await this.sirala(() => this.portal.giris(this.kimlik(h)))
    await this.txHost.tx
      .update(lucaHesap)
      .set(this.girisAlanlari(sonuc))
      .where(eq(lucaHesap.id, HESAP_ID))
    if (sonuc.durum === "DOGRULAMA") throw new LucaDogrulamaGerekli()
    if (sonuc.durum === "HATA") throw new ConflictException({ message: sonuc.hataMesaji })
    return this.oturum!
  }

  /** Giriş sonucunu kayda çevirir; `TAMAM` oturumu belleğe alır */
  private girisAlanlari(sonuc: LucaGirisSonucu) {
    const bos = { dogrulamaOturumId: null, dogrulamaGorsel: null, dogrulamaSonGecerlilik: null }
    switch (sonuc.durum) {
      case "TAMAM":
        this.oturum = sonuc.oturum
        return { durum: "BAGLI" as const, hataMesaji: null, sonGiris: this.saat.simdiIso(), ...bos }
      case "HATA":
        this.oturum = null
        return { durum: "HATA" as const, hataMesaji: sonuc.hataMesaji, sonGiris: null, ...bos }
      case "DOGRULAMA":
        this.oturum = null
        return {
          durum: "DOGRULAMA" as const,
          hataMesaji: null,
          sonGiris: null,
          ...this.dogrulamaAlanlari(sonuc),
        }
    }
  }

  private dogrulamaAlanlari(d: { oturumId: string; gorselDataUrl: string }) {
    return {
      dogrulamaOturumId: d.oturumId,
      dogrulamaGorsel: d.gorselDataUrl,
      dogrulamaSonGecerlilik: addMinutes(this.saat.simdi(), DOGRULAMA_DAKIKA).toISOString(),
    }
  }

  /** Portal istekleri tek sıra; ardışık iki istek arasında en az `LUCA_ISTEK_ARALIGI_MS` */
  private sirala<T>(is: () => Promise<T>): Promise<T> {
    const aralik = this.env.LUCA_PORTAL === "mock" ? 0 : this.env.LUCA_ISTEK_ARALIGI_MS
    const sonraki = this.kuyruk.then(async () => {
      const bekle = this.sonIstek + aralik - Date.now()
      if (bekle > 0) await new Promise((r) => setTimeout(r, bekle))
      try {
        return await is()
      } finally {
        this.sonIstek = Date.now()
      }
    })
    this.kuyruk = sonraki.catch(() => undefined)
    return sonraki
  }

  private kimlik(h: HesapSatiri): LucaPortalKimlik {
    return { kullanici: h.kullanici, sifre: this.kutu.coz(h.sifre) }
  }

  private async satir(): Promise<HesapSatiri | undefined> {
    const [h] = await this.txHost.tx.select().from(lucaHesap).where(eq(lucaHesap.id, HESAP_ID))
    return h
  }
}

function hesapView({
  id: _id,
  sifre: _s,
  dogrulamaOturumId: _o,
  dogrulamaGorsel: _g,
  dogrulamaSonGecerlilik: _d,
  ...h
}: HesapSatiri): LucaHesapView {
  return nullsuz(h) as LucaHesapView
}
