import { Algorithm, hash, verify } from "@node-rs/argon2"
import { Injectable } from "@nestjs/common"

/** OWASP önerisi (argon2id, m=19 MiB, t=2, p=1) */
const AYAR = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

/** Personel giriş şifreleri (argon2id). */
@Injectable()
export class SifreService {
  /** Kullanıcı yokken de aynı sürede yanıt vermek için doğrulanan sahte özet */
  private sahte: Promise<string> | null = null

  ozetle(sifre: string): Promise<string> {
    return hash(sifre, AYAR)
  }

  /** Özet yoksa (bilinmeyen kullanıcı) sahte özetle doğrulanır ve `false` döner. */
  async dogrula(ozet: string | null | undefined, sifre: string): Promise<boolean> {
    if (!ozet) {
      this.sahte ??= hash("sahte-sifre-zamanlama", AYAR)
      await verify(await this.sahte, sifre || "-")
      return false
    }
    if (!sifre) return false
    try {
      return await verify(ozet, sifre)
    } catch {
      return false
    }
  }
}
