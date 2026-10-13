import { z } from "zod"

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")

/** 32 baytlık anahtar (base64). `openssl rand -base64 32` ile üretilir. */
const anahtar32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "base64 kodlu 32 bayt olmalı (openssl rand -base64 32)",
  })

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /** Uygulamanın dışarıdan görünen kök adresi (portal bağlantıları, CSRF Origin kontrolü) */
    APP_URL: z.url().default("http://localhost:5173"),

    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(3).default("prime-ofis"),

    /** Üçüncü taraf gizli değerlerini (SecretBox) şifreleyen anahtar */
    SECRET_KEY: anahtar32.optional(),
    /** Rotasyon sırasında eski anahtar (`cli gizli:dondur` bitince kaldırılır) */
    SECRET_KEY_ESKI: anahtar32.optional(),
    SESSION_TTL_SAAT: z.coerce.number().int().min(1).max(24 * 30).default(12),
    /** IP + e-posta başına 15 dakikadaki hatalı giriş sınırı */
    GIRIS_DENEME_SINIRI: z.coerce.number().int().min(1).default(5),
    /** Müşteri portalında IP + token başına dakikadaki istek sınırı (yazma uçları ayrıca) */
    PORTAL_OKUMA_SINIRI: z.coerce.number().int().min(1).default(60),
    PORTAL_YAZMA_SINIRI: z.coerce.number().int().min(1).default(20),

    /** Bu süreç pg-boss işlerini (cron + kuyruk) çalıştırır mı */
    JOB_WORKERS: bool.default(true),
    /** `POST /api/dev/reset` gibi geliştirici uçları (yalnızca geliştirme / demo) */
    DEV_ARACLARI: bool.default(false),

    /** Dış kanal sağlayıcısı; verilmezse production'da `gercek`, diğerlerinde `mock` */
    KANAL_ADAPTER: z.enum(["mock", "gercek"]).optional(),
    /** Meta uygulama gizli anahtarı (webhook `X-Hub-Signature-256` doğrulaması) */
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    /** Meta webhook abonelik doğrulaması (`hub.verify_token`) */
    WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
    /** e-Belge entegratörü; Luca uygulaması doküman gelene kadar iskelet */
    ENTEGRATOR: z.enum(["mock", "luca"]).default("mock"),

    CLAUDE_API_KEY: z.string().optional(),
    CLAUDE_MODEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.SECRET_KEY)
        ctx.addIssue({
          code: "custom",
          path: ["SECRET_KEY"],
          message: "production ortamında zorunlu",
        })
      if (env.DEV_ARACLARI)
        ctx.addIssue({
          code: "custom",
          path: ["DEV_ARACLARI"],
          message: "production ortamında açılamaz",
        })
    }
  })

export type Env = z.infer<typeof envSchema>

/** Ortam değişkenlerini doğrular; hata varsa tüm sorunları tek mesajda listeler. */
export function envOku(kaynak: NodeJS.ProcessEnv = process.env): Env {
  const sonuc = envSchema.safeParse(kaynak)
  if (!sonuc.success) {
    const satirlar = sonuc.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(kök)"}: ${i.message}`
    )
    throw new Error(`Geçersiz ortam değişkenleri:\n${satirlar.join("\n")}`)
  }
  return sonuc.data
}
