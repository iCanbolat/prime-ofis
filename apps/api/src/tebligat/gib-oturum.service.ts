import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common"
import { addMinutes } from "date-fns"
import { and, asc, eq } from "drizzle-orm"

import type { KamuKimlik, KamuOturum } from "@prime/shared/borc/kamu-adapter"
import { DOGRULAMA_GECERLILIK_DK, KAMU_KURUM_ETIKET } from "@prime/shared/borc/sabitler"
import type {
  KamuDogrulamaCozResponse,
  KamuDogrulamaView,
} from "@prime/shared/types/api"
import type {
  KamuAdim,
  KamuDogrulama,
  KamuKurum,
  Personel,
} from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { newId } from "../core/id.js"
import { Saat } from "../core/saat.js"
import { SecretBox } from "../core/secret-box.js"
import type { DrizzleTx } from "../db/db.module.js"
import { kamuDogrulama, mukellef, tebligatErisim } from "../db/schema/index.js"
import { SISTEM_AKTOR } from "../tahsilat/ucret-borclari.js"
import { KamuGiris } from "./gib-adapter.js"

type MukellefSatiri = typeof mukellef.$inferSelect
type DogrulamaSatiri = typeof kamuDogrulama.$inferSelect

export type OturumSonucu =
  | { oturum: KamuOturum }
  | { dogrulama: KamuDogrulama }
  | { hata: string }

/** Açık oturumla çalışan adım (e-Tebligat taraması; Faz 11'de levha, borç); özet satırı döner */
export type KamuAdimIsleyici = (
  oturum: KamuOturum,
  m: MukellefSatiri,
  aktorId: string
) => Promise<string>

const dogrulamaSatirindan = (d: DogrulamaSatiri): KamuDogrulama => d

/**
 * Mükellef adına kamu girişi (mock `kamu-oturum.ts`). Şu an yalnızca GİB İnteraktif VD
 * (e-Tebligat erişimiyle); SGK erişimi Faz 11'de eklenir.
 *
 * **Doğrulama ekranı (CAPTCHA) otomatik geçilmez:** giriş `DOGRULAMA` dönerse `kamu_dogrulama`
 * kaydı açılır, istenen adımlar kayda yazılır; personel kodu girene kadar o mükellef + kurum için
 * yeniden giriş denenmez. Girişi başarısız erişim şifre güncellenene kadar denenmez. Kuruma
 * yapılan çağrılar transaction dışındadır.
 */
@Injectable()
export class GibOturumService {
  private readonly adimlar = new Map<KamuAdim, KamuAdimIsleyici>()

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly giris: KamuGiris,
    private readonly kutu: SecretBox,
    private readonly aktiviteler: AktiviteService,
    private readonly saat: Saat
  ) {}

  adimKaydet(adim: KamuAdim, isleyici: KamuAdimIsleyici) {
    this.adimlar.set(adim, isleyici)
  }

  /**
   * Mükellef adına kuruma giriş yapar. Bekleyen doğrulama varsa yeniden denenmez; istenen adımlar
   * o kayda eklenir. Doğrulama ekranı çıkarsa kayıt açılır.
   */
  async oturumAc(
    m: MukellefSatiri,
    kurum: KamuKurum,
    adimlar: KamuAdim[],
    aktorId: string
  ): Promise<OturumSonucu> {
    const e = await this.erisim(m.id, kurum)
    if (!e)
      return {
        hata:
          kurum === "GIB"
            ? "GİB erişimi tanımlı değil (e-Tebligat erişimi kullanılır)"
            : "SGK erişimi tanımlı değil",
      }
    if (e.durum === "HATA")
      return { hata: e.hataMesaji ?? `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız` }

    const bekleyen = await this.adimEkle(m.id, kurum, adimlar)
    if (bekleyen) return { dogrulama: bekleyen }

    const sonuc = await this.giris.giris(e.kimlik)
    if (sonuc.durum === "HATA") {
      await this.erisimHatasi(m, kurum, sonuc.hataMesaji, aktorId)
      return { hata: sonuc.hataMesaji }
    }
    if (sonuc.durum === "DOGRULAMA")
      return {
        dogrulama: await this.dogrulamaAc(
          m,
          kurum,
          sonuc.oturumId,
          sonuc.gorselDataUrl,
          adimlar,
          aktorId
        ),
      }
    return { oturum: sonuc.oturum }
  }

  /** Doğrudan verilen kimlikle giriş (erişim kaydı öncesi doğrulama) */
  girisDene(kimlik: KamuKimlik) {
    return this.giris.giris(kimlik)
  }

  /** Giriş başarısız: erişim HATA'ya düşer, ilk düşüşte mükellef sorumlusuna bildirim gider */
  @Transactional()
  async erisimHatasi(m: MukellefSatiri, kurum: KamuKurum, hataMesaji: string, aktorId: string) {
    if (kurum !== "GIB") return
    const [e] = await this.txHost.tx
      .select({ id: tebligatErisim.id, durum: tebligatErisim.durum })
      .from(tebligatErisim)
      .where(eq(tebligatErisim.mukellefId, m.id))
      .for("update")
    if (!e) return
    await this.txHost.tx
      .update(tebligatErisim)
      .set({ durum: "HATA", hataMesaji })
      .where(eq(tebligatErisim.id, e.id))
    if (e.durum !== "HATA")
      await this.aktiviteler.log(
        {
          aktorId,
          eylem: "TEBLIGAT_ERISIM_HATASI",
          hedefTip: "MUKELLEF",
          hedefId: m.id,
          mukellefId: m.id,
          aciklama: `${m.unvan} · ${hataMesaji}`,
        },
        {
          alicilar: [m.sorumluPersonelId],
          baslik: `${KAMU_KURUM_ETIKET[kurum]} girişi başarısız`,
        }
      )
  }

  /** Mükellefin bekleyen doğrulaması (yoksa null) */
  async bekleyen(mukellefId: string, kurum: KamuKurum): Promise<KamuDogrulama | null> {
    const [d] = await this.txHost.tx
      .select()
      .from(kamuDogrulama)
      .where(and(eq(kamuDogrulama.mukellefId, mukellefId), eq(kamuDogrulama.kurum, kurum)))
    return d ? dogrulamaSatirindan(d) : null
  }

  /** Kimlik değişti ya da erişim kaldırıldı: bekleyen doğrulama oturumu geçersizdir */
  async dogrulamaKaldir(mukellefId: string, kurum: KamuKurum) {
    await this.txHost.tx
      .delete(kamuDogrulama)
      .where(and(eq(kamuDogrulama.mukellefId, mukellefId), eq(kamuDogrulama.kurum, kurum)))
  }

  /** Görsel ve oturum kimliği dışarı çıkmaz: yanıtta `oturumId` yok */
  dogrulamaView(d: KamuDogrulama, mukellefUnvan: string): KamuDogrulamaView {
    const { oturumId: _gizli, ...geri } = d
    return {
      ...geri,
      mukellefUnvan,
      suresiDoldu: new Date(d.sonGecerlilik) < this.saat.simdi(),
    }
  }

  @Transactional()
  async dogrulamaAc(
    m: MukellefSatiri,
    kurum: KamuKurum,
    oturumId: string,
    gorselDataUrl: string,
    adimlar: KamuAdim[],
    aktorId: string
  ): Promise<KamuDogrulama> {
    const an = this.saat.simdi()
    const [eklenen] = await this.txHost.tx
      .insert(kamuDogrulama)
      .values({
        id: newId("kd"),
        mukellefId: m.id,
        kurum,
        oturumId,
        gorselDataUrl,
        sonGecerlilik: addMinutes(an, DOGRULAMA_GECERLILIK_DK).toISOString(),
        bekleyenAdimlar: [...new Set(adimlar)],
        olusturmaTarihi: an.toISOString(),
      })
      .onConflictDoNothing()
      .returning()
    // Eşzamanlı başka bir giriş kaydı açtıysa adımlar ona eklenir
    if (!eklenen) return (await this.adimEkle(m.id, kurum, adimlar))!
    await this.aktiviteler.log(
      {
        aktorId,
        eylem: "KAMU_DOGRULAMA_BEKLIYOR",
        hedefTip: "BORC",
        hedefId: eklenen.id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[kurum]}`,
      },
      // Personel kendisi tetiklediyse kodu zaten ekranda görür
      aktorId === SISTEM_AKTOR
        ? {
            alicilar: [m.sorumluPersonelId],
            baslik: `${KAMU_KURUM_ETIKET[kurum]} doğrulama kodu bekleniyor`,
          }
        : false
    )
    return dogrulamaSatirindan(eklenen)
  }

  // --- /kamu-dogrulama ---------------------------------------------------------------

  async liste(mukellefId?: string): Promise<KamuDogrulamaView[]> {
    const satirlar = await this.txHost.tx
      .select({ d: kamuDogrulama, unvan: mukellef.unvan })
      .from(kamuDogrulama)
      .innerJoin(mukellef, eq(mukellef.id, kamuDogrulama.mukellefId))
      .where(mukellefId ? eq(kamuDogrulama.mukellefId, mukellefId) : undefined)
      .orderBy(asc(kamuDogrulama.olusturmaTarihi))
    return satirlar.map(({ d, unvan }) => this.dogrulamaView(dogrulamaSatirindan(d), unvan))
  }

  /** Personelin girdiği kodla giriş; başarılıysa bekleyen adımlar aynı oturumla çalışır */
  async coz(aktor: Personel, id: string, body: unknown): Promise<KamuDogrulamaCozResponse> {
    const { d, m } = await this.dogrulamaBul(id)
    const kodHam = (body as { kod?: unknown } | null)?.kod
    const kod = typeof kodHam === "string" ? kodHam.trim() : ""
    if (!kod || kod.length > 12) throw new BadRequestException({ message: "Görseldeki kodu girin" })
    if (new Date(d.sonGecerlilik) < this.saat.simdi())
      throw new GoneException({ message: "Görselin süresi doldu; yeni görsel isteyin" })
    const e = await this.erisim(m.id, d.kurum)
    if (!e) {
      await this.sil(d.id)
      throw new ConflictException({ message: "Erişim kaldırılmış" })
    }

    const sonuc = await this.giris.giris(e.kimlik, { oturumId: d.oturumId, kod })
    if (sonuc.durum === "HATA") {
      await this.sil(d.id)
      await this.erisimHatasi(m, d.kurum, sonuc.hataMesaji, aktor.id)
      throw new ConflictException({ message: sonuc.hataMesaji })
    }
    if (sonuc.durum === "DOGRULAMA") {
      await this.txHost.tx
        .update(kamuDogrulama)
        .set({
          oturumId: sonuc.oturumId,
          gorselDataUrl: sonuc.gorselDataUrl,
          sonGecerlilik: addMinutes(this.saat.simdi(), DOGRULAMA_GECERLILIK_DK).toISOString(),
        })
        .where(eq(kamuDogrulama.id, d.id))
      throw new UnprocessableEntityException({
        message: "Kod hatalı; yeni görseldeki kodu girin",
      })
    }
    // Kayıt silinerek sahiplenilir: eşzamanlı ikinci çözüm adımları yeniden çalıştırmaz
    const silinen = await this.sil(d.id)
    if (!silinen)
      throw new NotFoundException({ message: "Doğrulama bulunamadı ya da zaten çözüldü" })

    const ozet: string[] = []
    for (const adim of new Set(silinen.bekleyenAdimlar)) {
      const isleyici = this.adimlar.get(adim)
      if (isleyici) ozet.push(await isleyici(sonuc.oturum, m, aktor.id))
    }
    await this.aktiviteler.log(
      {
        aktorId: aktor.id,
        eylem: "KAMU_DOGRULAMA_TAMAMLANDI",
        hedefTip: "BORC",
        hedefId: d.id,
        mukellefId: m.id,
        aciklama: `${m.unvan} · ${KAMU_KURUM_ETIKET[d.kurum]}`,
      },
      false
    )
    return { ozet }
  }

  async yenile(id: string): Promise<KamuDogrulamaView> {
    const { d, m } = await this.dogrulamaBul(id)
    const e = await this.erisim(m.id, d.kurum)
    if (!e) {
      await this.sil(d.id)
      throw new ConflictException({ message: "Erişim kaldırılmış" })
    }
    const yeni = await this.giris.dogrulamaYenile(e.kimlik)
    const [g] = await this.txHost.tx
      .update(kamuDogrulama)
      .set({
        ...yeni,
        sonGecerlilik: addMinutes(this.saat.simdi(), DOGRULAMA_GECERLILIK_DK).toISOString(),
      })
      .where(eq(kamuDogrulama.id, d.id))
      .returning()
    if (!g) throw new NotFoundException({ message: "Doğrulama bulunamadı ya da zaten çözüldü" })
    return this.dogrulamaView(dogrulamaSatirindan(g), m.unvan)
  }

  // --- Yardımcılar -------------------------------------------------------------------

  private async dogrulamaBul(id: string) {
    const [s] = await this.txHost.tx
      .select({ d: kamuDogrulama, m: mukellef })
      .from(kamuDogrulama)
      .innerJoin(mukellef, eq(mukellef.id, kamuDogrulama.mukellefId))
      .where(eq(kamuDogrulama.id, id))
    if (!s) throw new NotFoundException({ message: "Doğrulama bulunamadı ya da zaten çözüldü" })
    return { d: dogrulamaSatirindan(s.d), m: s.m }
  }

  private async sil(id: string) {
    const [d] = await this.txHost.tx
      .delete(kamuDogrulama)
      .where(eq(kamuDogrulama.id, id))
      .returning()
    return d
  }

  /** Bekleyen doğrulama varsa istenen adımları ona ekler ve döndürür */
  @Transactional()
  private async adimEkle(
    mukellefId: string,
    kurum: KamuKurum,
    adimlar: KamuAdim[]
  ): Promise<KamuDogrulama | null> {
    const [d] = await this.txHost.tx
      .select()
      .from(kamuDogrulama)
      .where(and(eq(kamuDogrulama.mukellefId, mukellefId), eq(kamuDogrulama.kurum, kurum)))
      .for("update")
    if (!d) return null
    const birlesik = [...new Set([...d.bekleyenAdimlar, ...adimlar])]
    if (birlesik.length === d.bekleyenAdimlar.length) return dogrulamaSatirindan(d)
    const [g] = await this.txHost.tx
      .update(kamuDogrulama)
      .set({ bekleyenAdimlar: birlesik })
      .where(eq(kamuDogrulama.id, d.id))
      .returning()
    return dogrulamaSatirindan(g!)
  }

  /** Erişim ve çözülmüş kimlik (şifre yalnızca burada açılır) */
  private async erisim(mukellefId: string, kurum: KamuKurum) {
    if (kurum !== "GIB") return null
    const [e] = await this.txHost.tx
      .select()
      .from(tebligatErisim)
      .where(eq(tebligatErisim.mukellefId, mukellefId))
    if (!e) return null
    const kimlik: KamuKimlik = {
      kurum: "GIB",
      kullaniciKodu: e.kullaniciKodu,
      sifre: this.kutu.coz(e.sifreEnc),
    }
    return { durum: e.durum, hataMesaji: e.hataMesaji, kimlik }
  }
}
