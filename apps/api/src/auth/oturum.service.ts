import { createHash, randomBytes } from "node:crypto"

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { and, eq, gt, lt, ne } from "drizzle-orm"
import type { FastifyReply } from "fastify"

import type { Personel } from "@prime/shared/types/domain"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"
import { Saat } from "../core/saat.js"
import { DB, type Veritabani } from "../db/db.module.js"
import { oturum, personel } from "../db/schema/index.js"
import { IsKuyrugu } from "../jobs/jobs.module.js"

export const OTURUM_COOKIE = "sid"
/** Kayan süre en fazla bu aralıkla yazılır (her istekte UPDATE olmasın) */
const YENILEME_MS = 60_000

const ozet = (ham: string) => createHash("sha256").update(ham).digest("base64url")

/**
 * Sunucu tarafı oturumlar: cookie'de 32 baytlık rastgele opak id, veritabanında yalnızca
 * SHA-256 özeti. Süre kayar: her istekte `bitis = şimdi + SESSION_TTL_SAAT`.
 */
@Injectable()
export class OturumService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Veritabani,
    @Inject(ENV) private readonly env: Env,
    private readonly saat: Saat,
    private readonly isler: IsKuyrugu
  ) {}

  onModuleInit() {
    this.isler.tanimla("oturum-temizligi", () => this.suresiDolanlariSil(), {
      cron: "17 * * * *",
    })
  }

  private get ttlMs() {
    return this.env.SESSION_TTL_SAAT * 3_600_000
  }

  async olustur(personelId: string, ip?: string, ua?: string): Promise<string> {
    const ham = randomBytes(32).toString("base64url")
    const simdi = this.saat.simdi()
    await this.db.insert(oturum).values({
      idHash: ozet(ham),
      personelId,
      olusturma: simdi.toISOString(),
      sonGorulme: simdi.toISOString(),
      bitis: new Date(simdi.getTime() + this.ttlMs).toISOString(),
      ip: ip ?? null,
      ua: ua?.slice(0, 300) ?? null,
    })
    return ham
  }

  /**
   * Geçerli oturumun personeli; süresi dolmuş / pasif personel → `null`.
   * `yenilendi`: süre uzatıldı, cookie de yenilenmeli.
   */
  async dogrula(
    ham: string
  ): Promise<{ personel: Personel; yenilendi: boolean } | null> {
    const simdi = this.saat.simdi()
    const [satir] = await this.db
      .select({ oturum, personel })
      .from(oturum)
      .innerJoin(personel, eq(personel.id, oturum.personelId))
      .where(and(eq(oturum.idHash, ozet(ham)), gt(oturum.bitis, simdi.toISOString())))
    if (!satir || !satir.personel.aktif) return null

    const yenilendi =
      simdi.getTime() - new Date(satir.oturum.sonGorulme).getTime() >= YENILEME_MS
    if (yenilendi) {
      await this.db
        .update(oturum)
        .set({
          sonGorulme: simdi.toISOString(),
          bitis: new Date(simdi.getTime() + this.ttlMs).toISOString(),
        })
        .where(eq(oturum.idHash, satir.oturum.idHash))
    }
    return { personel: satir.personel, yenilendi }
  }

  async sil(ham: string) {
    await this.db.delete(oturum).where(eq(oturum.idHash, ozet(ham)))
  }

  /** Şifre değişimi, pasife alma, silme: personelin tüm oturumları (isteğe bağlı biri hariç) */
  async personelinOturumlariniSil(personelId: string, haricHam?: string) {
    await this.db
      .delete(oturum)
      .where(
        haricHam
          ? and(eq(oturum.personelId, personelId), ne(oturum.idHash, ozet(haricHam)))
          : eq(oturum.personelId, personelId)
      )
  }

  async suresiDolanlariSil() {
    await this.db.delete(oturum).where(lt(oturum.bitis, this.saat.simdiIso()))
  }

  cookieYaz(reply: FastifyReply, ham: string) {
    void reply.setCookie(OTURUM_COOKIE, ham, {
      ...this.cookieAyari(),
      maxAge: this.env.SESSION_TTL_SAAT * 3600,
    })
  }

  cookieTemizle(reply: FastifyReply) {
    void reply.clearCookie(OTURUM_COOKIE, this.cookieAyari())
  }

  private cookieAyari() {
    return {
      path: "/api",
      httpOnly: true,
      sameSite: "lax" as const,
      // https arkasında (Caddy) Secure; yerel http geliştirmede tarayıcı Secure cookie'yi reddeder
      secure: this.env.APP_URL.startsWith("https:"),
    }
  }
}
