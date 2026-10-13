import { TransactionHost, Transactional } from "@nestjs-cls/transactional"
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { and, asc, count, eq, ne, sql } from "drizzle-orm"

import {
  personelBilgiSemasi,
  personelOlusturSemasi,
  personelSifreSemasi,
  yoneticiOnayiSemasi,
} from "@prime/shared/auth/schemas"
import type { PersonelBilgi } from "@prime/shared/types/api"
import type { Personel } from "@prime/shared/types/domain"

import { AktiviteService } from "../aktivite/aktivite.service.js"
import { OturumService } from "../auth/oturum.service.js"
import { SifreService } from "../auth/sifre.service.js"
import { newId } from "../core/id.js"
import { Saat } from "../core/saat.js"
import { zodDogrula } from "../core/zod.pipe.js"
import type { DrizzleTx } from "../db/db.module.js"
import { personel, personelKimlik } from "../db/schema/index.js"

/**
 * Personel silinmeden önce açık işini soran kontrol. Sorun varsa cümle parçası döner
 * (ör. "3 mükellefin sorumlusu"); modüller kaydeder (mükellef Faz 2, görev Faz 3).
 */
export type PersonelSilmeKontrolu = (personelId: string) => Promise<string | null>

const dogrula = <T>(sema: { safeParse: (v: unknown) => unknown }, body: unknown) =>
  zodDogrula(sema as never, body, 400, { yolOneki: false }) as T

const adSoyad = (p: Pick<Personel, "ad" | "soyad">) => `${p.ad} ${p.soyad}`

@Injectable()
export class PersonelService {
  private readonly silmeKontrolleri: PersonelSilmeKontrolu[] = []

  constructor(
    private readonly txHost: TransactionHost<DrizzleTx>,
    private readonly sifreler: SifreService,
    private readonly oturumlar: OturumService,
    private readonly aktiviteler: AktiviteService,
    private readonly saat: Saat
  ) {}

  silmeKontroluEkle(kontrol: PersonelSilmeKontrolu) {
    this.silmeKontrolleri.push(kontrol)
  }

  liste(): Promise<Personel[]> {
    return this.txHost.tx.select().from(personel).orderBy(asc(personel.id))
  }

  /**
   * Personel yönetimi: işlemi yapan yönetici her istekte kendi şifresini gönderir (oturum açık
   * bırakılmış bir ekrandan kullanıcı eklenip şifre değiştirilemesin). Gövde doğrulamasından önce.
   */
  async yoneticiDogrula(aktor: Personel, body: unknown) {
    const { yoneticiSifresi } = yoneticiOnayiSemasi.parse(body ?? {})
    const [kimlik] = await this.txHost.tx
      .select({ hash: personelKimlik.hash })
      .from(personelKimlik)
      .where(eq(personelKimlik.personelId, aktor.id))
    if (!(await this.sifreler.dogrula(kimlik?.hash, yoneticiSifresi))) {
      throw new ForbiddenException({ message: "Yönetici şifresi hatalı" })
    }
  }

  @Transactional()
  async olustur(aktor: Personel, body: unknown): Promise<Personel> {
    await this.yoneticiDogrula(aktor, body)
    const { sifre, ...bilgi } = dogrula<PersonelBilgi & { sifre: string }>(
      personelOlusturSemasi,
      body
    )
    await this.epostaBosMu(bilgi.eposta)

    const yeni: Personel = { id: newId("p"), ...bilgi }
    await this.txHost.tx.insert(personel).values(yeni)
    await this.sifreBelirle(yeni.id, sifre)
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "PERSONEL_EKLENDI", aciklama: adSoyad(yeni) },
      false
    )
    return yeni
  }

  @Transactional()
  async guncelle(aktor: Personel, id: string, body: unknown): Promise<Personel> {
    await this.yoneticiDogrula(aktor, body)
    const mevcut = await this.bul(id)
    const bilgi = dogrula<PersonelBilgi>(personelBilgiSemasi, body)
    await this.epostaBosMu(bilgi.eposta, mevcut.id)

    const yoneticiliktenCikiyor =
      mevcut.rol === "YONETICI" &&
      mevcut.aktif &&
      (bilgi.rol !== "YONETICI" || !bilgi.aktif)
    if (yoneticiliktenCikiyor && !(await this.aktifYoneticiKalir(mevcut.id))) {
      throw new ConflictException({ message: "Büroda en az bir aktif yönetici kalmalı" })
    }

    const [guncel] = await this.txHost.tx
      .update(personel)
      .set(bilgi)
      .where(eq(personel.id, mevcut.id))
      .returning()
    if (mevcut.aktif && !bilgi.aktif) {
      await this.oturumlar.personelinOturumlariniSil(mevcut.id)
    }
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "PERSONEL_GUNCELLENDI", aciklama: adSoyad(guncel!) },
      false
    )
    return guncel!
  }

  /** Yeni şifre: personelin diğer oturumları kapanır (kendi şifresini değiştiren yöneticinin bu oturumu hariç) */
  @Transactional()
  async sifreDegistir(aktor: Personel, id: string, body: unknown, aktorOturumu?: string) {
    await this.yoneticiDogrula(aktor, body)
    const p = await this.bul(id)
    const { sifre } = dogrula<{ sifre: string }>(personelSifreSemasi, body)
    await this.sifreBelirle(p.id, sifre)
    await this.oturumlar.personelinOturumlariniSil(
      p.id,
      p.id === aktor.id ? aktorOturumu : undefined
    )
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "PERSONEL_SIFRESI_DEGISTI", aciklama: adSoyad(p) },
      false
    )
  }

  @Transactional()
  async sil(aktor: Personel, id: string, body: unknown) {
    await this.yoneticiDogrula(aktor, body)
    const p = await this.bul(id)
    if (p.id === aktor.id) {
      throw new ConflictException({ message: "Kendi hesabınızı silemezsiniz" })
    }
    if (p.rol === "YONETICI" && p.aktif && !(await this.aktifYoneticiKalir(p.id))) {
      throw new ConflictException({ message: "Büroda en az bir aktif yönetici kalmalı" })
    }

    // Açık iş bırakan personel silinmez; önce devredilmeli (veya pasife alınmalı)
    const parcalar: string[] = []
    for (const kontrol of this.silmeKontrolleri) {
      const parca = await kontrol(p.id)
      if (parca) parcalar.push(parca)
    }
    if (parcalar.length) {
      throw new ConflictException({
        message: `${adSoyad(p)} ${parcalar.join(" ve ")}. Önce devredin veya personeli pasife alın.`,
      })
    }

    // Kimlik ve oturumlar FK cascade ile silinir
    await this.txHost.tx.delete(personel).where(eq(personel.id, p.id))
    await this.aktiviteler.log(
      { aktorId: aktor.id, eylem: "PERSONEL_SILINDI", aciklama: adSoyad(p) },
      false
    )
  }

  async sifreBelirle(personelId: string, sifre: string) {
    const hash = await this.sifreler.ozetle(sifre)
    const guncelleme = this.saat.simdiIso()
    await this.txHost.tx
      .insert(personelKimlik)
      .values({ personelId, hash, guncelleme })
      .onConflictDoUpdate({ target: personelKimlik.personelId, set: { hash, guncelleme } })
  }

  private async bul(id: string): Promise<Personel> {
    const [p] = await this.txHost.tx.select().from(personel).where(eq(personel.id, id))
    if (!p) throw new NotFoundException({ message: "Personel bulunamadı" })
    return p
  }

  private async epostaBosMu(eposta: string, haricId?: string) {
    const kosul = eq(sql`lower(${personel.eposta})`, eposta.toLowerCase())
    const [cakisan] = await this.txHost.tx
      .select({ id: personel.id })
      .from(personel)
      .where(haricId ? and(kosul, ne(personel.id, haricId)) : kosul)
    if (cakisan) {
      throw new ConflictException({ message: "Bu e-posta başka bir personelde kayıtlı" })
    }
  }

  /** Değişiklik sonrası en az bir aktif yönetici kalmalı; yoksa büro yönetilemez hale gelir. */
  private async aktifYoneticiKalir(haricId: string) {
    const [sonuc] = await this.txHost.tx
      .select({ n: count() })
      .from(personel)
      .where(
        and(ne(personel.id, haricId), eq(personel.aktif, true), eq(personel.rol, "YONETICI"))
      )
    return (sonuc?.n ?? 0) > 0
  }
}
