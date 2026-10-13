/**
 * Demo şifre kasası. Web Crypto asenkron olduğu için kasa senkron seed'e dahil edilmez;
 * ilk kasa isteğinde `ensureVault()` demo ana şifreyle meta + şifreli örnek kayıtları oluşturur.
 * DB sıfırlanınca kasa da boşalır ve bir sonraki istekte yeniden oluşur.
 */
import { Faker, base, en, tr } from "@faker-js/faker"

import {
  KDF_ITERATIONS,
  createVerifier,
  deriveKey,
  encryptJson,
  generateSalt,
} from "@/lib/crypto"
import { db } from "@/mocks/db"
import { DEFAULT_SEED, SEED_REF_DATE } from "@prime/mock-data/seed"
import type { CredentialSecret, Mukellef, Sistem } from "@prime/shared/types/domain"

/** Demo ortamında kasa kilidini açan ana şifre (giriş ekranında da gösterilir). */
export const DEMO_KASA_SIFRESI = "demo1234"

export interface PlainCredentialSeed extends CredentialSecret {
  mukellefId: string
  sistem: Sistem
  kullaniciAdi: string
  not?: string
}

/**
 * Mükellef listesinden deterministik örnek şifreler üretir. Bilinçli olarak bazı sistemler
 * eksik bırakılır (kasa ekranındaki "eksik" vurgusu için).
 */
export function planCredentialSeeds(
  mukellefler: Mukellef[],
  seed: number = DEFAULT_SEED
): PlainCredentialSeed[] {
  const faker = new Faker({ locale: [tr, en, base] })
  faker.seed(seed)
  faker.setDefaultRefDate(SEED_REF_DATE)
  const password = () =>
    faker.internet.password({ length: 10, memorable: false })

  return mukellefler.flatMap((m, index) => {
    const seeds: PlainCredentialSeed[] = [
      {
        mukellefId: m.id,
        sistem: "GIB",
        kullaniciAdi: faker.string.numeric(8),
        sifre: password(),
        ekSifre: faker.string.numeric(6),
      },
    ]
    if (index % 4 !== 3) {
      seeds.push({
        mukellefId: m.id,
        sistem: "IVD",
        kullaniciAdi: m.vkn ?? m.tckn ?? "",
        sifre: password(),
      })
    }
    if (m.sgkIsyeriVar && index % 3 !== 2) {
      const kullaniciAdi = faker.string.numeric(11)
      seeds.push(
        {
          mukellefId: m.id,
          sistem: "SGK",
          kullaniciAdi,
          sifre: password(),
          ekSifre: password(),
        },
        {
          mukellefId: m.id,
          sistem: "EBILDIRGE",
          kullaniciAdi,
          sifre: password(),
          ekSifre: password(),
          not: "İşyeri kodu SGK kartındaki ile aynı",
        }
      )
    }
    return seeds
  })
}

/** Kasa meta'sını oluşturur ve verilen düz kayıtları şifreleyerek DB'ye yazar. */
export async function initVault(
  masterPassword: string,
  seeds: PlainCredentialSeed[],
  iterations: number = KDF_ITERATIONS
) {
  const salt = generateSalt()
  const key = await deriveKey(masterPassword, salt, iterations)
  const now = new Date().toISOString()

  const encrypted = await Promise.all(
    seeds.map(
      async ({ mukellefId, sistem, kullaniciAdi, not, sifre, ekSifre }) => ({
        mukellefId,
        sistem,
        kullaniciAdi,
        not,
        ...(await encryptJson(
          { sifre, ekSifre } satisfies CredentialSecret,
          key
        )),
      })
    )
  )

  const guncelleyenId =
    db.personel.all().find((p) => p.rol === "YONETICI")?.id ?? "p_1"
  for (const row of encrypted) {
    db.credential.insert({ ...row, sonGuncelleme: now, guncelleyenId })
  }
  db.kasa.insert({
    salt,
    iterations,
    verifier: await createVerifier(key),
    olusturmaTarihi: now,
  })
}

let pending: Promise<void> | null = null

/** Kasa yoksa demo şifresiyle oluşturur. Eşzamanlı çağrılar aynı işlemi bekler. */
export function ensureVault(): Promise<void> {
  if (db.kasa.count() > 0) return Promise.resolve()
  pending ??= initVault(
    DEMO_KASA_SIFRESI,
    planCredentialSeeds(db.mukellef.all())
  ).finally(() => {
    pending = null
  })
  return pending
}
