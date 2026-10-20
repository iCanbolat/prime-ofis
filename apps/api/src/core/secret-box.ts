import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { Inject, Injectable } from "@nestjs/common"

import { ENV } from "../config/config.module.js"
import type { Env } from "../config/env.js"

const SURUM = "v1:"
const IV = 12
const ETIKET = 16

/**
 * Üçüncü taraf gizli değerleri (Luca anahtarı, İVD/SGK şifreleri, SMTP, Telegram, WhatsApp)
 * veritabanında AES-256-GCM ile şifreli tutulur: `v1:` + base64(iv | etiket | şifreli).
 * Anahtar `SECRET_KEY`; rotasyonda eski anahtar `SECRET_KEY_ESKI` ile çözülür.
 */
@Injectable()
export class SecretBox {
  private readonly anahtar: Buffer | null
  private readonly eskiAnahtar: Buffer | null

  constructor(@Inject(ENV) env: Pick<Env, "SECRET_KEY" | "SECRET_KEY_ESKI">) {
    this.anahtar = env.SECRET_KEY ? Buffer.from(env.SECRET_KEY, "base64") : null
    this.eskiAnahtar = env.SECRET_KEY_ESKI
      ? Buffer.from(env.SECRET_KEY_ESKI, "base64")
      : null
  }

  get hazir() {
    return this.anahtar !== null
  }

  sifrele(acik: string): string {
    const anahtar = this.gerekliAnahtar()
    const iv = randomBytes(IV)
    const cipher = createCipheriv("aes-256-gcm", anahtar, iv)
    const sifreli = Buffer.concat([cipher.update(acik, "utf8"), cipher.final()])
    return SURUM + Buffer.concat([iv, cipher.getAuthTag(), sifreli]).toString("base64")
  }

  /** Güncel anahtarla çözer; olmazsa (rotasyon sürüyor) eski anahtarı dener. */
  coz(kapali: string): string {
    const anahtarlar = [this.gerekliAnahtar(), this.eskiAnahtar].filter(
      (a): a is Buffer => a !== null
    )
    for (const anahtar of anahtarlar) {
      const acik = SecretBox.cozAnahtarla(kapali, anahtar)
      if (acik !== null) return acik
    }
    throw new Error("Gizli değer çözülemedi (anahtar yanlış ya da veri bozuk)")
  }

  /** Güncel anahtarla şifrelenmiş mi (rotasyon komutu atlar) */
  guncelMi(kapali: string) {
    return SecretBox.cozAnahtarla(kapali, this.gerekliAnahtar()) !== null
  }

  /** Arayüzde gösterilecek ipucu: son 4 karakter (kısa değerlerde hiçbir şey) */
  static ipucu(acik: string): string {
    return acik.length >= 8 ? `••••${acik.slice(-4)}` : "••••"
  }

  private static cozAnahtarla(kapali: string, anahtar: Buffer): string | null {
    if (!kapali.startsWith(SURUM)) return null
    const veri = Buffer.from(kapali.slice(SURUM.length), "base64")
    if (veri.length < IV + ETIKET) return null
    try {
      const decipher = createDecipheriv("aes-256-gcm", anahtar, veri.subarray(0, IV))
      decipher.setAuthTag(veri.subarray(IV, IV + ETIKET))
      return Buffer.concat([
        decipher.update(veri.subarray(IV + ETIKET)),
        decipher.final(),
      ]).toString("utf8")
    } catch {
      return null
    }
  }

  private gerekliAnahtar(): Buffer {
    if (!this.anahtar) {
      throw new Error("SECRET_KEY tanımlı değil (openssl rand -base64 32)")
    }
    return this.anahtar
  }
}

/**
 * Şifreli kolon kaydı: `gizli:dondur` komutu bu listeyi dolaşıp her değeri yeni anahtarla
 * yeniden şifreler. Gizli değer tutan tablo eklendikçe (Faz 5 Luca, Faz 6 kanallar …) eklenir.
 */
export interface GizliKolon {
  tablo: string
  idKolonu: string
  kolon: string
}

export const GIZLI_KOLONLAR: GizliKolon[] = [
  { tablo: "kanal_ayari", idKolonu: "tip", kolon: "gizli" },
  { tablo: "luca_hesap", idKolonu: "id", kolon: "sifre" },
  { tablo: "tebligat_erisim", idKolonu: "id", kolon: "sifre_enc" },
]

/** Kanal / entegratör ayarlarında gösterilen ipucu: düz son 4 karakter (client `••••` ekler) */
export const sonDort = (acik: string) => acik.slice(-4)
